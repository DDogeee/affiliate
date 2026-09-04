import type { AffiliateAdapter } from "./AffiliateAdapter";
import type { ShopeeOffer } from "@/types/job";
export class ShopeeAffiliateAdapter implements AffiliateAdapter {
  async search(query: string): Promise<ShopeeOffer[]> {
    // Stub: return mock top-5
    if (!query) return [];
    return Array.from({ length: 5 }, (_, i) => ({
      id: `shopee-${i}`,
      title: `${query} - Mẫu ${i+1}`,
      image: `https://picsum.photos/200?${i}`,
      price: 199000 + i * 50000,
      commissionRate: 5 + i,
      affiliateLink: `https://shopee.vn/product-${i}?aff=${query.slice(0,5)}`,
    }));
  }
}
