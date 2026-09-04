"""Real ASR via faster-whisper (CPU, int8, no API key).

Usage: python3 whisper_asr.py <media_path> <out_json>
Output: [{start, end, text}, ...] (UTF-8), times in seconds.
Model size + cache dir from env WHISPER_MODEL / WHISPER_CACHE.
"""
import json
import os
import sys


def main(media_path: str, out_path: str) -> None:
    model_size = os.environ.get("WHISPER_MODEL", "base")
    cache = os.environ.get("WHISPER_CACHE", "/app/storage/tmp/whisper")
    os.makedirs(cache, exist_ok=True)
    from faster_whisper import WhisperModel  # imported lazily; may take a second

    model = WhisperModel(model_size, device="cpu", compute_type="int8", download_root=cache)
    segments, _info = model.transcribe(
        media_path,
        language="zh",
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False,
    )
    out = [
        {"start": round(s.start, 3), "end": round(s.end, 3), "text": (s.text or "").strip()}
        for s in segments
        if (s.text or "").strip()
    ]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.stderr.write("usage: whisper_asr.py <media_path> <out_json>\n")
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])