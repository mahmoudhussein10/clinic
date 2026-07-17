import { NextResponse } from "next/server";
import { ClinicError } from "./clinic-db";

export function ok<T>(data: T, message = "تمت العملية بنجاح", status = 200) {
  return NextResponse.json({ success: true, data, message }, { status });
}

export function fail(error: unknown) {
  if (error instanceof ClinicError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message },
      { status: error.status },
    );
  }
  console.error("Clinic API error", error);
  return NextResponse.json(
    { success: false, error: "INTERNAL_ERROR", message: "حدث خطأ غير متوقع، حاول مرة أخرى" },
    { status: 500 },
  );
}

