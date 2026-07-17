export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentSource = "public_booking" | "manual" | "whatsapp";

export type Appointment = {
  id: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes: string;
  source: AppointmentSource;
  createdAt: string;
  updatedAt: string;
};

export type Schedule = {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  breakMinutes: number;
  isActive: boolean;
};

export type ScheduleException = {
  id: string;
  doctorId: string;
  date: string;
  type: "closed" | "break";
  startTime: string | null;
  endTime: string | null;
  reason: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  clinicName: string;
  bookingSlug: string;
  timezone: string;
  bookingEnabled: boolean;
  address: string;
  bio: string;
  maxDaily: number;
  minLeadHours: number;
  maxFutureDays: number;
};

export type AvailabilitySlot = { startTime: string; endTime: string };

export type ClinicStats = {
  today: number;
  upcoming: number;
  completed: number;
  cancelled: number;
  patients: number;
  newPatientsThisMonth: number;
  patientsToday: number;
  newBookings: number;
  attendanceRate: number;
  noShowRate: number;
  publicBookings: number;
  manualBookings: number;
  busiestDay: string;
  mostBookedTime: string;
  last7Days: number;
  last30Days: number;
  rangeDays: number;
  rangeAppointments: number;
  nextAppointment: Appointment | null;
  sevenDaySeries: Array<{ date: string; count: number }>;
};

export type ApiSuccess<T> = { success: true; data: T; message: string };
export type ApiFailure = { success: false; error: string; message: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

