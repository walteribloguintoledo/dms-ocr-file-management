import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.",
    );
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    update: {},
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      name: ADMIN_NAME || "Administrator",
      passwordHash: await hash(ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });
  for (const name of ["Human Resources", "Finance", "Operations", "Legal"])
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  console.log(
    "Initial administrator and categories are ready. Existing credentials were not modified.",
  );
}
main().finally(() => prisma.$disconnect());
