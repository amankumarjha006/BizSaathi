import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { transactionService } from "../src/server/services/transaction.service";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when environment variables are already injected
}

const DEMO_BUSINESS_ID = "demo-kirana-store";

const SEED_PRODUCTS = [
  { name: "Amul Taaza Milk 500ml", sku: "DAIRY-001", category: "Dairy", purchasePrice: 25, sellingPrice: 27, minimumStock: 15, unit: "pkt" },
  { name: "Britannia Whole Wheat Bread", sku: "BAK-001", category: "Bakery", purchasePrice: 38, sellingPrice: 45, minimumStock: 10, unit: "pkt" },
  { name: "Maggi 2-Minute Noodles 70g", sku: "SNK-001", category: "Snacks", purchasePrice: 12, sellingPrice: 14, minimumStock: 24, unit: "pkt" },
  { name: "Parle-G Gold Biscuits 250g", sku: "SNK-002", category: "Snacks", purchasePrice: 22, sellingPrice: 25, minimumStock: 20, unit: "pkt" },
  { name: "Tata Salt 1kg", sku: "STP-001", category: "Staples", purchasePrice: 24, sellingPrice: 28, minimumStock: 20, unit: "pkt" },
  { name: "Fortune Mustard Oil 1L", sku: "OIL-001", category: "Oils", purchasePrice: 142, sellingPrice: 160, minimumStock: 12, unit: "litre" },
  { name: "Aashirvaad Shudh Chakki Atta 5kg", sku: "STP-002", category: "Staples", purchasePrice: 215, sellingPrice: 245, minimumStock: 8, unit: "bag" },
  { name: "Tata Sampann Toor Dal 1kg", sku: "STP-003", category: "Staples", purchasePrice: 155, sellingPrice: 180, minimumStock: 10, unit: "kg" },
  { name: "India Gate Basmati Rice 5kg", sku: "STP-004", category: "Staples", purchasePrice: 420, sellingPrice: 485, minimumStock: 6, unit: "bag" },
  { name: "Surf Excel Easy Wash 1kg", sku: "HOM-001", category: "Household", purchasePrice: 118, sellingPrice: 135, minimumStock: 8, unit: "pkt" },
  { name: "Colgate Strong Teeth 200g", sku: "PER-001", category: "Personal Care", purchasePrice: 92, sellingPrice: 110, minimumStock: 10, unit: "pcs" },
  { name: "Dettol Original Soap 125g", sku: "PER-002", category: "Personal Care", purchasePrice: 36, sellingPrice: 42, minimumStock: 15, unit: "pcs" },
  { name: "Brooke Bond Red Label Tea 500g", sku: "BEV-001", category: "Beverages", purchasePrice: 230, sellingPrice: 265, minimumStock: 8, unit: "pkt" },
  { name: "Bru Instant Coffee 100g", sku: "BEV-002", category: "Beverages", purchasePrice: 185, sellingPrice: 215, minimumStock: 6, unit: "pcs" },
  { name: "Refined Sugar (Loose) 1kg", sku: "STP-005", category: "Staples", purchasePrice: 42, sellingPrice: 48, minimumStock: 25, unit: "kg" },
  { name: "Haldiram Aloo Bhujia 200g", sku: "SNK-003", category: "Snacks", purchasePrice: 45, sellingPrice: 55, minimumStock: 12, unit: "pkt" },
];

const SEED_CUSTOMERS = [
  { name: "Sunita Devi", phone: "+91-9811100001" },
  { name: "Rajesh Verma", phone: "+91-9811100002" },
  { name: "Anita Sharma", phone: "+91-9811100003" },
  { name: "Vikram Singh", phone: "+91-9811100004" },
  { name: "Meena Gupta", phone: "+91-9811100005" },
];

