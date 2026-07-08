import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "KisanSetu — Smart Water, Crop & Advisory System",
  description:
    "Voice + SMS agricultural intelligence for small and marginal farmers, in Indic languages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
