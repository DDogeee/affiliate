import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import type { PublisherAdapter, PublishInput, PublishResult } from '../interfaces.js';

export class FacebookAdapter implements PublisherAdapter {
  name = 'facebook';
  constructor(private pageId = process.env.FB_PAGE_ID, private token = process.env.FB_PAGE_TOKEN) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.token || !this.pageId) {
      // mock publish
      return { platformPostId: `fb-mock-${Date.now()}`, url: `https://facebook.com/mock/${Date.now()}` };
    }
    // 1. upload video
    const form = new FormData();
    form.append('source', fs.createReadStream(input.videoPath));
    form.append('description', this.buildCaption(input));
    form.append('access_token', this.token);
    try {
      const res = await axios.post(`https://graph.facebook.com/v20.0/${this.pageId}/videos`, form, {
        headers: form.getHeaders(), timeout: 120000, maxBodyLength: Infinity
      });
      const id = String(res.data?.id ?? `fb-${Date.now()}`);
      return { platformPostId: id, url: `https://facebook.com/${id}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('429') || msg.includes('rate')) {
        const err = new Error('FACEBOOK_RATE_LIMIT');
        (err as unknown as Record<string, unknown>).retryAfter = 60000;
        throw err;
      }
      throw e;
    }
  }

  private buildCaption(input: PublishInput): string {
    const links = input.affiliateLinks.map((u,i)=> `🔗 Sản phẩm ${i+1}: ${u}`).join('\n');
    return `${input.caption}\n\n${links}`.trim();
  }
}
