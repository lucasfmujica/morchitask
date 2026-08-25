import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { AgentationProvider } from "@/components/AgentationProvider";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Morchitask",
  description: "Planificá tu día con calma. Una app de productividad para organizarse juntos.",
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
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#15171b" },
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
    <html lang={locale} className={dmSans.variable}>
      <body className="bg-bg text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <AgentationProvider />
      </body>
    </html>
  );
}
