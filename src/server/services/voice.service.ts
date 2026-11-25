import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  extractVoiceIntent,
  type VoiceIntentRunner,
} from "@/server/ai/voice-intent.service";
import {
  READ_ONLY_INTENTS,
  updateVoiceDraftSchema,
  voiceDraftStateSchema,
  type ResolvedVoiceItem,
  type UpdateVoiceDraftInput,
  type VoiceDraftState,
  type VoiceInputMode,
  type VoiceIntent,
  type VoiceLanguage,
} from "@/server/ai/voice-schemas";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  mulDecimals,
  roundMoney,
  roundStock,
  sumDecimals,
} from "@/server/utils/decimal";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { analyticsService } from "./analytics.service";
import { resolveAnalyticsDateRange } from "./analytics/date-range";
import { expenseAnalyticsService } from "./analytics/expense-analytics.service";
import { customerService } from "./customer.service";
import { inventoryService } from "./inventory.service";
import { ledgerService } from "./ledger.service";
import { paymentService } from "./payment.service";
import { purchaseService } from "./purchase.service";
import { salesService } from "./sales.service";
import { transactionService } from "./transaction.service";
import { voiceEntityResolutionService } from "./voice-entity-resolution.service";

export interface VoiceServiceDeps {
  db?: PrismaClient;
  intentRunner?: VoiceIntentRunner;
}

export interface SerializedVoiceCommand {
  id: string;
  businessId: string;
  inputMode: VoiceInputMode;
  selectedLanguage: VoiceLanguage;
  transcript: string;
  interpretedIntent: string | null;
  commandStatus: string;
  resultSummary: string | null;
  failureReason: string | null;
  relatedTransactionId: string | null;
  draft: VoiceDraftState | null;
  createdAt: string;
  executedAt: string | null;
}

function parseDraft(raw: unknown): VoiceDraftState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = voiceDraftStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function serializeVoiceCommand(cmd: {
  id: string;
  businessId: string;
  inputMode: VoiceInputMode;
  selectedLanguage: VoiceLanguage;
  transcript: string;
  interpretedIntent: string | null;
  extractedEntities: unknown;
  commandStatus: string;
  resultSummary: string | null;
  failureReason: string | null;
  relatedTransactionId: string | null;
  createdAt: Date;
  executedAt: Date | null;
}): SerializedVoiceCommand {
  return {
    id: cmd.id,
    businessId: cmd.businessId,
    inputMode: cmd.inputMode,
    selectedLanguage: cmd.selectedLanguage,
    transcript: cmd.transcript,
    interpretedIntent: cmd.interpretedIntent,
    commandStatus: cmd.commandStatus,
    resultSummary: cmd.resultSummary,
    failureReason: cmd.failureReason,
    relatedTransactionId: cmd.relatedTransactionId,
    draft: parseDraft(cmd.extractedEntities),
    createdAt: cmd.createdAt.toISOString(),
    executedAt: cmd.executedAt ? cmd.executedAt.toISOString() : null,
  };
}

function pickMessage(
  lang: VoiceLanguage,
  messages: { EN: string; HI: string; HINGLISH: string }
): string {
  return messages[lang] ?? messages.HINGLISH;
}

function recalculateDraftTotals(draft: VoiceDraftState): VoiceDraftState {
  if (draft.intent === "RECORD_EXPENSE") {
    return {
      ...draft,
      calculatedTotal: roundMoney(draft.expenseAmount ?? 0).toNumber(),
    };
  }

  const lineTotals = draft.items.map((item) => {
    const qty = roundStock(item.quantity);
    const price = roundMoney(item.unitPrice);
    const total = roundMoney(mulDecimals(qty, price));
    return {
      ...item,
      quantity: decimalToNumber(qty),
      unitPrice: decimalToNumber(price),
      lineTotal: decimalToNumber(total),
    };
  });

  const calculatedTotal = decimalToNumber(
    roundMoney(sumDecimals(lineTotals.map((i) => i.lineTotal)))
  );

  return {
    ...draft,
    items: lineTotals,
    calculatedTotal,
  };
}

/**
 * Evaluates whether a draft has all required entities/fields or needs clarification.
 */
