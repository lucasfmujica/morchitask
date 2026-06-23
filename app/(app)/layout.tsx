import type { ReactNode } from "react";
import { AppChrome } from "@/components/layout/app-chrome";

// Auth gating happens in middleware; this is just the app chrome.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
