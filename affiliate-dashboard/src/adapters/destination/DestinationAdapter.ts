export interface DestinationAdapter {
  publish(videoPath: string, caption: string, affiliateLink: string): Promise<{ postUrl: string; postId: string }>;
}
