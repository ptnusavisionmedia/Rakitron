import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rakitron — Bengkel Robot 3D",
  description: "Rakit enam komponen, gerakkan lengan robotmu, dan pindahkan kubus di bengkel 3D Rakitron.",
  icons: { icon: "/rakitron.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f7f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
