"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, ChevronLeft, Clock3, LoaderCircle, MapPin, MessageCircleMore, Phone, ShieldCheck, Stethoscope } from "lucide-react";
import type { ApiResponse, Appointment, AvailabilitySlot, Doctor } from "@/lib/clinic-types";

type PublicDoctor = Doctor & { schedule: Array<{ dayOfWeek: number; isActive: boolean }> };
type DayOption = { value: string; weekday: string; day: string; month: string };

async function api<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const payload = await response.json() as ApiResponse<T>;
  if (!payload.success) throw new Error(payload.message);
  return payload.data;
}

function dateInCairo() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()); }
function addDays(date: string, amount: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function formatTime(time: string) { const [hour, minute] = time.split(":").map(Number); return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2026, 0, 1, hour, minute)); }
function fullDate(date: string) { return new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`)); }

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [doctor, setDoctor] = useState<PublicDoctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({ patientName: "", patientPhone: "", notes: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Appointment | null>(null);

  useEffect(() => {
    let alive = true;
    api<PublicDoctor>(`/api/public/doctor/${encodeURIComponent(slug)}`)
      .then((data) => alive && setDoctor(data))
      .catch((cause) => alive && setError(cause.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);

  const days = useMemo<DayOption[]>(() => {
    if (!doctor) return [];
    const activeDays = new Set(doctor.schedule.filter((item) => item.isActive).map((item) => item.dayOfWeek));
    const start = dateInCairo();
    return Array.from({ length: Math.min(doctor.maxFutureDays, 21) }, (_, index) => addDays(start, index))
      .filter((date) => activeDays.has(new Date(`${date}T12:00:00Z`).getUTCDay()))
      .slice(0, 7)
      .map((value) => { const d = new Date(`${value}T12:00:00Z`); return { value, weekday: new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(d), day: new Intl.DateTimeFormat("ar-EG", { day: "numeric" }).format(d), month: new Intl.DateTimeFormat("ar-EG", { month: "short" }).format(d) }; });
  }, [doctor]);

  const chooseDay = async (date: string) => {
    setSelectedDate(date); setSelectedSlot(null); setSlotsLoading(true); setError("");
    try { setSlots(await api<AvailabilitySlot[]>(`/api/availability?doctorId=${doctor?.id || ""}&date=${date}`)); setStep(2); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل المواعيد"); }
    finally { setSlotsLoading(false); }
  };

  const validatePatient = (event: FormEvent) => {
    event.preventDefault(); setError("");
    const name = form.patientName.trim().replace(/\s+/g, " ");
    const phone = form.patientPhone.replace(/[\s-]/g, "");
    if (name.length < 2) return setError("اكتب اسم المريض بشكل صحيح");
    if (!/^(?:\+?20|0)?1[0125]\d{8}$/.test(phone)) return setError("اكتب رقم موبايل مصري صحيح مثل 01012345678");
    setForm({ ...form, patientName: name, patientPhone: phone }); setStep(4);
  };

  const confirm = async () => {
    if (submitting || !selectedSlot || !doctor) return;
    setSubmitting(true); setError("");
    try {
      const appointment = await api<Appointment>("/api/public/book", { method: "POST", body: JSON.stringify({ bookingSlug: doctor.bookingSlug, patientName: form.patientName, patientPhone: form.patientPhone, notes: form.notes, appointmentDate: selectedDate, startTime: selectedSlot.startTime }) });
      setResult(appointment); setStep(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تأكيد الحجز");
      setSelectedSlot(null); setStep(2);
      if (selectedDate) void chooseDay(selectedDate);
    } finally { setSubmitting(false); }
  };

  const addToCalendar = () => {
    if (!result || !doctor) return;
    const clean = (value: string) => value.replace(/[-:]/g, "");
    const start = `${clean(result.appointmentDate)}T${clean(result.startTime)}00`;
    const end = `${clean(result.appointmentDate)}T${clean(result.endTime)}00`;
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${result.id}@alreem.clinic`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:موعد في ${doctor.clinicName}`, `LOCATION:${doctor.address}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" })); link.download = `alreem-${result.appointmentDate}.ics`; link.click(); URL.revokeObjectURL(link.href);
  };

  if (loading) return <main className="public-booking-page" dir="rtl"><div className="public-loading"><LoaderCircle className="spin" size={32} /><strong>جاري فتح صفحة الحجز...</strong></div></main>;
  if (error && !doctor) return <main className="public-booking-page" dir="rtl"><div className="public-error"><Stethoscope size={34} /><h1>تعذر فتح صفحة الحجز</h1><p>{error}</p></div></main>;
  if (!doctor) return null;

  return <main className="public-booking-page" dir="rtl"><aside className="public-clinic-card"><div className="public-brand"><span>ر</span><strong>الريم</strong></div><div className="doctor-photo"><Stethoscope size={38} /></div><span className="public-kicker">احجز بدون انتظار</span><h1>{doctor.name}</h1><h2>{doctor.specialization}</h2><p>{doctor.bio}</p><div className="clinic-public-details"><span><MapPin size={18} /> {doctor.address}</span><a href={`tel:+${doctor.phone}`}><Phone size={18} /> +{doctor.phone}</a></div><div className="public-security"><ShieldCheck size={20} /><span><strong>حجز آمن ومباشر</strong><small>لن يتم عرض بياناتك لأي شخص</small></span></div></aside><section className="public-booking-workspace"><header><Link href="/" aria-label="العودة للوحة العيادة"><ChevronLeft size={20} /> العودة</Link><div className="booking-progress">{[1, 2, 3, 4, 5].map((value) => <span key={value} className={step >= value ? "active" : ""}>{value}</span>)}</div></header>{!doctor.bookingEnabled ? <div className="booking-disabled"><Clock3 size={34} /><h2>الحجز الإلكتروني متوقف مؤقتًا</h2><p>يمكنك الاتصال بالعيادة لحجز موعد.</p><a href={`tel:+${doctor.phone}`}><Phone size={18} /> اتصل بالعيادة</a></div> : <div className="public-step-card">
      {step === 1 && <><span className="step-number">الخطوة 1 من 5</span><h2>اختر اليوم المناسب</h2><p>نعرض الأيام التي تعمل فيها العيادة فقط.</p><div className="public-days">{days.map((day) => <button key={day.value} onClick={() => chooseDay(day.value)}><span>{day.weekday}</span><strong>{day.day}</strong><small>{day.month}</small></button>)}</div>{!days.length && <p className="inline-empty">لا يوجد جدول عمل متاح حاليًا.</p>}</>}
      {step === 2 && <><button className="step-back" onClick={() => setStep(1)}>→ تغيير اليوم</button><span className="step-number">الخطوة 2 من 5</span><h2>اختر الموعد</h2><p>{fullDate(selectedDate)}</p>{slotsLoading ? <div className="slots-loading"><LoaderCircle className="spin" /> جاري التحميل</div> : slots.length ? <div className="public-slots">{slots.map((slot) => <button key={slot.startTime} className={selectedSlot?.startTime === slot.startTime ? "selected" : ""} onClick={() => setSelectedSlot(slot)}><Clock3 size={17} /> {formatTime(slot.startTime)}</button>)}</div> : <p className="inline-empty">اكتملت حجوزات هذا اليوم. اختر يومًا آخر.</p>}<button className="public-primary" disabled={!selectedSlot} onClick={() => setStep(3)}>متابعة</button></>}
      {step === 3 && <><button className="step-back" onClick={() => setStep(2)}>→ تغيير الموعد</button><span className="step-number">الخطوة 3 من 5</span><h2>بيانات المريض</h2><p>رقم الهاتف ضروري لتأكيد الحجز.</p><form className="public-patient-form" onSubmit={validatePatient}><label><span>اسم المريض *</span><input autoFocus required minLength={2} maxLength={80} value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} placeholder="الاسم بالكامل" /></label><label><span>رقم الهاتف *</span><input required inputMode="tel" value={form.patientPhone} onChange={(event) => setForm({ ...form, patientPhone: event.target.value })} placeholder="01012345678" /></label><label><span>سبب الزيارة أو ملاحظات</span><textarea maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="اختياري" /></label>{error && <p className="form-error">{error}</p>}<button className="public-primary">مراجعة الحجز</button></form></>}
      {step === 4 && selectedSlot && <><button className="step-back" onClick={() => setStep(3)}>→ تعديل البيانات</button><span className="step-number">الخطوة 4 من 5</span><h2>راجع تفاصيل الحجز</h2><div className="booking-review"><div><span>الطبيبة</span><strong>{doctor.name}</strong></div><div><span>التاريخ</span><strong>{fullDate(selectedDate)}</strong></div><div><span>الوقت</span><strong>{formatTime(selectedSlot.startTime)}</strong></div><div><span>المريض</span><strong>{form.patientName}</strong></div><div><span>الهاتف</span><strong dir="ltr">{form.patientPhone}</strong></div></div>{error && <p className="form-error">{error}</p>}<button className="public-primary" disabled={submitting} onClick={confirm}>{submitting ? <><LoaderCircle className="spin" size={18} /> جاري تأكيد الموعد...</> : "تأكيد الحجز"}</button></>}
      {step === 5 && result && <div className="public-success"><span className="success-check"><CheckCircle2 size={38} /></span><span className="step-number">تم الحجز بنجاح</span><h2>موعدك اتسجل يا {result.patientName}</h2><p>سيظهر الموعد فورًا في جدول {doctor.name}.</p><div className="success-ticket"><span>رقم الحجز <strong>{result.id.slice(-8).toUpperCase()}</strong></span><span>{fullDate(result.appointmentDate)} • {formatTime(result.startTime)}</span><span dir="ltr">+{result.patientPhone}</span></div><div className="success-actions"><button onClick={addToCalendar}><CalendarPlus size={18} /> أضف للتقويم</button><a target="_blank" rel="noreferrer" href={`https://wa.me/${doctor.phone}?text=${encodeURIComponent(`تم حجز موعدي في ${result.appointmentDate} الساعة ${result.startTime}، رقم الحجز ${result.id.slice(-8)}`)}`}><MessageCircleMore size={18} /> واتساب العيادة</a></div></div>}
    </div>}</section></main>;
}

