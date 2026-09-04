export type JobState =
  | "queued"
  | "fetched"
  | "processing"
  | "needs_review"
  | "approved"
  | "publishing"
  | "published"
  | "skipped"
  | "failed";

export interface ShopeeOffer {
  id: string;
  title: string;
  image: string;
  price: number;
  commissionRate: number;
  affiliateLink: string;
}

export interface PublishStatus {
  facebook?: { status: "pending" | "publishing" | "published" | "failed"; postUrl?: string; error?: string; updatedAt: string };
  tiktok?: { status: "pending" | "publishing" | "published" | "failed"; postUrl?: string; error?: string; updatedAt: string };
}
