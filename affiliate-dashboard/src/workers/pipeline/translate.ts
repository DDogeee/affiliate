export interface TranslatedSegment { start: number; end: number; textVi: string; textZh: string }
const DICT: Record<string, string> = {
  "大家好，看看这个清洁工具": "Xin chào, xem dụng cụ vệ sinh này",
  "非常实用，轻松清洁": "Rất tiện dụng, vệ sinh nhẹ nhàng",
  "强力清洁": "Làm sạch mạnh mẽ",
  "家务必备": "Thiết yếu cho việc nhà",
};
export async function translateSegments(segments: Array<{ start: number; end: number; textZh: string }>): Promise<TranslatedSegment[]> {
  // Simulate 1:1 mapping preserving timing; retry logic in caller
  return segments.map((s) => ({
    start: s.start,
    end: s.end,
    textZh: s.textZh,
    textVi: DICT[s.textZh] ?? s.textZh,
  }));
}
