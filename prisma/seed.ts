import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
// Resolve configuration relative to this script, regardless of the caller's cwd.
// Explicit process variables take priority, followed by .env.local and .env.
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });
let prisma: PrismaClient | undefined;
class SeedConfigurationError extends Error {}
async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  const missing: string[] = [];
  if (!ADMIN_EMAIL?.trim()) missing.push("ADMIN_EMAIL (your administrator email)");
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)
    missing.push("ADMIN_PASSWORD (a password of at least 12 characters)");
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (missing.length)
    throw new SeedConfigurationError(
      `Administrator setup is incomplete.\nSet these values in the project-root .env.local or .env file:\n${missing.map((key) => `  - ${key}`).join("\n")}\nQuote the password in the file, then rerun: npm run db:seed\nDo not post credentials in chat or commit environment files.`,
    );
  prisma = new PrismaClient();
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL!.trim().toLowerCase() },
    update: {},
    create: {
      email: ADMIN_EMAIL!.trim().toLowerCase(),
      name: ADMIN_NAME || "Administrator",
      passwordHash: await hash(ADMIN_PASSWORD!, 12),
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
main()
  .catch((error: unknown) => {
    if (error instanceof SeedConfigurationError) console.error(error.message);
    else {
      console.error("Database seed failed. Check DATABASE_URL, database connectivity, and that migrations have been applied.");
      if (error && typeof error === "object" && "code" in error)
        console.error(`Database error code: ${String(error.code)}`);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
