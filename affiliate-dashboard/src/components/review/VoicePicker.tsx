"use client";
export default function VoicePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">Speed</span>
      <input type="range" min={0.8} max={1.2} step={0.1} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="text-xs">{value.toFixed(1)}x</span>
    </div>
  );
}
