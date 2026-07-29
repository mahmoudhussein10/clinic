import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "عيادة الريم",
    short_name: "الريم",
    description: "إدارة مواعيد عيادة الريم وإشعاراتها",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f4",
    theme_color: "#123236",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
