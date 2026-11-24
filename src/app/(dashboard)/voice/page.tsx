"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";
import {
  createSpeechProvider,
  type SpeechLocale,
  type SpeechProvider,
  type SpeechRecognitionState,
} from "@/lib/speech/speech-provider";
import {
  isSpeechSynthesisSupported,
  speakResponse,
  stopSpeaking,
} from "@/lib/speech/speech-synthesis";
import type {
  VoiceDraftState,
  VoiceInputMode,
  VoiceLanguage,
} from "@/server/ai/voice-schemas";

type AssistantUiState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "TRANSCRIPT_READY"
  | "INTERPRETING"
  | "NEEDS_CLARIFICATION"
  | "AWAITING_CONFIRMATION"
  | "EXECUTING"
  | "SUCCESS"
  | "ERROR";

interface VoiceCommandRecord {
  id: string;
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
}

interface CatalogProduct {
  id: string;
  name: string;
  unit: string;
  sellingPrice: number;
  currentStock: number;
}

interface PartyOption {
  id: string;
  name: string;
}

const QUICK_ACTIONS: Array<{
  label: string;
  sampleByLang: Record<VoiceLanguage, string>;
}> = [
  {
    label: "Check Stock",
    sampleByLang: {
      HINGLISH: "Maggi ka kitna stock hai?",
      HI: "मैगी का कितना स्टॉक बचा है?",
      EN: "How much Maggi stock is available?",
    },
  },
  {
    label: "Record Sale",
    sampleByLang: {
      HINGLISH: "Sunita Devi ko 2 Britannia bread de do, 60 rupaye cash mile",
      HI: "सुनीता देवी को 2 ब्रेड पैकेट बेचो, 60 रुपये नकद मिले",
      EN: "Record a sale of 2 bread packets to Sunita Devi for ₹60 cash",
    },
  },
  {
    label: "Add Stock",
    sampleByLang: {
      HINGLISH: "20 packet Maggi stock mein add kar do",
      HI: "20 पैकेट मैगी स्टॉक में जोड़ दो",
      EN: "Add 20 packets of Maggi to inventory",
    },
  },
  {
    label: "Customer Dues",
    sampleByLang: {
      HINGLISH: "Sunita Devi ka kitna udhaar baaki hai?",
      HI: "सुनीता देवी का कितना उधार बाकी है?",
      EN: "How much does Sunita Devi owe?",
    },
  },
  {
    label: "Today's Sales",
    sampleByLang: {
      HINGLISH: "Aaj ki total sales kitni hui?",
      HI: "आज की कुल बिक्री कितनी हुई?",
      EN: "Show today's total sales",
    },
  },
  {
    label: "Record Expense",
    sampleByLang: {
      HINGLISH: "500 rupaye electricity bill expense mein add karo",
      HI: "500 रुपये बिजली का बिल खर्च में जोड़ दो",
      EN: "Record an expense of ₹500 for electricity bill",
    },
  },
];

