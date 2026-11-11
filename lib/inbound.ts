import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Capture by email: everyone gets a private address, and whatever arrives there
 * lands in their backlog.
 *
 * The address carries its owner: `backlog+<user id>.<signature>@<domain>`. The
 * signature is an HMAC of the user id, so the address can't be guessed from an
 * id and needs no table to look up — no migration, nothing to keep in sync.
 * Rotating INBOUND_EMAIL_SECRET retires every address at once, which is the
 * remedy for one that leaked into a spam list.
 *
 * Server-only (node:crypto). The pure text clean-up at the bottom is what the
 * webhook passes on to the capture parser.
 */

const LOCAL_PREFIX = "backlog+";
const SIG_CHARS = 12;

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, SIG_CHARS);
}

/** A uuid without dashes keeps the local part well under the 64-char limit. */
function compact(userId: string): string {
  return userId.replace(/-/g, "").toLowerCase();
}

function expand(hex: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function inboundAddress(userId: string, secret: string, domain: string): string {
  return `${LOCAL_PREFIX}${compact(userId)}.${sign(userId, secret)}@${domain}`;
}

/**
 * The user an address belongs to, or null. Accepts "Name <addr>" forms and any
 * case; checks the domain and the signature in constant time.
 */
export function userFromAddress(raw: string, secret: string, domain: string): string | null {
  const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 0 || addr.slice(at + 1) !== domain.toLowerCase()) return null;
  const local = addr.slice(0, at);
  if (!local.startsWith(LOCAL_PREFIX)) return null;
  const [hex, sig] = local.slice(LOCAL_PREFIX.length).split(".");
  const userId = hex ? expand(hex) : null;
  if (!userId || !sig || sig.length !== SIG_CHARS) return null;
  const want = Buffer.from(sign(userId, secret));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

/** Constant-time check of the webhook's shared secret. */
export function isAuthorizedInbound(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

const NOTES_MAX = 2000;

/**
 * The part of an email worth reading: the subject and the new text, without the
 * quoted thread ("El … escribió:", "> …", "On … wrote:") or a signature ("-- ").
 * Forwarded mail keeps its body: that is usually the point of forwarding it.
 */
export function cleanEmailText(
  subject: string | undefined,
  body: string | undefined,
): {
  subject: string;
  body: string;
} {
  const lines = (body ?? "").replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^--\s*$/.test(line)) break;
    if (/^(El|On) .{4,200}(escribió|wrote):\s*$/i.test(line.trim())) break;
    if (/^>/.test(line.trim())) continue;
    kept.push(line);
  }
  const cleanSubject = (subject ?? "")
    .replace(/^\s*((re|rv|fw|fwd|reenv)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    subject: cleanSubject.slice(0, 200),
    body: kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, NOTES_MAX),
  };
}