function evaluateDraftReadiness(
  draft: VoiceDraftState,
  lang: VoiceLanguage
): {
  ready: boolean;
  missingInformation: string[];
  clarificationQuestion: string | null;
} {
  const missing: string[] = [];
  let question: string | null = draft.clarificationQuestion;

  switch (draft.intent) {
    case "CHECK_STOCK": {
      if (draft.items.length === 0 || !draft.items[0].resolvedProductId) {
        if (draft.items[0]?.candidates.length) {
          missing.push("productSelection");
          question = pickMessage(lang, {
            EN: `Multiple products matched "${draft.items[0].sourceName}". Please choose one.`,
            HI: `"${draft.items[0].sourceName}" से मिलते-जुलते कई प्रोडक्ट मिले हैं। कृपया सही प्रोडक्ट चुनें।`,
            HINGLISH: `"${draft.items[0].sourceName}" se milte-julte kai products mile hain. Kripya sahi product select karein.`,
          });
        } else {
          missing.push("productName");
          question = pickMessage(lang, {
            EN: "Which product's stock would you like to check?",
            HI: "आपको किस प्रोडक्ट का स्टॉक चेक करना है?",
            HINGLISH: "Aapko kis product ka stock check karna hai?",
          });
        }
      }
      break;
    }

    case "ADD_STOCK": {
      const item = draft.items[0];
      if (!item || !item.resolvedProductId) {
        missing.push("productName");
        question =
          item?.candidates.length
            ? pickMessage(lang, {
                EN: `Multiple products matched "${item.sourceName}". Please select the exact product.`,
                HI: `"${item.sourceName}" के कई विकल्प मिले हैं। कृपया सही प्रोडक्ट चुनें।`,
                HINGLISH: `"${item.sourceName}" ke kai options mile hain. Kripya sahi product chunein.`,
              })
            : pickMessage(lang, {
                EN: "Which product should be added to inventory?",
                HI: "स्टॉक में कौनसा प्रोडक्ट जोड़ना है?",
                HINGLISH: "Kaunsa product stock mein add karna hai?",
              });
      } else if (item.quantity <= 0) {
        missing.push("quantity");
        question = pickMessage(lang, {
          EN: `How many ${item.unit} of ${item.resolvedProductName} do you want to add?`,
          HI: `${item.resolvedProductName} की कितनी मात्रा जोड़नी है?`,
          HINGLISH: `${item.resolvedProductName} ke kitne ${item.unit} add karne hain?`,
        });
      }
      break;
    }

    case "RECORD_SALE": {
      if (draft.items.length === 0) {
        missing.push("items");
        question = pickMessage(lang, {
          EN: "Which products and quantities are included in this sale?",
          HI: "इस बिक्री में कौनसे प्रोडक्ट और कितनी मात्रा है?",
          HINGLISH: "Is sale mein kaunse products aur kitni quantity hai?",
        });
      } else {
        const unresolved = draft.items.find((i) => !i.resolvedProductId);
        if (unresolved) {
          missing.push("productSelection");
          question =
            unresolved.candidates.length > 0
              ? pickMessage(lang, {
                  EN: `Please select the exact catalog product for "${unresolved.sourceName}".`,
                  HI: `कृपया "${unresolved.sourceName}" के लिए सही प्रोडक्ट चुनें।`,
                  HINGLISH: `Kripya "${unresolved.sourceName}" ke liye sahi catalog product select karein.`,
                })
              : pickMessage(lang, {
                  EN: `Product "${unresolved.sourceName}" was not found in your catalog.`,
                  HI: `"${unresolved.sourceName}" आपके कैटलॉग में नहीं मिला।`,
                  HINGLISH: `"${unresolved.sourceName}" aapke catalog mein nahi mila.`,
                });
        } else {
          // Check stock availability
          const lowItem = draft.items.find(
            (i) => i.availableStock !== null && i.quantity > i.availableStock
          );
          if (lowItem) {
            missing.push("sufficientStock");
            question = pickMessage(lang, {
              EN: `Available stock for ${lowItem.resolvedProductName} is only ${lowItem.availableStock} ${lowItem.unit}.`,
              HI: `${lowItem.resolvedProductName} का उपलब्ध स्टॉक सिर्फ ${lowItem.availableStock} ${lowItem.unit} है।`,
              HINGLISH: `${lowItem.resolvedProductName} ka available stock sirf ${lowItem.availableStock} ${lowItem.unit} hai.`,
            });
          } else if (draft.customerCandidates.length > 1 && !draft.resolvedCustomerId) {
            missing.push("customerSelection");
            question = pickMessage(lang, {
              EN: "Multiple matching customers found. Please select the intended customer.",
              HI: "मिलते-जुलते नाम के कई ग्राहक मिले हैं। कृपया सही ग्राहक चुनें।",
              HINGLISH: "Ek hi naam ke kai customers mile hain. Kripya sahi customer select karein.",
            });
          }
        }
      }
      break;
    }

    case "RECORD_PURCHASE": {
      if (!draft.resolvedSupplierId) {
        missing.push("supplierSelection");
        question =
          draft.supplierCandidates.length > 1
            ? pickMessage(lang, {
                EN: "Multiple suppliers matched. Please choose the supplier.",
                HI: "कई सप्लायर मिले हैं। कृपया सही सप्लायर चुनें।",
                HINGLISH: "Kai suppliers match hue hain. Kripya sahi supplier chunein.",
              })
            : pickMessage(lang, {
                EN: "Which supplier is this purchase from?",
                HI: "यह खरीदारी किस सप्लायर से की गई है?",
                HINGLISH: "Yeh purchase kis supplier se hai?",
              });
      } else if (
        draft.items.length === 0 ||
        draft.items.some((i) => !i.resolvedProductId)
      ) {
        missing.push("productSelection");
        question = pickMessage(lang, {
          EN: "Please select the catalog products for this purchase.",
          HI: "कृपया इस खरीदारी के लिए सही प्रोडक्ट चुनें।",
          HINGLISH: "Kripya is purchase ke liye sahi products select karein.",
        });
      }
      break;
    }

    case "CHECK_CUSTOMER_DUES":
    case "GET_CUSTOMER_TRANSACTIONS": {
      if (draft.customerCandidates.length > 1 && !draft.resolvedCustomerId) {
        missing.push("customerSelection");
        question = pickMessage(lang, {
          EN: "Multiple customers matched. Which customer did you mean?",
          HI: "एक ही नाम के कई ग्राहक हैं। आप किस ग्राहक की बात कर रहे हैं?",
          HINGLISH: "Ek hi naam ke kai customers hain. Aap kis customer ki baat kar rahe hain?",
        });
      }
      break;
    }

    case "RECORD_PAYMENT": {
      if (!draft.resolvedCustomerId) {
        missing.push("customerSelection");
        question =
          draft.customerCandidates.length > 1
            ? pickMessage(lang, {
                EN: "Multiple customers matched. Please select who made the payment.",
                HI: "कई ग्राहक मिले हैं। कृपया चुनें कि पेमेंट किसने दिया है।",
                HINGLISH: "Kai customers mile hain. Kripya select karein payment kisne diya.",
              })
            : pickMessage(lang, {
                EN: "Which customer made this payment?",
                HI: "यह पेमेंट किस ग्राहक ने दिया है?",
                HINGLISH: "Yeh payment kis customer ne diya hai?",
              });
      } else if (!draft.paymentAmount || draft.paymentAmount <= 0) {
        missing.push("paymentAmount");
        question = pickMessage(lang, {
          EN: `How much did ${draft.resolvedCustomerName} pay?`,
          HI: `${draft.resolvedCustomerName} ने कितने रुपये दिए?`,
          HINGLISH: `${draft.resolvedCustomerName} ne kitne rupaye diye?`,
        });
      } else if (
        draft.customerOutstandingDue !== null &&
        draft.paymentAmount > draft.customerOutstandingDue
      ) {
        missing.push("validPaymentAmount");
        question = pickMessage(lang, {
          EN: `${draft.resolvedCustomerName} only owes ₹${draft.customerOutstandingDue}. Payment cannot exceed outstanding dues.`,
          HI: `${draft.resolvedCustomerName} का कुल बकाया सिर्फ ₹${draft.customerOutstandingDue} है। इससे अधिक पेमेंट दर्ज नहीं किया जा सकता।`,
          HINGLISH: `${draft.resolvedCustomerName} ka total udhaar sirf ₹${draft.customerOutstandingDue} hai. Isse zyada payment record nahi ho sakta.`,
        });
      }
      break;
    }

    case "RECORD_EXPENSE": {
      if (!draft.expenseAmount || draft.expenseAmount <= 0) {
        missing.push("expenseAmount");
        question = pickMessage(lang, {
          EN: "What is the expense amount?",
          HI: "खर्च की राशि कितनी है?",
          HINGLISH: "Expense ka amount kitna hai?",
        });
      } else if (!draft.expenseDescription && !draft.expenseCategory) {
        missing.push("expenseDescription");
        question = pickMessage(lang, {
          EN: "What was this expense for?",
          HI: "यह खर्च किस चीज़ के लिए था?",
          HINGLISH: "Yeh expense kis cheez ke liye tha?",
        });
      }
      break;
    }

    default:
      break;
  }

  return {
    ready: missing.length === 0,
    missingInformation: missing,
    clarificationQuestion: missing.length > 0 ? question : null,
  };
}

