export function findApproximate(text: string, needle: string): [number, number] | null {
  const clean = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  const T = clean(text);
  const N = clean(needle).slice(0, 300);
  const idx = T.indexOf(N);
  if (idx >= 0) return [idx, idx + N.length];
  // fallback: naive trigram overlap sliding window
  const grams = (s: string) => {
    const res: string[] = [];
    for (let i = 0; i < s.length - 2; i++) res.push(s.slice(i, i + 3));
    return new Set(res);
  };
  const N3 = grams(N);
  let best = { score: 0, pos: -1 };
  for (let i = 0; i < T.length - N.length; i += 10) {
    const window = T.slice(i, i + N.length);
    const W3 = grams(window);
    let overlap = 0;
    N3.forEach((g) => { if (W3.has(g)) overlap++; });
    if (overlap > best.score) best = { score: overlap, pos: i };
  }
  if (best.pos >= 0 && best.score > 5) return [best.pos, best.pos + N.length];
  return null;
}

