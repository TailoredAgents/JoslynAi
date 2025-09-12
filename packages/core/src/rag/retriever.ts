// Hybrid retriever stub: BM25 via SQL + pgvector; returns spans

export interface Span {
  doc_id: string;
  page: number;
  bbox?: [number, number, number, number];
  text: string;
  score: number;
}

export interface RetrieverOptions {
  limit?: number;
}

export async function retrieve(orgId: string, childId: string, query: string, opts: RetrieverOptions = {}): Promise<Span[]> {
  // TODO: implement hybrid retrieval with SQL (BM25/tsvector + pgvector) and RRF blending
  // For scaffold, return empty array
  return [];
}