async function executeReadOnlyDraft(
  businessId: string,
  draft: VoiceDraftState,
  prisma: PrismaClient
): Promise<{ summaryText: string; updatedDraft: VoiceDraftState }> {
  const lang = draft.language;

  switch (draft.intent) {
    case "CHECK_STOCK": {
      const item = draft.items[0];
      const stock = await inventoryService.getAvailableStock(
        businessId,
        item.resolvedProductId!,
        prisma
      );
      const prod = await prisma.product.findFirst({
        where: { id: item.resolvedProductId!, businessId },
      });
      const minStock = prod ? decimalToNumber(prod.minimumStock) : 0;
      const isLow = stock <= minStock;

      const summaryText = pickMessage(lang, {
        EN: `${item.resolvedProductName} has ${stock} ${item.unit} available${
          isLow ? " (Low stock alert)" : ""
        }.`,
        HI: `${item.resolvedProductName} के ${stock} ${item.unit} उपलब्ध हैं${
          isLow ? " (स्टॉक कम है)" : ""
        }।`,
        HINGLISH: `${item.resolvedProductName} ke ${stock} ${item.unit} available hain${
          isLow ? " (Low stock alert)" : ""
        }.`,
      });
      return {
        summaryText,
        updatedDraft: { ...draft, assistantMessage: summaryText },
      };
    }

    case "GET_LOW_STOCK": {
      const low = await inventoryService.getLowStockProducts(businessId, prisma);
      if (low.length === 0) {
        const summaryText = pickMessage(lang, {
          EN: "All products are currently above minimum stock levels.",
          HI: "सभी प्रोडक्ट पर्याप्त स्टॉक में हैं।",
          HINGLISH: "Sabhi products sufficient stock mein hain.",
        });
        return {
          summaryText,
          updatedDraft: { ...draft, assistantMessage: summaryText },
        };
      }
      const list = low
        .slice(0, 5)
        .map((p) => `${p.name} (${p.currentStock} ${p.unit})`)
        .join(", ");
      const summaryText = pickMessage(lang, {
        EN: `${low.length} product(s) are low on stock: ${list}.`,
        HI: `${low.length} प्रोडक्ट का स्टॉक कम है: ${list}।`,
        HINGLISH: `${low.length} products ka stock kam ho raha hai: ${list}.`,
      });
      return {
        summaryText,
        updatedDraft: { ...draft, assistantMessage: summaryText },
      };
    }

    case "CHECK_CUSTOMER_DUES": {
      if (draft.resolvedCustomerId) {
        const due = await ledgerService.getCustomerBalance(
          businessId,
          draft.resolvedCustomerId,
          prisma
        );
        const summaryText = pickMessage(lang, {
          EN: `${draft.resolvedCustomerName} has ₹${due} pending dues.`,
          HI: `${draft.resolvedCustomerName} का ₹${due} उधार बाकी है।`,
          HINGLISH: `${draft.resolvedCustomerName} ka ₹${due} udhaar baaki hai.`,
        });
        return {
          summaryText,
          updatedDraft: {
            ...draft,
            customerOutstandingDue: due,
            assistantMessage: summaryText,
          },
        };
      }

      // List customers with highest pending dues
      const pending = await customerService.listCustomers(
        businessId,
        { onlyWithDue: true },
        prisma
      );
      pending.sort((a, b) => b.outstandingDue - a.outstandingDue);
      if (pending.length === 0) {
        const summaryText = pickMessage(lang, {
          EN: "No customer has pending Udhaar right now.",
          HI: "अभी किसी भी ग्राहक का उधार बाकी नहीं है।",
          HINGLISH: "Abhi kisi customer ka udhaar pending nahi hai.",
        });
        return {
          summaryText,
          updatedDraft: { ...draft, assistantMessage: summaryText },
        };
      }
      const top = pending
        .slice(0, 3)
        .map((c) => `${c.name}: ₹${c.outstandingDue}`)
        .join(", ");
      const summaryText = pickMessage(lang, {
        EN: `Top pending dues: ${top}.`,
        HI: `सबसे ज़्यादा उधार वाले ग्राहक: ${top}।`,
        HINGLISH: `Sabse zyada pending udhaar: ${top}.`,
      });
      return {
        summaryText,
        updatedDraft: { ...draft, assistantMessage: summaryText },
      };
    }

    case "GET_SALES_SUMMARY": {
      const period = draft.datePeriod ?? "TODAY";
      const summary = await analyticsService.getSalesSummaryForPeriod(
        businessId,
        period,
        "Asia/Kolkata",
        prisma
      );
      const labelMap = {
        TODAY: { EN: "Today's", HI: "आज की", HINGLISH: "Aaj ki" },
        YESTERDAY: { EN: "Yesterday's", HI: "कल की", HINGLISH: "Kal ki" },
        THIS_WEEK: { EN: "This week's", HI: "इस हफ्ते की", HINGLISH: "Is week ki" },
        THIS_MONTH: { EN: "This month's", HI: "इस महीने की", HINGLISH: "Is month ki" },
      }[period];

      const growthNote =
        summary.salesGrowthPct !== null && summary.previousNetSales > 0
          ? summary.salesGrowthPct >= 0
            ? ` (+${summary.salesGrowthPct}% vs previous period)`
            : ` (${summary.salesGrowthPct}% vs previous period)`
          : "";

      const summaryText = pickMessage(lang, {
        EN: `${labelMap.EN} total sales: ₹${summary.totalSales} across ${summary.transactionCount} bill(s) (Collected: ₹${summary.totalCollected}, Udhaar: ₹${summary.totalCredit})${growthNote}.`,
        HI: `${labelMap.HI} कुल बिक्री: ₹${summary.totalSales} (${summary.transactionCount} बिल, नकद/UPI प्राप्त: ₹${summary.totalCollected}, उधार: ₹${summary.totalCredit})${growthNote}।`,
        HINGLISH: `${labelMap.HINGLISH} total sales ₹${summary.totalSales} hui hain (${summary.transactionCount} bills, collected: ₹${summary.totalCollected}, udhaar: ₹${summary.totalCredit})${growthNote}.`,
      });
      return {
        summaryText,
        updatedDraft: {
          ...draft,
          calculatedTotal: summary.totalSales,
          assistantMessage: summaryText,
        },
      };
    }

    case "GET_EXPENSE_SUMMARY": {
      const period = draft.datePeriod ?? "THIS_MONTH";
      const presetMap = {
        TODAY: "TODAY",
        YESTERDAY: "YESTERDAY",
        THIS_WEEK: "LAST_7_DAYS",
        THIS_MONTH: "THIS_MONTH",
      } as const;
      const range = resolveAnalyticsDateRange({ preset: presetMap[period] });
      const expenses = await expenseAnalyticsService.getExpenseAnalytics(
        businessId,
        range,
        {},
        prisma
      );
      const summaryText = pickMessage(lang, {
        EN: `Total expenses for ${range.label.toLowerCase()}: ₹${expenses.summary.totalExpenses} across ${expenses.summary.transactionCount} record(s).`,
        HI: `${range.label} में कुल खर्च: ₹${expenses.summary.totalExpenses} (${expenses.summary.transactionCount} एंट्री)।`,
        HINGLISH: `${range.label} mein total expense ₹${expenses.summary.totalExpenses} hua hai (${expenses.summary.transactionCount} entries).`,
      });
      return {
        summaryText,
        updatedDraft: {
          ...draft,
          calculatedTotal: expenses.summary.totalExpenses,
          assistantMessage: summaryText,
        },
      };
    }

    case "GET_CUSTOMER_TRANSACTIONS": {
      if (!draft.resolvedCustomerId) {
        const summaryText = pickMessage(lang, {
          EN: "Please specify a customer name to view transactions.",
          HI: "लेन-देन देखने के लिए कृपया ग्राहक का नाम बताएं।",
          HINGLISH: "Transactions dekhne ke liye customer ka naam batayein.",
        });
        return {
          summaryText,
          updatedDraft: { ...draft, assistantMessage: summaryText },
        };
      }
      const profile = await customerService.getCustomerById(
        businessId,
        draft.resolvedCustomerId,
        prisma
      );
      const recent = profile.transactions.slice(0, 3);
      const details =
        recent.length > 0
          ? recent
              .map(
                (t) =>
                  `${t.referenceNumber ?? t.id.slice(0, 6)} (₹${t.totalAmount}, ${t.paymentStatus})`
              )
              .join(", ")
          : "None";
      const summaryText = pickMessage(lang, {
        EN: `${profile.name} has ${profile.transactions.length} bill(s) and ₹${profile.outstandingDue} pending. Recent: ${details}.`,
        HI: `${profile.name} के ${profile.transactions.length} बिल हैं और ₹${profile.outstandingDue} बाकी हैं। हालिया बिल: ${details}।`,
        HINGLISH: `${profile.name} ke ${profile.transactions.length} bills hain aur ₹${profile.outstandingDue} udhaar baaki hai. Recent: ${details}.`,
      });
      return {
        summaryText,
        updatedDraft: { ...draft, assistantMessage: summaryText },
      };
    }

    case "GET_REVENUE_REPORT": {
      const period = draft.datePeriod ?? "THIS_WEEK";
      const [summary, topProducts] = await Promise.all([
        analyticsService.getSalesSummaryForPeriod(
          businessId,
          period,
          "Asia/Kolkata",
          prisma
        ),
        analyticsService.getTopSellingProducts(
          businessId,
          period === "THIS_MONTH" ? 30 : 7,
          3,
          prisma
        ),
      ]);
      const topText =
        topProducts.length > 0
          ? topProducts.map((p) => `${p.name} (₹${p.revenue})`).join(", ")
          : "No product sales yet";
      const summaryText = pickMessage(lang, {
        EN: `Revenue for ${period.toLowerCase().replace("_", " ")}: ₹${summary.totalSales} (${summary.transactionCount} bills). Top items: ${topText}.`,
        HI: `कुल रेवेन्यू: ₹${summary.totalSales} (${summary.transactionCount} बिल)। प्रमुख प्रोडक्ट: ${topText}।`,
        HINGLISH: `Total revenue ₹${summary.totalSales} hua hai (${summary.transactionCount} bills). Top products: ${topText}.`,
      });
      return {
        summaryText,
        updatedDraft: {
          ...draft,
          calculatedTotal: summary.totalSales,
          assistantMessage: summaryText,
        },
      };
    }

    default:
      throw new ValidationError("Unsupported read-only command.");
  }
}

