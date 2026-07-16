import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title: "نَبض | إدارة عيادتك بذكاء",
    description: "منصة عربية حديثة لإدارة العيادات والمواعيد والمرضى والمدفوعات بسهولة.",
    openGraph: {
      title: "نَبض | إدارة عيادتك بذكاء",
      description: "كل ما تحتاجه لإدارة عيادتك وحجوزاتك في تجربة واحدة ذكية.",
      type: "website",
      locale: "ar_EG",
      images: [{ url: imageUrl, width: 1737, height: 909, alt: "منصة نَبض لإدارة العيادات" }],
    },
    twitter: { card: "summary_large_image", title: "نَبض | إدارة عيادتك بذكاء", description: "إدارة حديثة للمواعيد والمرضى والمدفوعات.", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
