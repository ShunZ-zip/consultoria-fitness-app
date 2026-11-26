import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import ServiceWorker from "../components/ServiceWorker";
import Script from "next/script";
import "./scrollfx.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cauã Henry | Musculação — Acompanhamento",
  description: "Plataforma privada de acompanhamento: prescrição, execução e evolução.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#E6EAED" }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("cf-theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}` }} />
        <Script src="/scrollfx.js" strategy="beforeInteractive" />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
