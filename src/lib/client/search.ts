type Searchable = {
  title: string | null;
  videoId: string | null;
  source: string;
  summary: string | null;
  summaryEs: string | null;
};

/** Lowercase without accents, so "metodo" finds "Método". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** True when every word of the query appears in the title, video ID, link or either summary. */
export function matchesQuery(row: Searchable, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold([row.title, row.videoId, row.source, row.summary, row.summaryEs].filter(Boolean).join("\n"));
  return words.every((word) => haystack.includes(word));
}
