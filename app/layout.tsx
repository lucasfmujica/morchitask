import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { AgentationProvider } from "@/components/AgentationProvider";
import { PageAnalytics } from "@/components/page-analytics";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { SITE_URL } from "@/lib/seo";

// Figtree for the interface, Bricolage Grotesque for titles and big numbers,
// Plex Mono for the few places that show raw times. Bricolage replaced
// Schibsted Grotesk and then, briefly, Fraunces (November 2026); DM Sans was
// retired with the bento redesign.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
// Variable, with the optical-size axis: one file covers a 17px wordmark and a
// 104px price, and the browser picks the cut per size (font-optical-sizing
// defaults to auto). Without `axes` the opsz axis is stripped and every size
// gets the same mid cut, which looks clumsy at both ends.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * `description` is the one piece of metadata that is prose, so it follows the
 * reader's language. The rest is the product's name, which does not.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { ...metadata, description: t("appDescription") };
}

const metadata: Metadata = {
  // Resolves the relative canonical, hreflang and og:image URLs the marketing
  // pages emit. Without it Next guesses from the request host and warns.
  metadataBase: new URL(SITE_URL),
  title: "Morchitask",
  applicationName: "Morchitask",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Morchitask",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // viewportFit: cover enables env(safe-area-inset-*) on iPhone (notch / home bar).
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121411" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang` has to follow the chosen language, not sit on "es": screen readers
  // pick pronunciation from it, and so does the browser's translate prompt.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${figtree.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <body className="bg-bg text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* No message provider here on purpose. Mounted this high it has no
            route to scope itself to, so it serializes the whole catalog into
            every page — including the landing, where a stranger downloaded the
            wording of the Pomodoro timer before deciding to sign up. Each route
            group mounts its own with the namespaces it uses. */}
        <Providers>{children}</Providers>
        {/* Page views for the launch funnel's "Visits" step, which the app's own
            database cannot see. Vercel Web Analytics is cookieless and served
            from our own origin (/_vercel/insights), so it needs no consent
            banner and no CSP exception. It does need a line in the privacy
            policy. Outside a Vercel deployment it records nothing. */}
        <PageAnalytics />
        <AgentationProvider />
      </body>
    </html>
  );
}
