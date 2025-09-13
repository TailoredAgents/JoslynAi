// Hybrid retriever: BM25 via tsvector + pgvector, RRF blend
export type Span = { id: string; document_id: string; doc_name: string; page: number; text: string; scoreLex?: number; scoreVec?: number };

function rrfFuse(lex: Span[], vec: Span[], k = 60, top = 12): Span[] {
  const map = new Map<string, Span & { rrf: number }>();
  lex.forEach((s, i) => {
    const rr = 1 / (k + i + 1);
    const cur = map.get(s.id) || { ...s, rrf: 0 };
    cur.rrf += rr; map.set(s.id, cur);
  });
  vec.forEach((s, i) => {
    const rr = 1 / (k + i + 1);
    const cur = map.get(s.id) || { ...s, rrf: 0 };
    cur.rrf += rr; map.set(s.id, cur);
  });
  return Array.from(map.values())
    .sort((a, b) => (b.rrf - a.rrf))
    .slice(0, top);
}

export async function retrieveForAsk(prisma: any, openai: any, childId: string, query: string, top = 12) {
  const lex = await prisma.$queryRawUnsafe(
    `SELECT ds.id, ds.document_id, COALESCE(d.original_name, d.type) as doc_name, ds.page, ds.text,
            ts_rank_cd(ds.tsv, plainto_tsquery('english', $1)) AS "scoreLex"
     FROM doc_spans ds
     JOIN documents d ON d.id = ds.document_id
     WHERE d.child_id = $2
     ORDER BY "scoreLex" DESC
     LIMIT 30`,
    query,
    childId
  ) as any as Span[];

  const emb = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small", input: query });
  const vecStr = `ARRAY[${emb.data[0].embedding.join(",")}]::vector`;
  const vec = await prisma.$queryRawUnsafe(
    `SELECT ds.id, ds.document_id, COALESCE(d.original_name, d.type) as doc_name, ds.page, ds.text,
            1 - (ds.embedding <=> ${vecStr}) AS "scoreVec"
     FROM doc_spans ds
     JOIN documents d ON d.id = ds.document_id
     WHERE d.child_id = $1
     ORDER BY ds.embedding <=> ${vecStr}
     LIMIT 30`,
    childId
  ) as any as Span[];

  return rrfFuse(lex || [], vec || [], 60, top);
}
