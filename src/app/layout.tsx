import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
import "./globals.css";

const body = IBM_Plex_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const display = Montserrat({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: "Assistente March",
  description: "A assistente da March Company que atende, tira dúvidas e agenda pelo WhatsApp do seu negócio, 24 horas por dia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
