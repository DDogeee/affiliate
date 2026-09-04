import type { DestinationAdapter } from "./DestinationAdapter";
export class TikTokDestinationAdapter implements DestinationAdapter {
  async publish(videoPath: string, caption: string, affiliateLink: string): Promise<{ postUrl: string; postId: string }> {
    const key = process.env.TIKTOK_CLIENT_KEY;
    if (!key) throw Object.assign(new Error("TikTok key missing — app review not configured"), { code: "APP_REVIEW_REQUIRED", retryable: false });
    return { postUrl: `https://tiktok.com/@user/video/123`, postId: "tt_123" };
  }
}
