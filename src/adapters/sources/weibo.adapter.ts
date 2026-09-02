import axios from 'axios';
import type { SourceAdapter, CrawlOptions, CrawlResult, SourcePost } from '../interfaces.js';

const WEIBO_API = 'https://m.weibo.cn/api/container/getIndex';
const RATE_LIMIT_MS = 1500;
let lastCall = 0;

async function throttle() {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

export class WeiboAdapter implements SourceAdapter {
  name = 'weibo';
  constructor(private cookie?: string, private ua = 'Mozilla/5.0') {}

  async crawl(opts: CrawlOptions): Promise<CrawlResult> {
    await throttle();
    const keyword = opts.keywords.join(' ');
    const params: Record<string, string> = {
      containerid: `100103type=1&q=${encodeURIComponent(keyword)}&t=0`,
      page_type: 'searchall',
      page: opts.cursor ?? '1',
    };
    try {
      const res = await axios.get(WEIBO_API, {
        params,
        headers: {
          Cookie: this.cookie ?? process.env.WEIBO_COOKIE ?? '',
          'User-Agent': this.ua,
          Referer: 'https://m.weibo.cn/',
        },
        timeout: 15000,
      });
      const cards = res.data?.data?.cards ?? [];
      const posts: SourcePost[] = [];
      for (const card of cards) {
        const mblog = card.mblog;
        if (!mblog) continue;
        const videoUrl: string | null = mblog.page_info?.media_info?.mp4_hd_url
          ?? mblog.page_info?.media_info?.mp4_sd_url
          ?? null;
        if (!videoUrl) continue;
        const id: string = String(mblog.id ?? mblog.mid);
        posts.push({
          sourceId: id,
          source: 'weibo',
          topic: opts.topic,
          title: (mblog.text ?? '').replace(/<[^>]*>/g, '').slice(0, 120),
          text: (mblog.text ?? '').replace(/<[^>]*>/g, ''),
          videoUrl,
          author: mblog.user?.screen_name ?? 'unknown',
          publishedAt: mblog.created_at ?? new Date().toISOString(),
          raw: mblog,
          attribution: `Weibo @${mblog.user?.screen_name ?? 'unknown'} https://m.weibo.cn/detail/${id}`,
        });
        if (posts.length >= (opts.limit ?? 10)) break;
      }
      const hasMore = posts.length > 0 && (res.data?.data?.cardlistInfo?.page ?? 0) > Number(opts.cursor ?? 1);
      return { posts, hasMore, nextCursor: hasMore ? String(Number(opts.cursor ?? 1) + 1) : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Degrade: return empty for review, don't throw hard
      console.error(`[weibo] crawl failed keyword=${keyword} err=${msg}`);
      return { posts: [], hasMore: false };
    }
  }

  async fetchPost(sourceId: string): Promise<SourcePost | null> {
    await throttle();
    try {
      const res = await axios.get(`https://m.weibo.cn/statuses/show`, {
        params: { id: sourceId },
        headers: { Cookie: this.cookie ?? process.env.WEIBO_COOKIE ?? '', 'User-Agent': this.ua },
        timeout: 10000,
      });
      const m = res.data?.data;
      if (!m) return null;
      return {
        sourceId,
        source: 'weibo',
        topic: '',
        title: (m.text ?? '').replace(/<[^>]*>/g, '').slice(0,120),
        text: (m.text ?? '').replace(/<[^>]*>/g, ''),
        videoUrl: m.page_info?.media_info?.mp4_hd_url ?? null,
        author: m.user?.screen_name ?? 'unknown',
        publishedAt: m.created_at ?? new Date().toISOString(),
        raw: m,
        attribution: `Weibo @${m.user?.screen_name ?? 'unknown'} https://m.weibo.cn/detail/${sourceId}`,
      };
    } catch {
      return null;
    }
  }
}
