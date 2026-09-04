"use client";
import { useState } from "react";
export default function SubtitleEditor({ segments, onSave }: { segments: Array<{ start: number; end: number; textVi: string }>; onSave: (edits: any[]) => void }) {
  const [edits, setEdits] = useState(segments);
  return (
    <div className="space-y-2">
      {edits.map((s, i) => (
        <input key={i} value={s.textVi} onChange={(e) => { const n=[...edits]; n[i]={...s, textVi:e.target.value}; setEdits(n); }} className="border rounded px-2 py-1 w-full text-sm" />
      ))}
      <button onClick={() => onSave(edits)} className="bg-black text-white px-3 py-1 rounded text-sm">Save & Re-render</button>
    </div>
  );
}
