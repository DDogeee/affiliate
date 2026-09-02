import axios from 'axios';
import type { ProductAdapter, ProductSearchQuery, Product } from '../interfaces.js';

export class TikTokShopAdapter implements ProductAdapter {
  name = 'tiktok-shop';
  private cache = new Map<string, { at:number; data: Product[]}>();
  constructor(private key = process.env.TIKTOK_SHOP_KEY, private secret = process.env.TIKTOK_SHOP_SECRET) {}

  async search(query: ProductSearchQuery): Promise<Product[]> {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 5*60*1000) return cached.data;
    if (!this.key) {
      const mock: Product[] = [
        { productId: 'tt-1', title: 'Giá treo đồ nhà bếp thông minh', price: 149000, currency: 'VND', imageUrl: 'https://example.com/tt1.jpg', affiliateUrl: 'https://shop.tiktok.com/mock-tt1?af=1' },
        { productId: 'tt-2', title: 'Kệ góc nhà tắm inox', price: 229000, currency: 'VND', imageUrl: 'https://example.com/tt2.jpg', affiliateUrl: 'https://shop.tiktok.com/mock-tt2?af=1' },
      ].filter(p => query.keywords.length===0 || query.keywords.some(kw=> p.title.toLowerCase().includes(kw.toLowerCase())));
      this.cache.set(key, { at: Date.now(), data: mock });
      return mock;
    }
    try {
      const res = await axios.get('https://affiliate.tiktokshop.com/api/search', {
        params: { keyword: query.keywords.join(' '), limit: query.limit ?? 10 },
        headers: { 'X-Api-Key': this.key }, timeout: 8000
      });
      const data: Product[] = (res.data?.products ?? []).map((p: Record<string, unknown>) => ({
        productId: String(p.product_id), title: String(p.title), price: Number(p.price), currency: 'VND',
        imageUrl: String(p.image ?? ''), affiliateUrl: String(p.share_url ?? `https://shop.tiktok.com/${p.product_id}`)
      }));
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (cached) return cached.data;
      throw e;
    }
  }
  async getAffiliateLink(productId: string): Promise<string> {
    if (!this.key) return `https://shop.tiktok.com/${productId}?af=mock`;
    const res = await axios.post('https://affiliate.tiktokshop.com/api/link', { product_id: productId }, {
      headers: { 'X-Api-Key': this.key }, timeout: 8000
    });
    return String(res.data?.share_url ?? `https://shop.tiktok.com/${productId}`);
  }
}