export const voiceService = {
  async interpretCommand(
    businessId: string,
    input: {
      transcript: string;
      language: VoiceLanguage;
      inputMode: VoiceInputMode;
    },
    deps: VoiceServiceDeps = {}
  ): Promise<SerializedVoiceCommand> {
    const prisma = deps.db ?? requirePrisma();
    const idempotencyKey = randomUUID();

    const created = await prisma.voiceCommand.create({
      data: {
        businessId,
        inputMode: input.inputMode,
        selectedLanguage: input.language,
        transcript: input.transcript,
        commandStatus: "INTERPRETING",
        idempotencyKey,
      },
    });

    try {
      const extracted = await extractVoiceIntent(
        { transcript: input.transcript, language: input.language },
        deps.intentRunner
      );

      if (extracted.intent === "UNSUPPORTED") {
        const msg = pickMessage(input.language, {
          EN: "Sorry, that request is outside supported BizSaathi operations (stock, sales, purchases, Udhaar payments, expenses, and summaries).",
          HI: "माफ़ कीजिए, यह कमांड अभी BizSaathi में समर्थित नहीं है। आप स्टॉक, बिक्री, खरीदारी, उधार पेमेंट या खर्च के बारे में बोल सकते हैं।",
          HINGLISH:
            "Maaf kijiye, yeh command abhi supported nahi hai. Aap stock, sale, purchase, udhaar payment, ya expense ke baare mein bol sakte hain.",
        });

        const updated = await prisma.voiceCommand.update({
          where: { id: created.id },
          data: {
            interpretedIntent: "UNSUPPORTED",
            commandStatus: "FAILED",
            failureReason: msg,
            resultSummary: msg,
          },
        });
        return serializeVoiceCommand(updated);
      }

      // Build resolved items list from extracted items or single productName/quantity
      const rawItems =
        extracted.entities.items.length > 0
          ? extracted.entities.items
          : extracted.entities.productName
          ? [
              {
                productName: extracted.entities.productName,
                quantity: extracted.entities.quantity ?? 1,
                unit: extracted.entities.unit,
                unitPrice: extracted.entities.unitPrice,
              },
            ]
          : [];

      const resolvedItems: ResolvedVoiceItem[] = [];
      for (const item of rawItems) {
        const res = await voiceEntityResolutionService.resolveProduct(
          businessId,
          item.productName,
          prisma
        );
        const unitPrice =
          extracted.intent === "RECORD_PURCHASE"
            ? item.unitPrice ?? res.resolvedProduct?.purchasePrice ?? 0
            : res.resolvedProduct?.sellingPrice ?? item.unitPrice ?? 0;

        resolvedItems.push({
          sourceName: item.productName,
          resolvedProductId: res.resolvedProduct?.id ?? null,
          resolvedProductName: res.resolvedProduct?.name ?? null,
          unit: res.resolvedProduct?.unit ?? item.unit ?? "pcs",
          quantity: item.quantity,
          unitPrice,
          availableStock: res.resolvedProduct?.currentStock ?? null,
          lineTotal: decimalToNumber(
            roundMoney(mulDecimals(item.quantity, unitPrice))
          ),
          candidates: res.candidates,
        });
      }

      // Resolve customer if present
      let resolvedCustomerId: string | null = null;
      let resolvedCustomerName: string | null = extracted.entities.customerName;
      let customerOutstandingDue: number | null = null;
      let customerCandidates: VoiceDraftState["customerCandidates"] = [];

      if (extracted.entities.customerName) {
        const custRes = await voiceEntityResolutionService.resolveCustomer(
          businessId,
          extracted.entities.customerName,
          prisma
        );
        resolvedCustomerId = custRes.resolvedParty?.id ?? null;
        resolvedCustomerName =
          custRes.resolvedParty?.name ?? extracted.entities.customerName;
        customerCandidates = custRes.candidates;
        if (resolvedCustomerId) {
          customerOutstandingDue = await ledgerService.getCustomerBalance(
            businessId,
            resolvedCustomerId,
            prisma
          );
        }
      }

      // Resolve supplier if present
      let resolvedSupplierId: string | null = null;
      let resolvedSupplierName: string | null = extracted.entities.supplierName;
      let supplierCandidates: VoiceDraftState["supplierCandidates"] = [];

      if (extracted.entities.supplierName) {
        const supRes = await voiceEntityResolutionService.resolveSupplier(
          businessId,
          extracted.entities.supplierName,
          prisma
        );
        resolvedSupplierId = supRes.resolvedParty?.id ?? null;
        resolvedSupplierName =
          supRes.resolvedParty?.name ?? extracted.entities.supplierName;
        supplierCandidates = supRes.candidates;
      }

      const isReadOnly = READ_ONLY_INTENTS.has(extracted.intent);

      let draft: VoiceDraftState = recalculateDraftTotals({
        intent: extracted.intent,
        language: input.language,
        isReadOnly,
        items: resolvedItems,
        resolvedCustomerId,
        resolvedCustomerName,
        customerOutstandingDue,
        customerCandidates,
        resolvedSupplierId,
        resolvedSupplierName,
        supplierCandidates,
        paymentAmount: extracted.entities.paymentAmount,
        paymentMethod: extracted.entities.paymentMethod,
        expenseAmount: extracted.entities.expenseAmount,
        expenseCategory: extracted.entities.expenseCategory,
        expenseDescription: extracted.entities.expenseDescription,
        datePeriod: extracted.entities.datePeriod,
        adjustmentReason: extracted.entities.adjustmentReason,
        calculatedTotal: 0,
        missingInformation: extracted.missingInformation,
        clarificationQuestion: extracted.clarificationQuestion,
        assistantMessage: extracted.responseText,
      });

      const readiness = evaluateDraftReadiness(draft, input.language);
      draft = {
        ...draft,
        missingInformation: readiness.missingInformation,
        clarificationQuestion: readiness.clarificationQuestion,
      };

      if (!readiness.ready || extracted.clarificationRequired) {
        const msg =
          readiness.clarificationQuestion ??
          extracted.clarificationQuestion ??
          extracted.responseText;
        draft.assistantMessage = msg;

        const updated = await prisma.voiceCommand.update({
          where: { id: created.id },
          data: {
            interpretedIntent: extracted.intent,
            extractedEntities: draft as unknown as Prisma.InputJsonValue,
            commandStatus: "NEEDS_CLARIFICATION",
            resultSummary: msg,
          },
        });
        return serializeVoiceCommand(updated);
      }

      if (isReadOnly) {
        const { summaryText, updatedDraft } = await executeReadOnlyDraft(
          businessId,
          draft,
          prisma
        );
        const updated = await prisma.voiceCommand.update({
          where: { id: created.id },
          data: {
            interpretedIntent: extracted.intent,
            extractedEntities: updatedDraft as unknown as Prisma.InputJsonValue,
            commandStatus: "EXECUTED",
            resultSummary: summaryText,
            executedAt: new Date(),
          },
        });
        return serializeVoiceCommand(updated);
      }

      // Write command ready for user confirmation
      const updated = await prisma.voiceCommand.update({
        where: { id: created.id },
        data: {
          interpretedIntent: extracted.intent,
          extractedEntities: draft as unknown as Prisma.InputJsonValue,
          commandStatus: "AWAITING_CONFIRMATION",
          resultSummary: draft.assistantMessage,
        },
      });
      return serializeVoiceCommand(updated);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Failed to interpret command.";
      const failed = await prisma.voiceCommand.update({
        where: { id: created.id },
        data: {
          commandStatus: "FAILED",
          failureReason: reason,
        },
      });
      return serializeVoiceCommand(failed);
    }
  },

  async getCommandById(
    businessId: string,
    commandId: string,
    deps: VoiceServiceDeps = {}
  ): Promise<SerializedVoiceCommand> {
    const prisma = deps.db ?? requirePrisma();
    const cmd = await prisma.voiceCommand.findFirst({
      where: { id: commandId, businessId },
    });
    if (!cmd) {
      throw new NotFoundError("Voice command not found.");
    }
    return serializeVoiceCommand(cmd);
  },

  async listCommands(
    businessId: string,
    filters: { page?: number; pageSize?: number; status?: string } = {},
    deps: VoiceServiceDeps = {}
  ) {
    const prisma = deps.db ?? requirePrisma();
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.VoiceCommandWhereInput = {
      businessId,
      ...(filters.status
        ? {
            commandStatus: filters.status as
              | "RECEIVED"
              | "INTERPRETING"
              | "NEEDS_CLARIFICATION"
              | "AWAITING_CONFIRMATION"
              | "EXECUTED"
              | "CANCELLED"
              | "FAILED",
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.voiceCommand.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.voiceCommand.count({ where }),
    ]);

    return {
      items: items.map(serializeVoiceCommand),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  },

  async updateCommandDraft(
    businessId: string,
    commandId: string,
    rawInput: unknown,
    deps: VoiceServiceDeps = {}
  ): Promise<SerializedVoiceCommand> {
    const prisma = deps.db ?? requirePrisma();
    const input: UpdateVoiceDraftInput = updateVoiceDraftSchema.parse(rawInput);

    const existing = await prisma.voiceCommand.findFirst({
      where: { id: commandId, businessId },
    });
    if (!existing) {
      throw new NotFoundError("Voice command not found.");
    }
    if (
      existing.commandStatus === "EXECUTED" ||
      existing.commandStatus === "CANCELLED"
    ) {
      throw new ConflictError(
        `Cannot update command in ${existing.commandStatus} state.`
      );
    }

    const currentDraft = parseDraft(existing.extractedEntities);
    if (!currentDraft) {
      throw new ValidationError("Command has no editable draft.");
    }

    let nextItems = currentDraft.items;
    if (input.items) {
      nextItems = [];
      for (const patch of input.items) {
        let resolvedProduct: {
          id: string;
          name: string;
          unit: string;
          purchasePrice: Prisma.Decimal;
          sellingPrice: Prisma.Decimal;
          currentStock: Prisma.Decimal;
        } | null = null;
        if (patch.resolvedProductId) {
          resolvedProduct = await prisma.product.findFirst({
            where: { id: patch.resolvedProductId, businessId, isActive: true },
          });
          if (!resolvedProduct) {
            throw new NotFoundError("Selected product not found.");
          }
        }
        const unitPrice = resolvedProduct
          ? currentDraft.intent === "RECORD_PURCHASE"
            ? patch.unitPrice ?? decimalToNumber(resolvedProduct.purchasePrice)
            : decimalToNumber(resolvedProduct.sellingPrice)
          : patch.unitPrice ?? 0;

        nextItems.push({
          sourceName:
            patch.sourceName ?? resolvedProduct?.name ?? "Item",
          resolvedProductId: resolvedProduct?.id ?? null,
          resolvedProductName: resolvedProduct?.name ?? null,
          unit: resolvedProduct?.unit ?? "pcs",
          quantity: patch.quantity,
          unitPrice,
          availableStock: resolvedProduct
            ? decimalToNumber(resolvedProduct.currentStock)
            : null,
          lineTotal: decimalToNumber(
            roundMoney(mulDecimals(patch.quantity, unitPrice))
          ),
          candidates: [],
        });
      }
    }

    let resolvedCustomerId = currentDraft.resolvedCustomerId;
    let resolvedCustomerName = currentDraft.resolvedCustomerName;
    let customerOutstandingDue = currentDraft.customerOutstandingDue;

    if (input.resolvedCustomerId !== undefined) {
      if (input.resolvedCustomerId === null) {
        resolvedCustomerId = null;
        resolvedCustomerName = null;
        customerOutstandingDue = null;
      } else {
        const cust = await prisma.customer.findFirst({
          where: { id: input.resolvedCustomerId, businessId },
        });
        if (!cust) throw new NotFoundError("Selected customer not found.");
        resolvedCustomerId = cust.id;
        resolvedCustomerName = cust.name;
        customerOutstandingDue = await ledgerService.getCustomerBalance(
          businessId,
          cust.id,
          prisma
        );
      }
    }

    let resolvedSupplierId = currentDraft.resolvedSupplierId;
    let resolvedSupplierName = currentDraft.resolvedSupplierName;
    if (input.resolvedSupplierId !== undefined) {
      if (input.resolvedSupplierId === null) {
        resolvedSupplierId = null;
        resolvedSupplierName = null;
      } else {
        const sup = await prisma.supplier.findFirst({
          where: { id: input.resolvedSupplierId, businessId },
        });
        if (!sup) throw new NotFoundError("Selected supplier not found.");
        resolvedSupplierId = sup.id;
        resolvedSupplierName = sup.name;
      }
    }

    let nextDraft = recalculateDraftTotals({
      ...currentDraft,
      items: nextItems,
      resolvedCustomerId,
      resolvedCustomerName,
      customerOutstandingDue,
      resolvedSupplierId,
      resolvedSupplierName,
      paymentAmount:
        input.paymentAmount !== undefined
          ? input.paymentAmount
          : currentDraft.paymentAmount,
      paymentMethod:
        input.paymentMethod !== undefined
          ? input.paymentMethod
          : currentDraft.paymentMethod,
      expenseAmount:
        input.expenseAmount !== undefined
          ? input.expenseAmount
          : currentDraft.expenseAmount,
      expenseCategory:
        input.expenseCategory !== undefined
          ? input.expenseCategory
          : currentDraft.expenseCategory,
      expenseDescription:
        input.expenseDescription !== undefined
          ? input.expenseDescription
          : currentDraft.expenseDescription,
      adjustmentReason:
        input.adjustmentReason !== undefined
          ? input.adjustmentReason
          : currentDraft.adjustmentReason,
    });

    const readiness = evaluateDraftReadiness(nextDraft, nextDraft.language);
    nextDraft = {
      ...nextDraft,
      missingInformation: readiness.missingInformation,
      clarificationQuestion: readiness.clarificationQuestion,
    };

    if (!readiness.ready) {
      const updated = await prisma.voiceCommand.update({
        where: { id: commandId },
        data: {
          extractedEntities: nextDraft as unknown as Prisma.InputJsonValue,
          commandStatus: "NEEDS_CLARIFICATION",
          resultSummary: readiness.clarificationQuestion,
        },
      });
      return serializeVoiceCommand(updated);
    }

    if (nextDraft.isReadOnly) {
      const { summaryText, updatedDraft } = await executeReadOnlyDraft(
        businessId,
        nextDraft,
        prisma
      );
      const updated = await prisma.voiceCommand.update({
        where: { id: commandId },
        data: {
          extractedEntities: updatedDraft as unknown as Prisma.InputJsonValue,
          commandStatus: "EXECUTED",
          resultSummary: summaryText,
          executedAt: new Date(),
        },
      });
      return serializeVoiceCommand(updated);
    }

    const updated = await prisma.voiceCommand.update({
      where: { id: commandId },
      data: {
        extractedEntities: nextDraft as unknown as Prisma.InputJsonValue,
        commandStatus: "AWAITING_CONFIRMATION",
        resultSummary: nextDraft.assistantMessage,
      },
    });
    return serializeVoiceCommand(updated);
  },

  /**
   * Executes a server-stored write command after explicit user confirmation.
   * Revalidates entities, stock, and totals, prevents duplicate execution,
   * and delegates strictly to Phase 2 business services.
   */
  async confirmCommand(
    businessId: string,
    commandId: string,
    deps: VoiceServiceDeps = {}
  ): Promise<SerializedVoiceCommand> {
    const prisma = deps.db ?? requirePrisma();

    const existing = await prisma.voiceCommand.findFirst({
      where: { id: commandId, businessId },
    });
    if (!existing) {
      throw new NotFoundError("Voice command not found.");
    }

    if (existing.commandStatus === "EXECUTED") {
      throw new ConflictError("This voice command has already been executed.");
    }

    if (existing.commandStatus !== "AWAITING_CONFIRMATION") {
      throw new ConflictError(
        `Command cannot be confirmed from status ${existing.commandStatus}.`
      );
    }

    const draft = parseDraft(existing.extractedEntities);
    if (!draft) {
      throw new ValidationError("Command has no valid draft to execute.");
    }

    // Revalidate readiness & fresh catalog prices before execution
    const readiness = evaluateDraftReadiness(draft, draft.language);
    if (!readiness.ready) {
      throw new ValidationError(
        readiness.clarificationQuestion ?? "Command is missing required details."
      );
    }

    try {
      let relatedTransactionId: string | null = null;
      let summaryText = "";

      const intent = draft.intent as VoiceIntent;

      if (intent === "ADD_STOCK") {
        const item = draft.items[0];
        const updatedProd = await inventoryService.adjustStock(
          businessId,
          {
            productId: item.resolvedProductId!,
            movementType: "ADJUSTMENT_IN",
            quantity: item.quantity,
            notes: draft.adjustmentReason ?? "Voice assistant stock addition",
          },
          prisma
        );
        summaryText = pickMessage(draft.language, {
          EN: `Added ${item.quantity} ${item.unit} of ${updatedProd.name}. Current stock: ${updatedProd.currentStock} ${updatedProd.unit}.`,
          HI: `${updatedProd.name} के ${item.quantity} ${item.unit} इन्वेंटरी में जोड़ दिए गए हैं। अब कुल स्टॉक: ${updatedProd.currentStock} ${updatedProd.unit}।`,
          HINGLISH: `${item.quantity} ${item.unit} ${updatedProd.name} inventory mein add ho gaye hain. Current stock: ${updatedProd.currentStock} ${updatedProd.unit}.`,
        });
      } else if (intent === "RECORD_SALE") {
        // Re-fetch authoritative prices from DB (never trust stale or AI prices)
        const saleItems: Array<{ productId: string; quantity: number }> = [];
        for (const item of draft.items) {
          const prod = await prisma.product.findFirst({
            where: {
              id: item.resolvedProductId!,
              businessId,
              isActive: true,
            },
          });
          if (!prod) {
            throw new NotFoundError(
              `Product "${item.sourceName}" is no longer available.`
            );
          }
          saleItems.push({ productId: prod.id, quantity: item.quantity });
        }

        // Calculate paid amount: if customer selected and payment omitted -> 0 (Udhaar);
        // if walk-in and payment omitted -> full calculatedTotal
        const freshProds = await prisma.product.findMany({
          where: { id: { in: saleItems.map((i) => i.productId) }, businessId },
        });
        const prodMap = new Map(freshProds.map((p) => [p.id, p]));
        const authoritativeTotal = decimalToNumber(
          roundMoney(
            sumDecimals(
              saleItems.map((i) =>
                mulDecimals(i.quantity, prodMap.get(i.productId)!.sellingPrice)
              )
            )
          )
        );

        const paidAmount =
          draft.paymentAmount !== null
            ? draft.paymentAmount
            : draft.resolvedCustomerId
            ? 0
            : authoritativeTotal;

        const sale = await salesService.recordSale(
          businessId,
          {
            customerId: draft.resolvedCustomerId ?? undefined,
            items: saleItems,
            paidAmount,
            paymentMethod: draft.paymentMethod ?? "CASH",
            notes: `Voice command: ${existing.transcript}`,
          },
          prisma
        );
        relatedTransactionId = sale.id;
        summaryText = pickMessage(draft.language, {
          EN: `Sale ${sale.referenceNumber} recorded for ₹${sale.totalAmount} (Paid: ₹${sale.paidAmount}, Due: ₹${sale.outstandingAmount}).`,
          HI: `${draft.resolvedCustomerName ? `${draft.resolvedCustomerName} की ` : ""}बिक्री सफलतापूर्वक दर्ज हो गई है (कुल: ₹${sale.totalAmount}, भुगतान: ₹${sale.paidAmount}, बाकी: ₹${sale.outstandingAmount})।`,
          HINGLISH: `Haan, ${draft.resolvedCustomerName ? `${draft.resolvedCustomerName} ki ` : ""}sale successfully record ho gayi hai (Total: ₹${sale.totalAmount}, Paid: ₹${sale.paidAmount}, Udhaar: ₹${sale.outstandingAmount}).`,
        });
      } else if (intent === "RECORD_PURCHASE") {
        const purchase = await purchaseService.recordPurchase(
          businessId,
          {
            supplierId: draft.resolvedSupplierId!,
            items: draft.items.map((i) => ({
              productId: i.resolvedProductId!,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
            paidAmount: draft.paymentAmount ?? 0,
            paymentMethod: draft.paymentMethod ?? "CASH",
            notes: `Voice command: ${existing.transcript}`,
          },
          prisma
        );
        relatedTransactionId = purchase.id;
        summaryText = pickMessage(draft.language, {
          EN: `Purchase ${purchase.referenceNumber} recorded for ₹${purchase.totalAmount}.`,
          HI: `सप्लायर खरीदारी (₹${purchase.totalAmount}) सफलतापूर्वक दर्ज हो गई है।`,
          HINGLISH: `Purchase ${purchase.referenceNumber} (₹${purchase.totalAmount}) record ho gaya hai.`,
        });
      } else if (intent === "RECORD_PAYMENT") {
        const customerId = draft.resolvedCustomerId!;
        const amountToPay = roundMoney(draft.paymentAmount ?? 0);
        if (amountToPay.lte(0)) {
          throw new ValidationError("Payment amount must be positive.");
        }

        const openBills = await prisma.transaction.findMany({
          where: {
            businessId,
            customerId,
            transactionType: "SALE",
            status: "CONFIRMED",
            paymentStatus: { in: ["UNPAID", "PARTIAL"] },
          },
          orderBy: { transactionDate: "asc" },
        });

        const totalOpenDue = openBills.reduce(
          (sum, b) => sum + decimalToNumber(b.totalAmount) - decimalToNumber(b.paidAmount),
          0
        );
        if (amountToPay.gt(totalOpenDue + 0.01)) {
          throw new ValidationError(
            `Payment (₹${amountToPay.toString()}) exceeds customer's open bill dues (₹${totalOpenDue.toFixed(2)}).`
          );
        }

        let remainingToAllocate = decimalToNumber(amountToPay);
        let lastTxnId: string | null = null;
        for (const bill of openBills) {
          if (remainingToAllocate <= 0.009) break;
          const billDue = Number(
            (decimalToNumber(bill.totalAmount) - decimalToNumber(bill.paidAmount)).toFixed(2)
          );
          if (billDue <= 0) continue;
          const chunk = Math.min(remainingToAllocate, billDue);
          const paidTxn = await paymentService.recordPayment(
            businessId,
            {
              transactionId: bill.id,
              amount: chunk,
              paymentMethod: draft.paymentMethod ?? "CASH",
              notes: `Voice payment: ${existing.transcript}`,
            },
            prisma
          );
          lastTxnId = paidTxn.id;
          remainingToAllocate = Number((remainingToAllocate - chunk).toFixed(2));
        }

        const newBalance = await ledgerService.getCustomerBalance(
          businessId,
          customerId,
          prisma
        );
        relatedTransactionId = lastTxnId;
        summaryText = pickMessage(draft.language, {
          EN: `Recorded ₹${amountToPay.toString()} payment from ${draft.resolvedCustomerName}. Remaining Udhaar: ₹${newBalance}.`,
          HI: `${draft.resolvedCustomerName} का ₹${amountToPay.toString()} का पेमेंट दर्ज हो गया है। शेष बकाया: ₹${newBalance}।`,
          HINGLISH: `${draft.resolvedCustomerName} ka ₹${amountToPay.toString()} payment record ho gaya hai. Remaining udhaar: ₹${newBalance}.`,
        });
      } else if (intent === "RECORD_EXPENSE") {
        const expTxn = await prisma.$transaction((tx) =>
          transactionService.recordExpenseTx(tx, businessId, {
            description:
              draft.expenseDescription ?? draft.expenseCategory ?? "Shop Expense",
            category: draft.expenseCategory,
            totalAmount: draft.expenseAmount!,
            paidAmount: draft.expenseAmount!,
            paymentMethod: draft.paymentMethod ?? "CASH",
            notes: `Voice expense: ${existing.transcript}`,
          })
        );
        relatedTransactionId = expTxn.id;
        summaryText = pickMessage(draft.language, {
          EN: `Expense of ₹${expTxn.totalAmount} recorded.`,
          HI: `₹${expTxn.totalAmount} का खर्च दर्ज हो गया है।`,
          HINGLISH: `₹${expTxn.totalAmount} ka expense record ho gaya hai.`,
        });
      } else {
        throw new ValidationError(`Unsupported write intent: ${intent}`);
      }

      // Atomic conditional state transition to prevent duplicate execution
      const claim = await prisma.voiceCommand.updateMany({
        where: {
          id: commandId,
          businessId,
          commandStatus: "AWAITING_CONFIRMATION",
        },
        data: {
          commandStatus: "EXECUTED",
          resultSummary: summaryText,
          relatedTransactionId,
          executedAt: new Date(),
          extractedEntities: {
            ...draft,
            assistantMessage: summaryText,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (claim.count === 0) {
        throw new ConflictError(
          "Command was already executed or cancelled concurrently."
        );
      }

      const finalCmd = await prisma.voiceCommand.findUniqueOrThrow({
        where: { id: commandId },
      });
      return serializeVoiceCommand(finalCmd);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Failed to execute voice command.";
      await prisma.voiceCommand.update({
        where: { id: commandId },
        data: {
          commandStatus: "FAILED",
          failureReason: reason,
        },
      });
      throw err;
    }
  },

  async cancelCommand(
    businessId: string,
    commandId: string,
    deps: VoiceServiceDeps = {}
  ): Promise<SerializedVoiceCommand> {
    const prisma = deps.db ?? requirePrisma();
    const cmd = await prisma.voiceCommand.findFirst({
      where: { id: commandId, businessId },
    });
    if (!cmd) {
      throw new NotFoundError("Voice command not found.");
    }
    if (cmd.commandStatus === "EXECUTED") {
      throw new ConflictError("Executed commands cannot be cancelled.");
    }

    const updated = await prisma.voiceCommand.update({
      where: { id: commandId },
      data: {
        commandStatus: "CANCELLED",
        resultSummary: "Command cancelled by user.",
      },
    });
    return serializeVoiceCommand(updated);
  },
};
