import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { catalogFor, requestLocale } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
// Chinese comes from the system (PingFang SC and the like) and the bundled MiSans: Noto Sans SC from Google Fonts was
// dropped on 2026-11-04, when its new file names broke the dev compiler.
// The humanist accent: serif italic for years, quotes and single emphasised words.
const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: "Kalchas",
  description: "An open-source world simulator: bring anything you are facing, and play it out in a world built from the real one.",
};

/** The interface opens in the language the request asks for (the one set with the switch, else the browser's own). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const catalog = await catalogFor(locale);
  return (
    // (a browser extension, a translator say, may put attributes of its own on the root before React loads: they are
    // not taken for a page that differs from the one the server drew)
    <html lang={locale} className={`${inter.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <I18nProvider locale={locale} catalog={catalog}>
          <div className="relative z-10">{children}</div>
        </I18nProvider>
      </body>
    </html>
  );
}
