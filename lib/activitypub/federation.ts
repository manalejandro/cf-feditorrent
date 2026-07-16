import { signRequest } from "./security";
import type { APActivity, APActor, APObject } from "@/lib/types";

const AP_CONTENT_TYPE = "application/activity+json";
const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const REQUEST_TIMEOUT_MS = 10_000;

const PRIVATE_IP_RANGES = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

/**
 * Validates that a URL is safe for outbound HTTP requests.
 * Rejects non-HTTPS, private IPs, and localhost — defense-in-depth
 * against SSRF via injected ActivityPub actor fields.
 */
export function validateOutboundUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { valid: false, reason: "Only HTTPS URLs are allowed" };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      return { valid: false, reason: "Localhost is not allowed" };
    }
    if (PRIVATE_IP_RANGES.some((re) => re.test(hostname))) {
      return { valid: false, reason: "Private IP ranges are not allowed" };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
}

export async function deliverToInbox(
  inboxUrl: string,
  activity: APActivity,
  senderKeyId: string,
  privateKeyPem: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const validation = validateOutboundUrl(inboxUrl);
  if (!validation.valid) {
    console.warn(`[federation] Blocked delivery to ${inboxUrl}: ${validation.reason}`);
    return { ok: false, status: 0, error: validation.reason };
  }
  const body = JSON.stringify(activity);
  const headers = await signRequest("POST", inboxUrl, body, privateKeyPem, senderKeyId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(inboxUrl, {
      method: "POST",
      headers: { "Content-Type": AP_CONTENT_TYPE, Accept: AP_ACCEPT, ...headers },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: String(err) };
  }
}

export async function deliverToInboxes(
  inboxUrls: string[],
  activity: APActivity,
  senderKeyId: string,
  privateKeyPem: string
): Promise<void> {
  const unique = [...new Set(inboxUrls)];
  await Promise.allSettled(unique.map((url) => deliverToInbox(url, activity, senderKeyId, privateKeyPem)));
}

export async function fetchRemoteObject(
  url: string,
  senderKeyId?: string,
  privateKeyPem?: string
): Promise<APActor | APObject | APActivity | null> {
  const validation = validateOutboundUrl(url);
  if (!validation.valid) {
    console.warn(`[federation] Blocked fetch from ${url}: ${validation.reason}`);
    return null;
  }
  const additionalHeaders: Record<string, string> = {};
  if (senderKeyId && privateKeyPem) {
    const signed = await signRequest("GET", url, null, privateKeyPem, senderKeyId);
    Object.assign(additionalHeaders, signed);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: AP_ACCEPT, ...additionalHeaders }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as APActor | APObject | APActivity;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function collectFollowerInboxes(
  followerIds: string[],
  fetchActor: (id: string) => Promise<any>
): Promise<string[]> {
  const inboxes: string[] = [];
  const sharedInboxes = new Set<string>();
  await Promise.allSettled(
    followerIds.map(async (id: string) => {
      const actor = await fetchActor(id);
      if (!actor) return;
      const shared = actor.endpoints?.sharedInbox;
      if (shared) {
        if (!sharedInboxes.has(shared)) { sharedInboxes.add(shared); inboxes.push(shared); }
      } else {
        const base = actor.id.endsWith("/") ? actor.id.slice(0, -1) : actor.id;
        const inbox = actor.inbox ?? `${base}/inbox`;
        if (inbox) inboxes.push(inbox);
      }
    })
  );
  return inboxes;
}

export async function resolveWebFinger(acct: string): Promise<string | null> {
  const normalized = acct.replace(/^@/, "");
  const [, domain] = normalized.split("@");
  if (!domain) return null;
  try {
    const url = `https://${domain}/.well-known/webfinger?resource=acct:${normalized}`;
    const res = await fetch(url, { headers: { Accept: "application/jrd+json, application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { links?: { rel: string; href: string }[] };
    return data.links?.find((l) => l.rel === "self")?.href ?? null;
  } catch { return null; }
}
