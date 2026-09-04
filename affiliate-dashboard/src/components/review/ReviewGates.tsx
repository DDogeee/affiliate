"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SubtitleEditor from "./SubtitleEditor";
import VoicePicker from "./VoicePicker";
import ShopeePicker from "./ShopeePicker";
import ApproveBar from "./ApproveBar";
import type { ShopeeOffer } from "@/types/job";

export default function ReviewGates({ job }: { job: any }) {
  const router = useRouter();
  const [voice, setVoice] = useState<number>((job.voiceStyle as any)?.speed ?? 1.0);
  const translation = (job.translation as any[]) ?? [];
  const offers = (job.shopeeOffers as any[]) ?? [];

  async function saveSubtitles(edits: any[]) {
    await fetch(`/api/jobs/${job.id}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subtitleEdits: edits }) });
    router.refresh();
  }
  async function saveVoice(v: number) {
    setVoice(v);
    await fetch(`/api/jobs/${job.id}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceStyle: { speed: v } }) });
    router.refresh();
  }
  async function pickOffer(id: string) {
    await fetch(`/api/jobs/${job.id}/pick-offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickedOfferId: id }) });
    router.refresh();
  }
  async function skip() {
    await fetch(`/api/jobs/${job.id}/pick-offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    router.refresh();
  }
  async function approve() {
    await fetch(`/api/jobs/${job.id}/approve`, { method: "POST" });
    router.refresh();
  }

  const canApprove = !!job.pickedOfferId || offers.length > 0; // simplified gate

  return (
    <div className="space-y-4">
      {translation.length > 0 && (
        <div className="border p-3 rounded">
          <h2 className="font-bold text-sm">Subtitles ({translation.length})</h2>
          <SubtitleEditor segments={translation} onSave={saveSubtitles} />
        </div>
      )}
      <div className="border p-3 rounded">
        <h2 className="font-bold text-sm">Voice</h2>
        <VoicePicker value={voice} onChange={saveVoice} />
      </div>
      <div className="border p-3 rounded">
        <h2 className="font-bold text-sm">Shopee Offers {offers.length > 0 ? `(${offers.length})` : "(search on Pick)"}</h2>
        <ShopeePicker offers={offers as ShopeeOffer[]} onPick={pickOffer} onSkip={skip} />
      </div>
      <ApproveBar canApprove={canApprove} onApprove={approve} onSkip={skip} />
    </div>
  );
}
