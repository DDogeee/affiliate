"use client";
import type { ShopeeOffer } from "@/types/job";
export default function ShopeePicker({ offers, onPick, onSkip }: { offers: ShopeeOffer[]; onPick: (id: string) => void; onSkip: () => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {offers.map((o) => (
          <div key={o.id} className="border p-2 rounded">
            <img src={o.image} alt={o.title} className="w-full h-24 object-cover" />
            <div className="text-xs font-bold truncate">{o.title}</div>
            <div className="text-xs">{o.price.toLocaleString()} đ • {o.commissionRate}%</div>
            <button onClick={() => onPick(o.id)} className="mt-1 bg-black text-white px-2 py-1 rounded text-xs">Pick</button>
          </div>
        ))}
      </div>
      {offers.length === 0 && <p className="text-xs text-gray-500">No offers found</p>}
      <button onClick={onSkip} className="mt-3 border px-3 py-1 rounded text-xs">Skip — no match</button>
    </div>
  );
}