export default function VoiceAssistantPage() {
  const speechProviderRef = useRef<SpeechProvider | null>(null);

  const [language, setLanguage] = useState<VoiceLanguage>("HINGLISH");
  const [hinglishLocale, setHinglishLocale] = useState<SpeechLocale>("en-IN");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [uiState, setUiState] = useState<AssistantUiState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [inputMode, setInputMode] = useState<VoiceInputMode>("TEXT");
  const [activeCommand, setActiveCommand] = useState<VoiceCommandRecord | null>(
    null
  );
  const [history, setHistory] = useState<VoiceCommandRecord[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeLocale: SpeechLocale = useMemo(() => {
    if (language === "HI") return "hi-IN";
    if (language === "EN") return "en-IN";
    return hinglishLocale;
  }, [language, hinglishLocale]);

  const loadHistoryAndCatalog = useCallback(async () => {
    await Promise.resolve();
    try {
      const [histRes, prodRes, custRes] = await Promise.all([
        apiFetch<{ items: VoiceCommandRecord[] }>(
          "/api/assistant/commands?pageSize=12"
        ),
        apiFetch<CatalogProduct[]>("/api/products"),
        apiFetch<PartyOption[]>("/api/customers"),
      ]);
      setHistory(histRes.items);
      setProducts(prodRes);
      setCustomers(custRes);
    } catch {
      // Initial catalog/history errors will surface if DB is unconfigured when running commands
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const provider = createSpeechProvider();
      speechProviderRef.current = provider;
      setSpeechSupported(provider.isSupported());
      setTtsSupported(isSpeechSynthesisSupported());
      void loadHistoryAndCatalog();
    }, 0);
    return () => {
      clearTimeout(id);
      speechProviderRef.current?.cancel();
      stopSpeaking();
    };
  }, [loadHistoryAndCatalog]);

  const isBusy =
    uiState === "INTERPRETING" || uiState === "EXECUTING";

  function handleSpeechState(state: SpeechRecognitionState) {
    if (state === "LISTENING" || state === "REQUESTING_PERMISSION") {
      setUiState("LISTENING");
    } else if (state === "PROCESSING") {
      setUiState("TRANSCRIBING");
    } else if (state === "TRANSCRIPT_READY") {
      setUiState("TRANSCRIPT_READY");
    } else if (state === "ERROR") {
      setUiState("ERROR");
    } else if (state === "IDLE") {
      setUiState("IDLE");
    }
  }

  async function handleStartListening() {
    if (isBusy) return;
    setErrorMsg(null);
    stopSpeaking();

    const provider = speechProviderRef.current;
    if (!provider || !provider.isSupported()) {
      setUiState("ERROR");
      setErrorMsg(
        "Browser speech recognition is unavailable here. Type your command in the box below."
      );
      return;
    }

    setInputMode("VOICE");
    await provider.start(activeLocale, {
      onStateChange: handleSpeechState,
      onTranscript: (text) => {
        setTranscript(text);
      },
      onError: (msg) => {
        setErrorMsg(msg);
      },
    });
  }

  function handleStopListening() {
    speechProviderRef.current?.stop();
  }

  async function handleProcessCommand(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleaned = transcript.trim();
    if (!cleaned || isBusy) return;

    setErrorMsg(null);
    setUiState("INTERPRETING");
    stopSpeaking();

    try {
      const result = await apiFetch<VoiceCommandRecord>(
        "/api/assistant/interpret",
        {
          method: "POST",
          body: JSON.stringify({
            transcript: cleaned,
            language,
            inputMode,
          }),
        }
      );

      setActiveCommand(result);

      if (result.commandStatus === "EXECUTED") {
        setUiState("SUCCESS");
        if (autoSpeak && result.resultSummary) {
          speakResponse(result.resultSummary, language);
        }
      } else if (result.commandStatus === "AWAITING_CONFIRMATION") {
        setUiState("AWAITING_CONFIRMATION");
      } else if (result.commandStatus === "NEEDS_CLARIFICATION") {
        setUiState("NEEDS_CLARIFICATION");
        if (autoSpeak && result.resultSummary) {
          speakResponse(result.resultSummary, language);
        }
      } else {
        setUiState("ERROR");
        setErrorMsg(result.failureReason ?? result.resultSummary ?? "Command failed.");
      }

      await loadHistoryAndCatalog();
    } catch (err) {
      setUiState("ERROR");
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to interpret command."
      );
    }
  }

  async function handleUpdateDraft(patch: Record<string, unknown>) {
    if (!activeCommand || isBusy) return;
    setErrorMsg(null);
    setUiState("INTERPRETING");
    try {
      const updated = await apiFetch<VoiceCommandRecord>(
        `/api/assistant/commands/${activeCommand.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      );
      setActiveCommand(updated);
      if (updated.commandStatus === "EXECUTED") {
        setUiState("SUCCESS");
        if (autoSpeak && updated.resultSummary) {
          speakResponse(updated.resultSummary, language);
        }
      } else if (updated.commandStatus === "AWAITING_CONFIRMATION") {
        setUiState("AWAITING_CONFIRMATION");
      } else if (updated.commandStatus === "NEEDS_CLARIFICATION") {
        setUiState("NEEDS_CLARIFICATION");
      }
      await loadHistoryAndCatalog();
    } catch (err) {
      setUiState("ERROR");
      setErrorMsg(err instanceof Error ? err.message : "Failed to update command.");
    }
  }

  async function handleConfirmCommand() {
    if (!activeCommand || isBusy) return;
    setErrorMsg(null);
    setUiState("EXECUTING");
    try {
      const executed = await apiFetch<VoiceCommandRecord>(
        `/api/assistant/commands/${activeCommand.id}/confirm`,
        { method: "POST" }
      );
      setActiveCommand(executed);
      setUiState("SUCCESS");
      if (autoSpeak && executed.resultSummary) {
        speakResponse(executed.resultSummary, language);
      }
      await loadHistoryAndCatalog();
    } catch (err) {
      setUiState("ERROR");
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to execute command."
      );
      await loadHistoryAndCatalog();
    }
  }

  async function handleCancelCommand() {
    if (!activeCommand || isBusy) return;
    setErrorMsg(null);
    try {
      const cancelled = await apiFetch<VoiceCommandRecord>(
        `/api/assistant/commands/${activeCommand.id}/cancel`,
        { method: "POST" }
      );
      setActiveCommand(cancelled);
      setUiState("IDLE");
      await loadHistoryAndCatalog();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to cancel.");
    }
  }

  const greetingText = useMemo(() => {
    if (language === "HI") {
      return "नमस्ते! बोलकर या लिखकर बिक्री, स्टॉक, उधार या खर्च आसानी से संभालें।";
    }
    if (language === "EN") {
      return "Namaste! Speak or type naturally to check stock, record sales, manage Udhaar, or log expenses.";
    }
    return "Namaste! Bolkar ya likhkar stock check karein, sale record karein, ya customer udhaar dekhein.";
  }, [language]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            <Mic className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Multilingual Voice Assistant
            </h1>
            <p className="text-sm text-[#756F69]">{greetingText}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as VoiceLanguage)}
            aria-label="Assistant language"
            className="rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-semibold text-[#353535]"
          >
            <option value="HINGLISH">Hinglish (Mixed)</option>
            <option value="HI">हिंदी (Hindi · hi-IN)</option>
            <option value="EN">English (India · en-IN)</option>
          </select>

          {language === "HINGLISH" && (
            <select
              value={hinglishLocale}
              onChange={(e) =>
                setHinglishLocale(e.target.value as SpeechLocale)
              }
              aria-label="Speech recognition locale for Hinglish"
              className="rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs text-[#756F69]"
            >
              <option value="en-IN">Mic: en-IN (Roman Hinglish)</option>
              <option value="hi-IN">Mic: hi-IN (Hindi Script)</option>
            </select>
          )}

          {ttsSupported && (
            <button
              type="button"
              onClick={() => setAutoSpeak((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-medium text-[#353535]"
            >
              {autoSpeak ? (
                <Volume2 className="h-3.5 w-3.5 text-[#22B55B]" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-[#756F69]" />
              )}
              <span>{autoSpeak ? "Voice Reply On" : "Voice Reply Muted"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
          Quick Commands:
        </span>
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            type="button"
            disabled={isBusy}
            onClick={() => {
              setTranscript(qa.sampleByLang[language]);
              setInputMode("TEXT");
              setUiState("TRANSCRIPT_READY");
            }}
            className="rounded-full border border-[#D5CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#353535] hover:border-[#F0B03B] hover:bg-[#F0B03B]/15 disabled:opacity-50"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Main Microphone & Transcript Input Card */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            {uiState === "LISTENING" ? (
              <button
                type="button"
                onClick={handleStopListening}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FF4F78] text-white shadow-lg ring-4 ring-[#FF4F78]/25 transition hover:scale-105"
                aria-label="Stop listening"
              >
                <Square className="h-7 w-7" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleStartListening()}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0B03B] text-[#353535] shadow-md transition hover:bg-[#DDA02D] disabled:opacity-50"
                aria-label="Start speaking"
              >
                {speechSupported ? (
                  <Mic className="h-8 w-8" />
                ) : (
                  <MicOff className="h-8 w-8" />
                )}
              </button>
            )}

            <div>
              <Badge
                variant={
                  uiState === "LISTENING"
                    ? "alert"
                    : uiState === "SUCCESS"
                    ? "success"
                    : uiState === "AWAITING_CONFIRMATION" ||
                      uiState === "NEEDS_CLARIFICATION"
                    ? "amber"
                    : "neutral"
                }
              >
                Status: {uiState.replace(/_/g, " ")}
              </Badge>
              <p className="mt-1.5 text-xs text-[#756F69]">
                {speechSupported
                  ? "Click the microphone to speak, or type/edit your command below."
                  : "Browser speech recognition is unavailable — type your command below."}
              </p>
            </div>
          </div>

          <form onSubmit={handleProcessCommand} className="space-y-3">
            <label
              htmlFor="voice-transcript-input"
              className="block text-xs font-semibold text-[#353535]"
            >
              Recognized Transcript / Command Text (Editable before processing)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="voice-transcript-input"
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setInputMode("TEXT");
                }}
                placeholder='Try: "Rahul ko 2 bread packet becho, 60 rupaye cash mile"'
                className="flex-1 rounded-xl border border-[#D5CFC4] bg-white px-4 py-3 text-sm text-[#353535] focus:border-[#F0B03B] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!transcript.trim() || isBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#353535] px-5 py-3 text-sm font-semibold text-white hover:bg-[#353535]/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4 text-[#F0B03B]" />
                <span>
                  {uiState === "INTERPRETING" ? "Interpreting..." : "Process"}
                </span>
              </button>
            </div>
          </form>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-3.5 text-sm text-[#B81D43]"
            >
              {errorMsg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Command Preview / Clarification / Result */}
      {activeCommand && (
        <Card className="border-2 border-[#D5CFC4]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#F0B03B]" />
              <div>
                <CardTitle>
                  {activeCommand.interpretedIntent ?? "Command Result"}
                </CardTitle>
                <CardDescription>
                  Transcript: &ldquo;{activeCommand.transcript}&rdquo;
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={
                activeCommand.commandStatus === "EXECUTED"
                  ? "success"
                  : activeCommand.commandStatus === "AWAITING_CONFIRMATION" ||
                    activeCommand.commandStatus === "NEEDS_CLARIFICATION"
                  ? "amber"
                  : activeCommand.commandStatus === "FAILED"
                  ? "alert"
                  : "neutral"
              }
            >
              {activeCommand.commandStatus}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Result / Clarification Banner */}
            {(activeCommand.resultSummary || activeCommand.draft?.assistantMessage) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/35 p-4">
                <div className="flex items-start gap-2.5">
                  {activeCommand.commandStatus === "EXECUTED" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22B55B]" />
                  ) : activeCommand.commandStatus === "NEEDS_CLARIFICATION" ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A5A00]" />
                  ) : null}
                  <p className="text-sm font-medium text-[#353535]">
                    {activeCommand.resultSummary ??
                      activeCommand.draft?.assistantMessage}
                  </p>
                </div>

                {ttsSupported && activeCommand.resultSummary && (
                  <button
                    type="button"
                    onClick={() =>
                      speakResponse(activeCommand.resultSummary!, language)
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1 text-xs font-medium"
                  >
                    <Volume2 className="h-3.5 w-3.5" /> Speak
                  </button>
                )}
              </div>
            )}

            {/* Clarification / Editable Preview Controls */}
            {activeCommand.draft &&
              (activeCommand.commandStatus === "NEEDS_CLARIFICATION" ||
                activeCommand.commandStatus === "AWAITING_CONFIRMATION") && (
                <div className="space-y-4 rounded-xl border border-[#D5CFC4] bg-white p-4">
                  {/* Items preview & correction */}
                  {activeCommand.draft.items.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                        Items
                      </p>
                      {activeCommand.draft.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="grid items-center gap-2 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 p-3 sm:grid-cols-12"
                        >
                          <div className="sm:col-span-5">
                            <p className="text-xs font-semibold text-[#353535]">
                              {item.resolvedProductName ??
                                `Unresolved: "${item.sourceName}"`}
                            </p>
                            <select
                              value={item.resolvedProductId ?? ""}
                              onChange={(e) => {
                                const nextItems = activeCommand.draft!.items.map(
                                  (it, i) =>
                                    i === idx
                                      ? {
                                          sourceName: it.sourceName,
                                          resolvedProductId:
                                            e.target.value || null,
                                          quantity: it.quantity,
                                        }
                                      : {
                                          sourceName: it.sourceName,
                                          resolvedProductId:
                                            it.resolvedProductId,
                                          quantity: it.quantity,
                                        }
                                );
                                void handleUpdateDraft({ items: nextItems });
                              }}
                              className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="">-- Select Product --</option>
                              {item.candidates.length > 0 && (
                                <optgroup label="Suggested Matches">
                                  {item.candidates.map((c) => (
                                    <option key={`cand-${c.id}`} value={c.id}>
                                      ★ {c.name}{" "}
                                      {c.detail ? `(${c.detail})` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label="All Products">
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.currentStock} {p.unit} ·{" "}
                                    {formatInr(p.sellingPrice)})
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] text-[#756F69]">
                              Quantity ({item.unit})
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              defaultValue={item.quantity}
                              onBlur={(e) => {
                                const q = Number(e.target.value);
                                if (q > 0 && q !== item.quantity) {
                                  const nextItems =
                                    activeCommand.draft!.items.map((it, i) => ({
                                      sourceName: it.sourceName,
                                      resolvedProductId: it.resolvedProductId,
                                      quantity: i === idx ? q : it.quantity,
                                    }));
                                  void handleUpdateDraft({ items: nextItems });
                                }
                              }}
                              className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2 py-1.5 text-xs tabular-nums"
                            />
                          </div>

                          <div className="text-right text-xs sm:col-span-4">
                            <p className="text-[#756F69]">
                              Rate: {formatInr(item.unitPrice)}
                            </p>
                            <p className="font-bold text-[#353535] tabular-nums">
                              Subtotal: {formatInr(item.lineTotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Customer selector when relevant */}
                  {(activeCommand.draft.intent === "RECORD_SALE" ||
                    activeCommand.draft.intent === "RECORD_PAYMENT" ||
                    activeCommand.draft.intent === "CHECK_CUSTOMER_DUES" ||
                    activeCommand.draft.intent ===
                      "GET_CUSTOMER_TRANSACTIONS") && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#353535]">
                          Customer
                        </label>
                        <select
                          value={activeCommand.draft.resolvedCustomerId ?? ""}
                          onChange={(e) =>
                            void handleUpdateDraft({
                              resolvedCustomerId: e.target.value || null,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs"
                        >
                          <option value="">
                            {activeCommand.draft.intent === "RECORD_SALE"
                              ? "Walk-in Customer"
                              : "-- Select Customer --"}
                          </option>
                          {activeCommand.draft.customerCandidates.length > 0 && (
                            <optgroup label="Matched Customers">
                              {activeCommand.draft.customerCandidates.map((c) => (
                                <option key={`cc-${c.id}`} value={c.id}>
                                  ★ {c.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All Customers">
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {(activeCommand.draft.intent === "RECORD_SALE" ||
                        activeCommand.draft.intent === "RECORD_PAYMENT") && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-[#353535]">
                              Payment Amount (₹)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={
                                activeCommand.draft.paymentAmount ?? ""
                              }
                              onBlur={(e) => {
                                const val =
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value);
                                if (val !== activeCommand.draft?.paymentAmount) {
                                  void handleUpdateDraft({
                                    paymentAmount: val,
                                  });
                                }
                              }}
                              className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#353535]">
                              Payment Method
                            </label>
                            <select
                              value={activeCommand.draft.paymentMethod ?? "CASH"}
                              onChange={(e) =>
                                void handleUpdateDraft({
                                  paymentMethod: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs"
                            >
                              <option value="CASH">Cash</option>
                              <option value="UPI">UPI</option>
                              <option value="BANK_TRANSFER">
                                Bank Transfer
                              </option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Total & Confirm/Cancel Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E3DFD6] pt-3">
                    <div className="text-sm font-bold text-[#353535] tabular-nums">
                      Total Amount: {formatInr(activeCommand.draft.calculatedTotal)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleCancelCommand()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium text-[#353535] hover:bg-[#E3DFD6]/40"
                      >
                        <XCircle className="h-4 w-4" /> Cancel
                      </button>

                      {activeCommand.commandStatus ===
                        "AWAITING_CONFIRMATION" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleConfirmCommand()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            {uiState === "EXECUTING"
                              ? "Executing..."
                              : "Confirm & Execute"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {activeCommand.relatedTransactionId && (
              <div className="text-right">
                <Link
                  href="/transactions"
                  className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
                >
                  View linked transaction ({activeCommand.relatedTransactionId}
                  ) →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Command History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-[#756F69]" />
            <div>
              <CardTitle>Recent Voice &amp; Text Commands</CardTitle>
              <CardDescription>
                Transcripts and execution history (no raw audio stored)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#756F69]">
              No commands processed yet. Try speaking or clicking a quick
              command above.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E3DFD6] uppercase tracking-wider text-[#756F69]">
                  <th className="pb-2.5 pr-3">Transcript</th>
                  <th className="pb-2.5 pr-3">Intent</th>
                  <th className="pb-2.5 pr-3">Mode</th>
                  <th className="pb-2.5 pr-3">Status</th>
                  <th className="pb-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {history.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-2.5 pr-3 font-medium text-[#353535]">
                      {cmd.transcript}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[#756F69]">
                      {cmd.interpretedIntent ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-[#756F69]">
                      {cmd.inputMode} ({cmd.selectedLanguage})
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        variant={
                          cmd.commandStatus === "EXECUTED"
                            ? "success"
                            : cmd.commandStatus === "FAILED"
                            ? "alert"
                            : cmd.commandStatus === "AWAITING_CONFIRMATION" ||
                              cmd.commandStatus === "NEEDS_CLARIFICATION"
                            ? "amber"
                            : "neutral"
                        }
                      >
                        {cmd.commandStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-[#756F69]">
                      {cmd.resultSummary ?? cmd.failureReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
