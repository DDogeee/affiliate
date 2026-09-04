export interface SourceAdapter {
  fetch(url: string): Promise<{
    videoPath: string;
    meta: { title: string; thumbnail: string; ownerHandle: string };
    comments: Array<{ text: string; link?: string }>;
  }>;
}
