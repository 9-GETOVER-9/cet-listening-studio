#!/usr/bin/env python3
"""Build the private IELTS sentence-card manifest from the local Markdown corpus."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(r"D:\桌面\雅思100\九分学长听力音频库")
TIMED_LINE = re.compile(
    r"(?m)^- \*\*\[(\d{2}:\d{2}\.\d+)–(\d{2}:\d{2}\.\d+)\]\*\*\s+(.+?)\s*$"
)
ADMIN_LINE = re.compile(
    r"(?i)^(?:"
    r"(?:part|section)\s+(?:one|two|three|four|[1-4])\.?|"
    r"now turns? to part\s+(?:two|three|four|[2-4])\.?|"
    r"you(?: will|'ll) hear\b.*|"
    r"(?:first|1st),?\s+you\s+(?:have|will have)\s+some time\b.*|"
    r"before you listen(?: to the rest of the conversation)?,?\s+you have some time\b.*|"
    r"now,?\s+listen(?: carefully)?\s+and answer questions\b.*|"
    r"that is the end of (?:part|section)\b.*|"
    r"you now have\b.*\bto check your answers\b.*"
    r")$"
)


def seconds(value: str) -> float:
    minutes, seconds_text = value.split(":", 1)
    return int(minutes) * 60 + float(seconds_text)


def build_manifest(root: Path = ROOT, audio_dir: Path | None = None) -> dict:
    articles = []
    for part in range(1, 5):
        markdown = root / "原文Markdown" / f"Part {part}.md"
        text = markdown.read_text(encoding="utf-8")
        sections = re.split(r"(?m)^## ", text)[1:]
        if len(sections) < 10:
            raise ValueError(f"Part {part} has fewer than ten article sections")
        for number, section in enumerate(sections[:10], 1):
            lines = section.splitlines()
            title = lines[0].strip()
            audio_match = re.search(r"(?m)^- \*\*原平台音频地址\*\*：([^\s]+)\s*$", section)
            if not audio_match:
                raise ValueError(f"Missing audio URL for Part {part}, article {number}")
            audio_url = audio_match.group(1).strip()
            parsed = urlsplit(audio_url)
            if parsed.scheme != "https" or parsed.hostname != "static.9fnnn.com" or parsed.username or parsed.password or parsed.fragment:
                raise ValueError(f"Unapproved audio source for Part {part}, article {number}")
            local_match = re.search(r"(?m)^- \*\*本地路径\*\*：`([^`]+)`\s*$", section)
            if not local_match:
                raise ValueError(f"Missing local audio path for Part {part}, article {number}")
            local_audio = Path(local_match.group(1)).resolve()
            if not local_audio.is_relative_to(root.resolve()) or not local_audio.is_file():
                raise ValueError(f"Local audio is missing or outside the source folder: Part {part}, article {number}")

            matches = []
            for line_index, line in enumerate(lines):
                match = TIMED_LINE.match(line)
                if match:
                    matches.append((line_index, match))
            if not matches:
                raise ValueError(f"No timed sentence lines for Part {part}, article {number}")
            sentences = []
            for source_index, (line_index, match) in enumerate(matches, 1):
                english = match.group(3).strip()
                if ADMIN_LINE.fullmatch(english):
                    continue
                next_line = lines[line_index + 1] if line_index + 1 < len(lines) else ""
                translation_match = re.match(r"\s+- 中文：(.+?)\s*$", next_line)
                if not translation_match:
                    raise ValueError(f"Missing Chinese translation in {markdown.name}: {match.group(3)}")
                start, end = seconds(match.group(1)), seconds(match.group(2))
                if end <= start:
                    raise ValueError(f"Invalid clip range in {markdown.name}: {match.group(0)}")
                sentences.append({
                    "id": f"p{part}-a{number:02d}-s{source_index:03d}",
                    "sourceIndex": source_index,
                    "english": english,
                    "chinese": translation_match.group(1).strip(),
                    "start": start,
                    "end": end,
                })

            article_id = f"p{part}-a{number:02d}"
            digest = hashlib.sha256()
            with local_audio.open("rb") as media:
                for chunk in iter(lambda: media.read(1024 * 1024), b""):
                    digest.update(chunk)
            if audio_dir:
                audio_dir.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(local_audio, audio_dir / f"{article_id}.mp3")
            articles.append({
                "id": article_id,
                "part": part,
                "number": number,
                "title": title,
                "audioFile": f"{article_id}.mp3",
                "audioBytes": local_audio.stat().st_size,
                "audioSha256": digest.hexdigest(),
                "sentences": sentences,
            })
    return {"schemaVersion": 1, "parts": 4, "articlesPerPart": 10, "articles": articles}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path)
    args = parser.parse_args()
    manifest = build_manifest(args.source, args.audio_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total_bytes = sum(article["audioBytes"] for article in manifest["articles"])
    print(f"Built {len(manifest['articles'])} articles / {sum(len(a['sentences']) for a in manifest['articles'])} sentence cards / {total_bytes} audio bytes")


if __name__ == "__main__":
    main()
