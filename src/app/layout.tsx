import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import ServiceWorker from "../components/ServiceWorker";
import Script from "next/script";
import "./scrollfx.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cauã Henry | Musculação — Consultoria",
  description: "Plataforma privada de consultoria: prescrição, execução e evolução.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0E1B2B" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><Script src="/scrollfx.js" strategy="beforeInteractive" /></head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
