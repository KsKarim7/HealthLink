import { defineConfig } from "drizzle-kit";

// drizzle-kit runs locally in Node, so it reads .env off disk. Use the direct
// (non-pooled) Neon endpoint for migrations.
try {
  process.loadEnvFile();
} catch {
  // .env may be absent in CI; DATABASE_URL can come from the environment instead
}

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
