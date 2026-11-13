import { WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { verifyPolarEvent } from "./polar-webhook";

// A payload whose type the SDK doesn't know: once the signature passes, the
// SDK's parser rejects it with a validation error. That error is the proof the
// signature was accepted, without depending on Polar's full payload schemas.
const body = JSON.stringify({
  type: "test.unknown",
  timestamp: new Date().toISOString(),
  data: {},
});
const NEW_SECRET = `whsec_${Buffer.from("a-standard-webhooks-key-32bytes!").toString("base64")}`;
const LEGACY_SECRET = "polar_whs_legacy-style-secret";

function signed(key: string) {
  const id = "msg_test";
  const ts = new Date();
  return {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
    "webhook-signature": new Webhook(key).sign(id, ts, body),
  };
}

function outcome(headers: Record<string, string>, secret: string) {
  try {
    verifyPolarEvent(body, headers, secret);
    return "parsed";
  } catch (err) {
    return err instanceof WebhookVerificationError ? "rejected" : "verified";
  }
}

describe("verifyPolarEvent", () => {
  it("accepts a new-format secret used as-is (endpoints from Sep 2026)", () => {
    expect(outcome(signed(NEW_SECRET), NEW_SECRET)).toBe("verified");
  });

  it("still accepts the old rule: the secret base64-encoded first", () => {
    const legacyKey = Buffer.from(LEGACY_SECRET, "utf-8").toString("base64");
    expect(outcome(signed(legacyKey), LEGACY_SECRET)).toBe("verified");
  });

  it("rejects a signature made with another secret", () => {
    const other = `whsec_${Buffer.from("some-other-key-of-thirty-2-bytes").toString("base64")}`;
    expect(outcome(signed(other), NEW_SECRET)).toBe("rejected");
  });

  it("rejects a tampered body", () => {
    const headers = signed(NEW_SECRET);
    let result: string;
    try {
      verifyPolarEvent(body.replace("test.unknown", "test.other"), headers, NEW_SECRET);
      result = "parsed";
    } catch (err) {
      result = err instanceof WebhookVerificationError ? "rejected" : "verified";
    }
    expect(result).toBe("rejected");
  });
});
