import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "AUA Market — Almaty CleanAir Hedge",
  description: "Devnet prediction market for Almaty air quality, resolved by an automatic public-data oracle.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={manrope.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
