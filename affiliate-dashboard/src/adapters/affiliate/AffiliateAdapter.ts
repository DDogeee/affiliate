import type { ShopeeOffer } from "@/types/job";

export interface AffiliateAdapter {
  search(query: string, opts?: { transcript?: string; imagePath?: string }): Promise<ShopeeOffer[]>;
}
