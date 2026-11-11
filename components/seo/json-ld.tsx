import { serializeJsonLd } from "@/lib/seo";

/**
 * A JSON-LD block. Rendered in the body, which search engines read the same
 * as the head, so a page can emit its own without reaching into a layout.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Escaped by serializeJsonLd: catalog text cannot close the tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
