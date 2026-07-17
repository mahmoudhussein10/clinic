ALTER TABLE "doctors"
ADD COLUMN IF NOT EXISTS "whatsapp_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';

UPDATE "doctors"
SET "whatsapp_phone" = "phone"
WHERE "whatsapp_phone" = '';
