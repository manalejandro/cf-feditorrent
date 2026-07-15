import { signRequest } from "@/lib/activitypub/security";
export { TrackerDO } from "./tracker-do";

const AP_CONTENT_TYPE = "application/activity+json";
const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const PERMANENT_ERRORS = new Set([400, 401, 403, 404, 410, 422]);

interface Env {
  DB: D1Database;
  TORRENTS_KV: KVNamespace;
  DELIVERY_QUEUE: Queue;
  TRACKER: DurableObjectNamespace;
  ASSETS: Fetcher;
  INSTANCE_URL: string;
  SECRET_KEY: string;
}

interface APDeliveryMessage {
  type: "delivery";
  inboxUrl: string;
  activityJson: string;
  actorId: string;
}

async function deliverOne(
  inboxUrl: string,
  activityJson: string,
  actorId: string,
  env: Env
): Promise<{ ok: boolean; permanent: boolean }> {
  const row = await (env.DB as any).prepare("SELECT private_key_pem FROM actors WHERE id = ? AND is_local = 1").bind(actorId).first() as { private_key_pem: string } | null;
  if (!row?.private_key_pem) return { ok: false, permanent: true };

  const keyId = `${actorId}#main-key`;
  const headers = await signRequest("POST", inboxUrl, activityJson, row.private_key_pem, keyId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(inboxUrl, {
      method: "POST",
      headers: { "Content-Type": AP_CONTENT_TYPE, Accept: AP_ACCEPT, ...headers },
      body: activityJson,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, permanent: PERMANENT_ERRORS.has(res.status) };
  } catch {
    clearTimeout(timer);
    return { ok: false, permanent: false };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const handler = (await import("../.open-next/worker.js")) as any;
    return handler.default.fetch(request, env, ctx);
  },

  async queue(batch: { messages: { body: APDeliveryMessage; ack: () => void; retry: () => void }[] }, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!message.body) { message.ack(); continue; }
      const { type, inboxUrl, activityJson, actorId } = message.body;
      if (type !== "delivery") { message.ack(); continue; }
      try {
        const { ok, permanent } = await deliverOne(inboxUrl, activityJson, actorId, env);
        if (ok || permanent) message.ack();
        else message.retry();
      } catch { message.retry(); }
    }
  },
};
