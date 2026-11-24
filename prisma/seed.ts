import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when environment variables are already injected
}

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
      where: { id: "demo-kirana-store" },
      update: {},
      create: {
        id: "demo-kirana-store",
        name: "Shree Ganesh Kirana & General Store",
        ownerId: owner.id,
        businessType: "KIRANA_RETAIL",
        phone: "+91-9800000000",
        preferredLanguage: "HINGLISH",
      },
    });

    console.info(`Seeded demo business: ${business.name} (${business.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
