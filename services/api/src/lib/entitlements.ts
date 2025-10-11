export type FeatureTree = Record<string, any>;

export const FEATURES_BY_PLAN: Record<string, FeatureTree> = {
  free: { ask: true, brief: true, letters: { render: false, send: false }, smart_attachments: false, chat: false },
  basic: { ask: true, brief: true, letters: { render: true, send: false }, smart_attachments: false, chat: true },
  pro: { ask: true, brief: true, letters: { render: true, send: true }, smart_attachments: true, chat: true },
  business: { ask: true, brief: true, letters: { render: true, send: true }, smart_attachments: true, chat: true },
  starter: { ask: true, brief: true, letters: { render: true, send: false }, smart_attachments: false, chat: true },
};

export function getFeaturesForPlan(plan?: string | null): FeatureTree {
  if (!plan) return FEATURES_BY_PLAN.free;
  return FEATURES_BY_PLAN[plan] || FEATURES_BY_PLAN.free;
}

export function resolveFeatureFlag(features: FeatureTree, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = features;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
