import axios from 'axios';
import type { ProductAdapter, ProductSearchQuery, Product } from '../interfaces.js';

export class ShopeeAdapter implements ProductAdapter {
  name = 'shopee';
  private cache = new Map<string, { at:number; data: Product[]}>();
  constructor(private affiliateKey = process.env.SHOPEE_AFFILIATE_KEY, private affiliateSecret = process.env.SHOPEE_AFFILIATE_SECRET) {}

  async search(query: ProductSearchQuery): Promise<Product[]> {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 5*60*1000) return cached.data;

    if (!this.affiliateKey) {
      // mock data for dev without credentials
      const mock: Product[] = [
        { productId: 'shp-1', title: 'Kệ lưu trữ nhà bếp đa năng', price: 199000, currency: 'VND', imageUrl: 'https://example.com/shp1.jpg', affiliateUrl: 'https://shopee.vn/mock-shp1?af=1' },
        { productId: 'shp-2', title: 'Hộp đựng đồ gia dụng trong suốt', price: 89000, currency: 'VND', imageUrl: 'https://example.com/shp2.jpg', affiliateUrl: 'https://shopee.vn/mock-shp2?af=1' },
      ].filter(p => query.keywords.some(kw => p.title.toLowerCase().includes(kw.toLowerCase())) || query.keywords.length===0);
      this.cache.set(key, { at: Date.now(), data: mock });
      return mock;
    }
    try {
      const res = await axios.get('https://affiliate.shopee.vn/api/v1/search', {
        params: { keyword: query.keywords.join(' '), limit: query.limit ?? 10 },
        headers: { Authorization: `Bearer ${this.affiliateKey}` },
        timeout: 8000,
      });
      const data: Product[] = (res.data?.products ?? []).map((p: Record<string, unknown>) => ({
        productId: String(p.productId), title: String(p.title), price: Number(p.price), currency: 'VND',
        imageUrl: String(p.image ?? ''), affiliateUrl: String(p.affiliateUrl ?? `https://shopee.vn/product/${p.productId}`)
      }));
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (cached) return cached.data;
      throw e;
    }
  }

  async getAffiliateLink(productId: string): Promise<string> {
    if (!this.affiliateKey) return `https://shopee.vn/product/${productId}?af=mock`;
    const res = await axios.post('https://affiliate.shopee.vn/api/v1/link', { productId }, {
      headers: { Authorization: `Bearer ${this.affiliateKey}` }, timeout: 8000
    });
    return String(res.data?.affiliateUrl ?? `https://shopee.vn/product/${productId}`);
  }
}
