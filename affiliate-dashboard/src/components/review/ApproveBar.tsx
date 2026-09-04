"use client";
export default function ApproveBar({ canApprove, onApprove, onSkip }: { canApprove: boolean; onApprove: () => void; onSkip: () => void }) {
  return (
    <div className="flex gap-2">
      <button disabled={!canApprove} onClick={onApprove} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50 text-sm">Approve</button>
      <button onClick={onSkip} className="border px-4 py-2 rounded text-sm">Skip</button>
    </div>
  );
}
