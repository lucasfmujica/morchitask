import { ogAlt, ogSize, renderOgCard } from "../og-card";

// The shared card; see og-card.tsx for why every page folder has this file.
export const alt = ogAlt;
export const size = ogSize;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgCard();
}
