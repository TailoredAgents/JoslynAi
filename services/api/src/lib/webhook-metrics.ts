type CounterKey = `${string}.${"success" | "failure" | "skipped"}`;

const counters = new Map<CounterKey, number>();

function makeKey(eventType: string, outcome: "success" | "failure" | "skipped"): CounterKey {
  const normalized = (eventType || "unknown").toLowerCase();
  return `${normalized}.${outcome}`;
}

export function recordWebhookMetric(eventType: string, outcome: "success" | "failure" | "skipped"): void {
  const key = makeKey(eventType, outcome);
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function snapshotWebhookMetrics(): Record<string, number> {
  return Array.from(counters.entries()).reduce<Record<string, number>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}
