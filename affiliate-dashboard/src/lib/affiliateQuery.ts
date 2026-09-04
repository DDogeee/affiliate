export function parseOwnerComment(comments: Array<{ text: string; link?: string }>): string {
  for (const c of comments) {
    if (c.link && /taobao|jd\.com|tmall/.test(c.link)) return c.link;
    if (c.text.length > 5) return c.text.slice(0, 80);
  }
  return "";
}
