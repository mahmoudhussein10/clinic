import "server-only";
import { normalizeEgyptPhone } from "./clinic-db";
import { getPrisma } from "./prisma";
export async function patientExists(phone: unknown) {
  const normalized = normalizeEgyptPhone(phone);
  const rows = await getPrisma().$queryRawUnsafe<Array<{exists:boolean}>>("SELECT EXISTS(SELECT 1 FROM patients WHERE phone=$1) AS exists", normalized);
  return Boolean(rows[0]?.exists);
}
