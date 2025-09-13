export type Usage = { model:string; input_tokens:number; output_tokens:number; cached_tokens?:number; cost_cents:number };

export function computeCostCents(u: Omit<Usage,"cost_cents">, rates: Record<string,{in:number; out:number; cached?:number}>) {
  const r = rates[u.model] || rates["default"] || { in: 0, out: 0, cached: 0 };
  const input = (u.input_tokens || 0) * (r.in || 0);
  const output = (u.output_tokens || 0) * (r.out || 0);
  const cached = (u.cached_tokens || 0) * (r.cached || 0);
  return Math.round((input + output + cached) * 100) / 1; // dollars->cents
}

