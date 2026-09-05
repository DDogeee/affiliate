"""Extract burned-in (hardcoded) subtitles via OCR, grouped into timed segments.

Usage: python3 ocr_subs.py <media_path> <band_top_frac> <band_bottom_frac> <out_json>
Output: [{start, end, text}, ...] (UTF-8), times in seconds.

OCR engines (env OCR_ENGINE; default: qwen if DASHSCOPE_API_KEY set else tesseract):
  - qwen       Alibaba Cloud Model Studio (DashScope) qwen-vl-ocr — needs DASHSCOPE_API_KEY
  - tesseract  local OCR — needs tesseract + chi_sim pack installed
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

LANG = os.environ.get("OCR_LANG", "chi_sim")
DASHSCOPE_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
QWEN_MODEL = os.environ.get("QWEN_OCR_MODEL", "qwen-vl-ocr")

ENGINE = os.environ.get("OCR_ENGINE", "").lower() or "rapid"  # rapid | qwen | tesseract
FPS = float(os.environ.get("OCR_FPS", "2"))


def norm(t: str) -> str:
    return "".join(t.split())


def tesseract_ocr(png: str) -> str:
    if not shutil.which("tesseract"):
        return ""
    return subprocess.run(
        ["tesseract", png, "stdout", "-l", LANG, "--psm", "6", "--oem", "1"], capture_output=True, text=True, timeout=60
    ).stdout.strip()


def qwen_ocr(png: str) -> str:
    if not DASHSCOPE_KEY:
        return ""
    with open(png, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    body = {
        "model": QWEN_MODEL,
        "input": {"messages": [{"role": "user", "content": [{"image": f"data:image/png;base64,{b64}"}]}]},
    }
    req = urllib.request.Request(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {DASHSCOPE_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    try:
        return data["output"]["choices"][0]["message"]["content"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return ""


def _rapid_engine():
    from rapidocr_onnxruntime import RapidOCR  # lazy import (slow first time)

    return RapidOCR()


_rapid = None


def rapid_ocr(png: str) -> str:
    global _rapid
    if _rapid is None:
        _rapid = _rapid_engine()
    result, _elapse = _rapid(png)
    if not result:
        return ""
    return "\n".join(r[1] for r in result if len(r) >= 2 and r[1])


def run(cmd: list) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout


def clean_subtitle_segments(segments: list) -> list:
    """Post‑process OCR‑extracted segments.

    - drop single‑character lines (e.g. "V", "D", "O", "OE")
    - drop known on‑screen logo/noise tokens ("MANT", "PER", "RAP", "BEWAR")
    - drop duplicate consecutive texts (keeps first occurrence)
    - optionally merge very short gaps (keep original timing but remove
      segments < 0.8 s unless they are part of a longer run)
    - preserve the original start/end timestamps of kept segments
    """
    if not segments:
        return []

    cleaned: list = []
    prev_text: str | None = None
    for seg in segments:
        txt = seg.get("text", "") or ""
        # 1) drop single‑character or single‑symbol lines
        if len(txt.strip()) <= 1:
            continue
        # 2) drop known noise tokens (case‑insensitive)
        low = txt.strip().lower()
        if low in {"mant", "per", "rap", "bewar"}:
            continue
        # 3) drop if identical to previous kept text (de‑duplicate)
        if txt == prev_text:
            continue
        # 4) keep only if duration >= 0.8 s (simple heuristic)
        if cleaned:
            last = cleaned[-1]
            dur = seg["start"] - last["end"]
            if dur < 0.8 and len(txt) < 12:
                # very short trailing cue – skip
                continue
        cleaned.append({k: seg[k] for k in ("start", "end", "text")})
        prev_text = txt
    # 5) optionally compress leading/trailing tiny gaps by shifting start times
    # (simple: just keep timestamps as‑is; caller can re‑time if desired)
    return cleaned


def main(media_path: str, top: str, bottom: str, out_path: str) -> None:
    # engine resolution with graceful degradation: rapid -> qwen(key) -> tesseract
    if ENGINE == "rapid":
        try:
            import importlib

            importlib.import_module("rapidocr_onnxruntime")
            ocr = rapid_ocr
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"rapidocr unavailable ({exc}) — falling back to tesseract\n")
            ocr = tesseract_ocr
    elif ENGINE == "qwen" and DASHSCOPE_KEY:
        ocr = qwen_ocr
    else:
        if (ENGINE == "qwen") and not DASHSCOPE_KEY:
            sys.stderr.write("qwen requested but DASHSCOPE_API_KEY missing — falling back to tesseract\n")
        ocr = tesseract_ocr
    if ocr is tesseract_ocr and not shutil.which("tesseract"):
        sys.stderr.write("no OCR engine available\n")
        sys.exit(3)

    t, b = float(top), float(bottom)
    scale = "1600:-2"  # keep frames a reasonable size for any engine
    vf = f"crop=iw:trunc(ih*{(b - t):.4f}):0:trunc(ih*{t:.4f}),scale={scale},fps={FPS}"
    tmp = tempfile.mkdtemp(prefix="ocrsubs_")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", media_path, "-vf", vf, "-fps_mode", "vfr", f"{tmp}/f_%06d.png"],
            capture_output=True,
            timeout=600,
            check=True,
        )
    except subprocess.CalledProcessError:
        sys.stderr.write("ffmpeg frame extraction failed\n")
        sys.exit(4)

    frames = sorted(f for f in os.listdir(tmp) if f.startswith("f_"))
    if not frames:
        sys.stderr.write("no frames\n")
        sys.exit(5)

    timeline = []
    for i, f in enumerate(frames):
        t_sec = i / FPS
        txt = ocr(os.path.join(tmp, f))
        if ENGINE == "qwen":
            time.sleep(0.05)  # gentle pacing
        timeline.append((t_sec, txt or ""))

    segments: list = []
    cur = ""
    seg_start = 0.0
    for t_sec, txt in timeline:
        if norm(txt) != norm(cur):
            if cur and t_sec - seg_start >= 0.4:
                segments.append({"start": round(seg_start, 3), "end": round(t_sec, 3), "text": cur})
            cur = txt
            seg_start = t_sec if norm(txt) else t_sec + FPS
    if cur and timeline and timeline[-1][0] - seg_start >= 0.4:
        segments.append({"start": round(seg_start, 3), "end": round(timeline[-1][0] + FPS, 3), "text": cur})

    # ---- NEW: clean the segments ----
    segments = clean_subtitle_segments(segments)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(segments, fh, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.stderr.write("usage: ocr_subs.py <media> <top> <bottom> <out_json>\n")
        sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])