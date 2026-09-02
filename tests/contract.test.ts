import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../src/adapters/interfaces.js';
import type { SourceAdapter, ProductAdapter, PublisherAdapter } from '../src/adapters/interfaces.js';

// Mock adapters proving extensibility — adding Douyin/Lazada is same contract
class MockSource implements SourceAdapter {
  name = 'douyin';
  async crawl() { return { posts: [{ sourceId: 'd1', source: 'douyin', topic: 'test', title: 'mock', text: '厨房收纳', videoUrl: 'https://example.com/v.mp4', author: 'a', publishedAt: new Date().toISOString(), raw: {}, attribution: 'Douyin @a' }], hasMore: false }; }
  async fetchPost() { return null; }
}
class MockProduct implements ProductAdapter {
  name = 'lazada';
  async search() { return [{ productId: 'lz-1', title: 'Mock Lazada', price: 100000, currency: 'VND', imageUrl: '', affiliateUrl: 'https://lazada.vn/mock' }]; }
  async getAffiliateLink(id: string) { return `https://lazada.vn/${id}`; }
}
class MockPublisher implements PublisherAdapter {
  name = 'youtube';
  async publish() { return { platformPostId: 'yt-1', url: 'https://youtube.com/mock' }; }
}

describe('contract: AdapterRegistry', () => {
  it('registers and lists pluggable adapters without core change', () => {
    const r = new AdapterRegistry();
    r.registerSource(new MockSource());
    r.registerProduct(new MockProduct());
    r.registerPublisher(new MockPublisher());
    expect(r.listSources()).toContain('douyin');
    expect(r.listProducts()).toContain('lazada');
    expect(r.listPublishers()).toContain('youtube');
  });

  it('rejects invalid adapter names', () => {
    const r = new AdapterRegistry();
    const bad = { name: 'Bad Name!', crawl: async()=>({posts:[],hasMore:false}), fetchPost: async()=>null } as unknown as SourceAdapter;
    expect(()=> r.registerSource(bad)).toThrow();
  });

  it('rejects duplicate registration', () => {
    const r = new AdapterRegistry();
    r.registerSource(new MockSource());
    expect(()=> r.registerSource(new MockSource())).toThrow(/already registered/);
  });

  it('validates interface compliance', () => {
    const r = new AdapterRegistry();
    const incomplete = { name: 'bad' } as unknown as SourceAdapter;
    expect(()=> r.registerSource(incomplete)).toThrow(/missing method/);
  });
});

describe('contract: real adapters implement interfaces', () => {
  it('weibo adapter satisfies SourceAdapter', async () => {
    const { WeiboAdapter } = await import('../src/adapters/sources/weibo.adapter.js');
    const a = new WeiboAdapter();
    expect(typeof a.crawl).toBe('function');
    expect(typeof a.fetchPost).toBe('function');
    expect(a.name).toBe('weibo');
  });
  it('shopee and tiktok-shop satisfy ProductAdapter', async () => {
    const { ShopeeAdapter } = await import('../src/adapters/products/shopee.adapter.js');
    const { TikTokShopAdapter } = await import('../src/adapters/products/tiktok-shop.adapter.js');
    for (const A of [ShopeeAdapter, TikTokShopAdapter]) {
      const a = new (A as unknown as new()=> ProductAdapter)();
      expect(typeof a.search).toBe('function');
      expect(typeof a.getAffiliateLink).toBe('function');
    }
  });
  it('facebook and tiktok satisfy PublisherAdapter', async () => {
    const { FacebookAdapter } = await import('../src/adapters/publishers/facebook.adapter.js');
    const { TikTokAdapter } = await import('../src/adapters/publishers/tiktok.adapter.js');
    for (const A of [FacebookAdapter, TikTokAdapter]) {
      const a = new (A as unknown as new()=> PublisherAdapter)();
      expect(typeof a.publish).toBe('function');
    }
  });
});
