import type { DestinationAdapter } from "./DestinationAdapter";
export class FacebookDestinationAdapter implements DestinationAdapter {
  async publish(videoPath: string, caption: string, affiliateLink: string): Promise<{ postUrl: string; postId: string }> {
    const token = process.env.FB_PAGE_TOKEN;
    const pageId = process.env.FB_PAGE_ID;
    if (!token || !pageId) throw Object.assign(new Error("FB token/pageId missing — app review not configured"), { code: "APP_REVIEW_REQUIRED", retryable: false });
    // Stub success
    return { postUrl: `https://facebook.com/${pageId}/video/123`, postId: "fb_123" };
  }
}
