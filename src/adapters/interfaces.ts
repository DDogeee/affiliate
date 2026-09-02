export type SourcePost = {
  sourceId: string;
  source: string;
  topic: string;
  title: string;
  text: string;
  videoUrl: string | null;
  author: string;
  publishedAt: string;
  raw: unknown;
  attribution: string;
};

export type CrawlResult = {
  posts: SourcePost[];
  hasMore: boolean;
  nextCursor?: string;
};

export type CrawlOptions = {
  topic: string;
  keywords: string[];
  cursor?: string;
  limit?: number;
};

export interface SourceAdapter {
  name: string;
  crawl(opts: CrawlOptions): Promise<CrawlResult>;
  fetchPost(sourceId: string): Promise<SourcePost | null>;
}

export type Product = {
  productId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  affiliateUrl: string;
  score?: number;
};

export type ProductSearchQuery = {
  keywords: string[];
  category?: string;
  limit?: number;
  embeddings?: number[];
};

export interface ProductAdapter {
  name: string;
  search(query: ProductSearchQuery): Promise<Product[]>;
  getAffiliateLink(productId: string): Promise<string>;
}

export type PublishInput = {
  videoPath: string;
  caption: string;
  affiliateLinks: string[];
  scheduledAt?: string;
};

export type PublishResult = {
  platformPostId: string;
  url: string;
};

export interface PublisherAdapter {
  name: string;
  publish(input: PublishInput): Promise<PublishResult>;
  schedule?(input: PublishInput): Promise<PublishResult>;
}

// Registry
export type AdapterType = 'source' | 'product' | 'publisher';

export class AdapterRegistry {
  private sources = new Map<string, SourceAdapter>();
  private products = new Map<string, ProductAdapter>();
  private publishers = new Map<string, PublisherAdapter>();

  registerSource(adapter: SourceAdapter) {
    this.validateName(adapter.name);
    if (this.sources.has(adapter.name)) throw new Error(`Source ${adapter.name} already registered`);
    this.assertImplements(adapter, ['crawl', 'fetchPost']);
    this.sources.set(adapter.name, adapter);
  }
  registerProduct(adapter: ProductAdapter) {
    this.validateName(adapter.name);
    if (this.products.has(adapter.name)) throw new Error(`Product ${adapter.name} already registered`);
    this.assertImplements(adapter, ['search', 'getAffiliateLink']);
    this.products.set(adapter.name, adapter);
  }
  registerPublisher(adapter: PublisherAdapter) {
    this.validateName(adapter.name);
    if (this.publishers.has(adapter.name)) throw new Error(`Publisher ${adapter.name} already registered`);
    this.assertImplements(adapter, ['publish']);
    this.publishers.set(adapter.name, adapter);
  }

  getSource(name: string): SourceAdapter | undefined { return this.sources.get(name); }
  getProduct(name: string): ProductAdapter | undefined { return this.products.get(name); }
  getPublisher(name: string): PublisherAdapter | undefined { return this.publishers.get(name); }

  listSources(): string[] { return [...this.sources.keys()]; }
  listProducts(): string[] { return [...this.products.keys()]; }
  listPublishers(): string[] { return [...this.publishers.keys()]; }

  private validateName(name: string) {
    if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid adapter name ${name}`);
  }
  private assertImplements(obj: unknown, methods: string[]) {
    for (const m of methods) if (typeof (obj as Record<string, unknown>)[m] !== 'function') throw new Error(`Adapter missing method ${m}`);
  }
}

export const registry = new AdapterRegistry();
