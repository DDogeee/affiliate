export function generateCaption(segments: Array<{ textVi: string }>, offerTitle: string): string {
  const hashtags = "#cleaning #nhacua #shopee";
  return `${segments.slice(0,2).map(s=>s.textVi).join(" ")} — ${offerTitle}\n${hashtags}\nLink affiliate — mình có hoa hồng: {{AFF_LINK}}`;
}
