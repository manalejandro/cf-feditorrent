export interface APDeliveryMessage {
  type: "delivery";
  inboxUrl: string;
  activityJson: string;
  actorId: string;
}

export async function enqueueDeliveries(queue: any, inboxUrls: string[], activityJson: string, actorId: string): Promise<void> {
  const unique = [...new Set(inboxUrls)];
  const messages = unique.map((inboxUrl) => ({
    body: { type: "delivery" as const, inboxUrl, activityJson, actorId },
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    await queue.sendBatch(batch);
  }
}

export async function enqueueDelivery(queue: any, inboxUrl: string, activityJson: string, actorId: string): Promise<void> {
  await queue.send({ type: "delivery", inboxUrl, activityJson, actorId } satisfies APDeliveryMessage);
}
