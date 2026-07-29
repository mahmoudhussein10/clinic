import "server-only";

import { headers } from "next/headers";
import { ClinicError } from "./clinic-db";
import { getPrisma } from "./prisma";

export type ClinicContext = { userId: string; clinicId: string; email: string; name: string };

type UserRow = { id: string; clinic_id: string; email: string; name: string };

export async function requireClinicContext(): Promise<ClinicContext> {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase();

  if (email) {
    const rows = await getPrisma().$queryRawUnsafe<UserRow[]>(
      "SELECT id, clinic_id, email, name FROM clinic_users WHERE lower(email)=$1 LIMIT 1",
      email,
    );
    if (!rows[0]) throw new ClinicError("CLINIC_ACCESS_DENIED", "هذا الحساب غير مرتبط بالعيادة", 403);
    return { userId: rows[0].id, clinicId: rows[0].clinic_id, email: rows[0].email, name: rows[0].name };
  }

  if (process.env.NODE_ENV !== "production") {
    const rows = await getPrisma().$queryRawUnsafe<UserRow[]>(
      "SELECT id, clinic_id, email, name FROM clinic_users ORDER BY created_at LIMIT 1",
    );
    if (rows[0]) return { userId: rows[0].id, clinicId: rows[0].clinic_id, email: rows[0].email, name: rows[0].name };
  }

  throw new ClinicError("AUTH_REQUIRED", "يجب تسجيل الدخول للوصول إلى لوحة العيادة", 401);
}

export function safeInternalUrl(value: unknown): string | null {
  const url = String(value || "");
  return url.startsWith("/") && !url.startsWith("//") ? url.slice(0, 500) : null;
}
