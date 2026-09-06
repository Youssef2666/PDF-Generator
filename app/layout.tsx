import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Cairo, Geist } from "next/font/google";

import { LocaleProvider } from "@/components/locale-provider";
import { directionOf, LOCALE_COOKIE, parseLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Two faces, one job each.
 *
 * Geist carries the Latin chrome — labels, buttons, figures. Cairo carries
 * every Arabic glyph on the page: it is the first family on any element with
 * dir="rtl" or lang="ar", and the fallback everywhere else, so Arabic typed
 * into a dir="auto" field still renders in Cairo rather than in whatever the
 * operating system reaches for. See globals.css. When the UI itself is in
 * Arabic the root element carries dir="rtl", and Cairo leads everywhere.
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The UI language is read here, on the server, so the first byte already
  // carries the right direction. Reading the cookie makes every route
  // dynamic, which this app is anyway: every screen edits a live draft.
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      // No font-sans utility here: it would outrank the base-layer rule that
      // puts Cairo first when dir="rtl". globals.css owns the family stack.
      className={cn(geist.variable, cairo.variable)}
    >
      <body className="min-h-screen antialiased">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
