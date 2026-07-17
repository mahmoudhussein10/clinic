import { NextResponse } from "next/server";
import { ClinicError } from "./clinic-db";

const noStoreHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache" };

export function ok<T>(data: T, message = "تم الحفظ", status = 200) {
  return NextResponse.json({ success: true, data, message }, { status, headers: noStoreHeaders });
}

export function fail(error: unknown) {
  if (error instanceof ClinicError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message },
      { status: error.status, headers: noStoreHeaders },
    );
  }
  console.error("Clinic API error", error);
  return NextResponse.json(
    { success: false, error: "INTERNAL_ERROR", message: "حدث خطأ غير متوقع، حاول مرة أخرى" },
    { status: 500, headers: noStoreHeaders },
  );
}

