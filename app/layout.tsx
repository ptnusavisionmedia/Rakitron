import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rakitron — Bengkel Robot 3D",
  description: "Rakit lengan capit, tangan lima jari, atau robot seluruh tubuh, lalu uji gerakannya di bengkel 3D Rakitron.",
  icons: { icon: "/rakitron.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f7f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id">
    <head>
      {/* Unduhan model 3D dan font dimulai bersamaan dengan JavaScript, bukan menunggu adegan siap. */}
      <link rel="preload" href="/models/rakitron-arm.glb" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    </head>
    <body>{children}</body>
  </html>;
}
