import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "whatsapp_phone" TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT ''`);
  await client.query(`UPDATE "doctors" SET "whatsapp_phone" = "phone" WHERE "whatsapp_phone" = ''`);
  await client.query("COMMIT");
  console.log("Clinic contact settings migration applied.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
