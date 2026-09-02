import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import type { PublisherAdapter, PublishInput, PublishResult } from '../interfaces.js';

export class TikTokAdapter implements PublisherAdapter {
  name = 'tiktok';
  constructor(private token = process.env.TIKTOK_ACCESS_TOKEN) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.token) {
      return { platformPostId: `tt-mock-${Date.now()}`, url: `https://tiktok.com/mock/${Date.now()}` };
    }
    // TikTok Upload API (simplified)
    const form = new FormData();
    form.append('video', fs.createReadStream(input.videoPath));
    form.append('text', this.buildCaption(input));
    try {
      const res = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${this.token}` },
        timeout: 120000, maxBodyLength: Infinity
      });
      const id = String(res.data?.data?.publish_id ?? `tt-${Date.now()}`);
      return { platformPostId: id, url: `https://tiktok.com/${id}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('429')) {
        const err = new Error('TIKTOK_RATE_LIMIT');
        (err as unknown as Record<string, unknown>).retryAfter = 60000;
        throw err;
      }
      throw e;
    }
  }
  private buildCaption(input: PublishInput): string {
    const links = input.affiliateLinks.join(' ');
    return `${input.caption} ${links}`.trim().slice(0, 2200);
  }
}
