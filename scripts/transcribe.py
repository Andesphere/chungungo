#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import warnings
from pathlib import Path

from faster_whisper import WhisperModel
from yt_dlp import YoutubeDL

warnings.filterwarnings("ignore")


class SilentLogger:
    def debug(self, _msg):
        pass

    def warning(self, _msg):
        pass

    def error(self, _msg):
        pass


def download_audio(url: str, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(out_dir / "audio.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "noprogress": True,
        "logger": SilentLogger(),
        "progress_hooks": [lambda _d: None],
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
            }
        },
    }

    cookies_from_browser = os.getenv("YTDLP_COOKIES_FROM_BROWSER")
    if cookies_from_browser:
        ydl_opts["cookiesfrombrowser"] = (cookies_from_browser,)

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
    return Path(filename)


def transcribe(audio_path: Path) -> str:
    model_name = os.getenv("WHISPER_MODEL", "tiny")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("WHISPER_COMPUTE", "int8")

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(str(audio_path), vad_filter=True)
    text_parts = [segment.text.strip() for segment in segments if segment.text]
    return " ".join(text_parts).strip()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing URL"}))
        sys.exit(1)

    url = sys.argv[1]
    with tempfile.TemporaryDirectory() as tmp_dir:
        audio_path = download_audio(url, Path(tmp_dir))
        transcript = transcribe(audio_path)

    print(json.dumps({"transcript": transcript}))


if __name__ == "__main__":
    main()
