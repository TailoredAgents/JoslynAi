export const MODEL_RATES = JSON.parse(process.env.MODEL_RATES_JSON || `{
  "gpt-5":        {"in":0.000002,"out":0.000006},
  "gpt-5-mini":   {"in":0.000001,"out":0.000003},
  "gpt-5-nano":   {"in":0.0000002,"out":0.0000004},
  "default":      {"in":0.000002,"out":0.000006}
}`);

export function computeCostCents(u: { model:string; input_tokens:number; output_tokens:number; cached_tokens?:number }, rates: Record<string,{in:number; out:number; cached?:number}>) {
  const r = rates[u.model] || rates["default"] || { in: 0, out: 0, cached: 0 };
  const input = (u.input_tokens || 0) * (r.in || 0);
  const output = (u.output_tokens || 0) * (r.out || 0);
  const cached = (u.cached_tokens || 0) * (r.cached || 0);
  return Math.round((input + output + cached) * 100);
}
