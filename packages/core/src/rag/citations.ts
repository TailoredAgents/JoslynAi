import type { Span } from "./retriever";

type TagLookup = Record<string, string[] | undefined>;

type CitationSpanBase = Pick<Span, 'id' | 'document_id' | 'page' | 'text' | 'doc_name'> & Record<string, unknown>;

export function filterByDocumentTags<T extends { document_id: string }>(
  spans: T[],
  lookup: TagLookup,
  allowedTags: string[] = [],
  options: { requireAll?: boolean } = {}
): T[] {
  if (!allowedTags.length) return spans;
  const allowed = new Set(allowedTags);
  return spans.filter((span) => {
    const tags = lookup[span.document_id] || [];
    if (!tags.length) return false;
    if (options.requireAll) {
      return allowedTags.every((tag) => tags.includes(tag));
    }
    return tags.some((tag) => allowed.has(tag));
  });
}

export type CitationGroup<S extends CitationSpanBase> = {
  documentId: string;
  docName?: string;
  pages: number[];
  spans: S[];
};

export function groupCitations<S extends CitationSpanBase>(spans: S[], maxPerDocument = 2): CitationGroup<S>[] {
  const map = new Map<string, CitationGroup<S>>();
  for (const span of spans) {
    if (!span?.document_id) continue;
    const entry = map.get(span.document_id) || { documentId: span.document_id, docName: span.doc_name, pages: [], spans: [] };
    entry.docName = span.doc_name ?? entry.docName;
    if (entry.spans.length < maxPerDocument) {
      entry.spans.push(span);
      if (typeof span.page === "number" && !entry.pages.includes(span.page)) {
        entry.pages.push(span.page);
        entry.pages.sort((a, b) => a - b);
      }
    }
    map.set(span.document_id, entry);
  }
  return Array.from(map.values());
}

export function enforceCitationLimit<S extends CitationSpanBase>(groups: CitationGroup<S>[], maxTotal = 6): CitationGroup<S>[] {
  if (maxTotal <= 0) return [];
  const limited: CitationGroup<S>[] = [];
  let total = 0;
  for (const group of groups) {
    if (total >= maxTotal) break;
    const remaining = Math.max(0, maxTotal - total);
    const spans = group.spans.slice(0, remaining);
    if (!spans.length) continue;
    const pages = group.pages.slice(0, remaining);
    limited.push({ ...group, spans, pages });
    total += spans.length;
  }
  return limited;
}

export type SerializedCitation = {
  document_id: string;
  doc_name?: string;
  pages: number[];
  span_ids: string[];
  snippets: string[];
};

export function serializeCitations(groups: CitationGroup<CitationSpanBase>[]): SerializedCitation[] {
  return groups.map((group) => ({
    document_id: group.documentId,
    doc_name: group.docName,
    pages: group.pages,
    span_ids: group.spans.map((s) => s.id),
    snippets: group.spans.map((s) => s.text ?? "")
  }));
}

export function normalizeAndLimit<S extends CitationSpanBase>(spans: S[], options: { tags?: TagLookup; allowedTags?: string[]; requireAllTags?: boolean; maxPerDocument?: number; maxTotal?: number } = {}) {
  const filtered = options.tags ? filterByDocumentTags(spans, options.tags, options.allowedTags || [], { requireAll: options.requireAllTags }) : spans;
  const grouped = groupCitations(filtered, options.maxPerDocument ?? 2);
  return enforceCitationLimit(grouped, options.maxTotal ?? 6);
}
