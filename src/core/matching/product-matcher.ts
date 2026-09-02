import type { ProductAdapter, Product } from '../../adapters/interfaces.js';

export type MatcherConfig = {
  category: string;
  keywords: string[];
  threshold: number;
};

function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (lower.includes(kw.toLowerCase())) hits++;
  return hits / Math.max(keywords.length, 1);
}

export async function matchProducts(
  videoText: string,
  category: string,
  adapters: ProductAdapter[],
  config: MatcherConfig,
  limit = 5
): Promise<Product[]> {
  const all: Product[] = [];
  const query = { keywords: config.keywords, category, limit: 20 } as const;
  for (const ad of adapters) {
    try {
      const res = await ad.search(query);
      for (const p of res) {
        const s = keywordScore(`${p.title} ${videoText}`, config.keywords);
        p.score = s;
        if (s >= config.threshold) all.push(p);
      }
    } catch (e) {
      console.error(`[matcher] ${ad.name} search failed`, e);
    }
  }
  all.sort((a,b)=> (b.score??0) - (a.score??0));
  return all.slice(0, limit);
}
