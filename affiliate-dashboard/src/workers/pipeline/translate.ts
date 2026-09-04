import path from "path";
import { logger } from "@/lib/logger";

export interface TranslatedSegment { start: number; end: number; textVi: string; textZh: string }

const DICT: Record<string, string> = {
  "大家好，看看这个清洁工具": "Xin chào, xem dụng cụ vệ sinh này",
  "非常实用，轻松清洁": "Rất tiện dụng, vệ sinh nhẹ nhàng",
  "强力清洁": "Làm sạch mạnh mẽ",
  "家务必备": "Thiết yếu cho việc nhà",
};

const cache = new Map<string, string>();

// --- Offline MT (transformers.js, Helsinki-NLP opus-mt-zh-vi) — free, no quota ---
let offlineBroken = false;
const offlineModel = process.env.MT_MODEL || "Helsinki-NLP/opus-mt-zh-vi";

async function getOfflineTranslator(): Promise<any | null> {
  if (offlineBroken) return null;
  try {
    let transformers: any;
    // Offline MT needs @huggingface/transformers + onnxruntime-node; keep as opt-in (MT_MODEL).
    // @ts-expect-error optional dependency
    transformers = await import("@huggingface/transformers");
    const { pipeline, env } = transformers;
    const base = process.env.STORAGE_BASE ? path.resolve(process.env.STORAGE_BASE) : path.join(process.cwd(), "storage");
    env.cacheDir = path.join(base, "models", "hf");
    env.allowRemoteModels = true;
    const translator = await pipeline("translation", offlineModel, { device: "cpu" });
    return translator;
  } catch (e: any) {
    try { logger.warn({ model: offlineModel, err: String(e.message) }, "offline MT model unavailable — using Google gtx"); } catch {}
    offlineBroken = true;
    return null;
  }
}

async function offlineTranslate(texts: string[]): Promise<Array<string | null>> {
  const tr = await getOfflineTranslator();
  if (!tr || texts.length === 0) return texts.map(() => null);
  const out = await tr(texts, { task: "translation" });
  const arr: Array<{ translated_text?: string }> = Array.isArray(out) ? out : [out];
  return arr.map((o) => o?.translated_text?.trim() || null);
}

// --- Google gtx (free endpoint, no key) as the workhorse fallback ---
let consecutiveFails = 0;
async function googleTranslate(text: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<Array<Array<string | null>>>;
  const parts = (data?.[0] || []).map((p) => (Array.isArray(p) ? p[0] ?? "" : "")).join("");
  return parts?.trim() ? parts : null;
}

async function fallbackTranslate(text: string): Promise<string> {
  const MAX_FAILS = 3;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const t = await googleTranslate(text);
      if (t) {
        consecutiveFails = 0;
        return t;
      }
    } catch {
      // keep retrying
    }
    if (consecutiveFails >= MAX_FAILS) break;
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    consecutiveFails++;
  }
  return text; // raw Chinese last-resort
}

export async function translateSegments(segments: Array<{ start: number; end: number; textZh: string }>): Promise<TranslatedSegment[]> {
  if (segments.length === 0) return [];
  const startTime = Date.now();

  const pending: number[] = [];
  const results = new Map<number, string>();

  // pass 1: dictionary / cache
  segments.forEach((s, i) => {
    if (cache.has(s.textZh)) results.set(i, cache.get(s.textZh)!);
    else if (DICT[s.textZh]) {
      cache.set(s.textZh, DICT[s.textZh]);
      results.set(i, DICT[s.textZh]);
    } else {
      pending.push(i);
    }
  });

  // pass 2: offline MT (batched) — free, no quota, works offline after first download
  if (pending.length && !offlineBroken) {
    const texts = pending.map((i) => segments[i].textZh);
    const outs = await offlineTranslate(texts);
    outs.forEach((t, idx) => {
      if (t) {
        const i = pending[idx];
        cache.set(segments[i].textZh, t);
        results.set(i, t);
      }
    });
  }

  // pass 3: google gtx for gaps
  const remaining = pending.filter((i) => !results.has(i));
  const REMAINING_CONCURRENCY = 2;
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= remaining.length) return;
      const i = remaining[idx];
      const vi = await fallbackTranslate(segments[i].textZh);
      if (vi) { cache.set(segments[i].textZh, vi); results.set(i, vi); }
    }
  }
  await Promise.all(Array.from({ length: REMAINING_CONCURRENCY }, () => worker()));

  const out = segments.map((s, i) => ({ start: s.start, end: s.end, textZh: s.textZh, textVi: results.get(i) ?? s.textZh }));
  try {
    logger.info(
      { count: out.length, provider: offlineBroken ? "google-gtx" : offlineModel, durationMs: Date.now() - startTime },
      "translate done"
    );
  } catch {}
  return out;
}