const SEED_SUPPLIERS = [
  { name: "Mahavir Wholesale Distributors", phone: "+91-9822200001" },
  { name: "Kamdhenu Dairy & Bakery Agency", phone: "+91-9822200002" },
  { name: "Agarwal FMCG Traders", phone: "+91-9822200003" },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run prisma/seed.ts");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const owner = await prisma.user.upsert({
      where: { email: "demo@bizsaathi.local" },
      update: {},
      create: {
        name: "Ramesh Kumar",
        email: "demo@bizsaathi.local",
      },
    });

    const business = await prisma.business.upsert({
      where: { id: DEMO_BUSINESS_ID },
      update: {},
      create: {
        id: DEMO_BUSINESS_ID,
        name: "Shree Ganesh Kirana & General Store",
        ownerId: owner.id,
        businessType: "KIRANA_RETAIL",
        phone: "+91-9800000000",
        preferredLanguage: "HINGLISH",
      },
    });

    // Idempotent products
    const productBySku = new Map<string, string>();
    for (const p of SEED_PRODUCTS) {
      const existing = await prisma.product.findFirst({
        where: { businessId: business.id, sku: p.sku },
      });
      if (existing) {
        productBySku.set(p.sku, existing.id);
      } else {
        const created = await prisma.product.create({
          data: {
            businessId: business.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            purchasePrice: p.purchasePrice,
            sellingPrice: p.sellingPrice,
            currentStock: 0,
            minimumStock: p.minimumStock,
            unit: p.unit,
          },
        });
        productBySku.set(p.sku, created.id);
      }
    }

    // Idempotent customers
    const customerIds: string[] = [];
    for (const c of SEED_CUSTOMERS) {
      const existing = await prisma.customer.findFirst({
        where: { businessId: business.id, name: c.name },
      });
      if (existing) {
        customerIds.push(existing.id);
      } else {
        const created = await prisma.customer.create({
          data: { businessId: business.id, name: c.name, phone: c.phone },
        });
        customerIds.push(created.id);
      }
    }

    // Idempotent suppliers
    const supplierIds: string[] = [];
    for (const s of SEED_SUPPLIERS) {
      const existing = await prisma.supplier.findFirst({
        where: { businessId: business.id, name: s.name },
      });
      if (existing) {
        supplierIds.push(existing.id);
      } else {
        const created = await prisma.supplier.create({
          data: { businessId: business.id, name: s.name, phone: s.phone },
        });
        supplierIds.push(created.id);
      }
    }

    // Seed transactions only once (idempotency marker)
    const alreadySeeded = await prisma.transaction.findFirst({
      where: { businessId: business.id, referenceNumber: "SEED-PUR-1001" },
    });

    if (!alreadySeeded) {
      // 1. Purchase from Mahavir Wholesale (partial payment -> supplier payable)
      const pur1 = await transactionService.recordPurchase(
        business.id,
        {
          supplierId: supplierIds[0],
          referenceNumber: "SEED-PUR-1001",
          items: [
            { productId: productBySku.get("STP-001")!, quantity: 30, unitPrice: 24 },
            { productId: productBySku.get("OIL-001")!, quantity: 20, unitPrice: 142 },
            { productId: productBySku.get("STP-002")!, quantity: 15, unitPrice: 215 },
            { productId: productBySku.get("STP-003")!, quantity: 25, unitPrice: 155 },
            { productId: productBySku.get("STP-004")!, quantity: 10, unitPrice: 420 },
            { productId: productBySku.get("STP-005")!, quantity: 40, unitPrice: 42 },
          ],
          paidAmount: 10000,
          paymentMethod: "BANK_TRANSFER",
          notes: "Demo wholesale restock",
        },
        prisma
      );

      // 2. Purchase from Kamdhenu Dairy & Bakery (fully paid)
      await transactionService.recordPurchase(
        business.id,
        {
          supplierId: supplierIds[1],
          referenceNumber: "SEED-PUR-1002",
          items: [
            { productId: productBySku.get("DAIRY-001")!, quantity: 25, unitPrice: 25 },
            { productId: productBySku.get("BAK-001")!, quantity: 15, unitPrice: 38 },
          ],
          paidAmount: 1195,
          paymentMethod: "UPI",
          notes: "Demo daily dairy stock",
        },
        prisma
      );

      // 3. Purchase from Agarwal FMCG (unpaid -> supplier payable)
      await transactionService.recordPurchase(
        business.id,
        {
          supplierId: supplierIds[2],
          referenceNumber: "SEED-PUR-1003",
          items: [
            { productId: productBySku.get("SNK-001")!, quantity: 40, unitPrice: 12 },
            { productId: productBySku.get("SNK-002")!, quantity: 30, unitPrice: 22 },
            { productId: productBySku.get("HOM-001")!, quantity: 12, unitPrice: 118 },
            { productId: productBySku.get("PER-001")!, quantity: 15, unitPrice: 92 },
            { productId: productBySku.get("PER-002")!, quantity: 20, unitPrice: 36 },
            { productId: productBySku.get("BEV-001")!, quantity: 10, unitPrice: 230 },
            { productId: productBySku.get("BEV-002")!, quantity: 8, unitPrice: 185 },
            { productId: productBySku.get("SNK-003")!, quantity: 18, unitPrice: 45 },
          ],
          paidAmount: 0,
          paymentMethod: "CASH",
          notes: "Demo FMCG credit invoice",
        },
        prisma
      );

      // 4. Credit Sale to Sunita Devi (₹500+ partial payment -> Khata Udhaar)
      const sale1 = await transactionService.recordSale(
        business.id,
        {
          customerId: customerIds[0],
          items: [
            { productId: productBySku.get("STP-002")!, quantity: 2 },
            { productId: productBySku.get("OIL-001")!, quantity: 1 },
          ],
          paidAmount: 400,
          paymentMethod: "CASH",
          notes: "Demo Khata credit sale",
        },
        prisma
      );

      // 5. Follow-up partial Khata payment from Sunita Devi
      await transactionService.recordPayment(
        business.id,
        {
          transactionId: sale1.id,
          amount: 100,
          paymentMethod: "UPI",
          notes: "Demo Khata follow-up payment",
        },
        prisma
      );

      // 6. Walk-in Cash Sale (drives Amul Milk low-stock alert for demo)
      await transactionService.recordSale(
        business.id,
        {
          items: [
            { productId: productBySku.get("DAIRY-001")!, quantity: 14 },
            { productId: productBySku.get("BAK-001")!, quantity: 6 },
            { productId: productBySku.get("SNK-001")!, quantity: 8 },
          ],
          paidAmount: 760,
          paymentMethod: "UPI",
          notes: "Demo morning counter sale",
        },
        prisma
      );

      // 7. Partial supplier payment on SEED-PUR-1001
      await transactionService.recordPayment(
        business.id,
        {
          transactionId: pur1.id,
          amount: 2000,
          paymentMethod: "BANK_TRANSFER",
          notes: "Demo partial supplier settlement",
        },
        prisma
      );
    }

    console.info(`Seeded demo business: ${business.name} (${business.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
