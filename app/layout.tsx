import type { Metadata } from "next";
import "./globals.css";
import { Cairo, Geist } from "next/font/google";
import { cn } from "@/lib/utils";

/**
 * Two faces, one job each.
 *
 * Geist carries the Latin chrome — labels, buttons, figures. Cairo carries
 * every Arabic glyph on the page: it is the first family on any element with
 * dir="rtl" or lang="ar", and the fallback everywhere else, so Arabic typed
 * into a dir="auto" field still renders in Cairo rather than in whatever the
 * operating system reaches for. See globals.css.
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Course Report Studio",
  description:
    "Builds bilingual course completion report packages from attendance, grade and survey data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, cairo.variable)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
