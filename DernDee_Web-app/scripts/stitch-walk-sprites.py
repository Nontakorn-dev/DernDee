#!/usr/bin/env python3
"""Stitch Grok walk-cycle frames into sprite sheets for Free Walk.

Drop 4 frames each:
  public/images/walk/raw/walker-up-1.png … walker-up-4.png
  public/images/walk/raw/walker-down-1.png … walker-down-4.png

Then:
  python3 scripts/stitch-walk-sprites.py

Writes:
  public/images/walk/walker-up.png
  public/images/walk/walker-down.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "public" / "images" / "walk" / "raw"
OUT = ROOT / "public" / "images" / "walk"
FRAME_H = 384
FRAMES = 4


def chromakey(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    pix = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            greenness = g - max(r, b)
            if g > 155 and greenness > 42:
                t = min(1.0, (greenness - 42) / 70.0)
                alpha = int(round(a * (1.0 - t)))
                g2 = min(g, max(r, b) + 10)
                pix[x, y] = (r, g2, b, alpha)
            elif g > max(r, b) + 18:
                pix[x, y] = (r, max(r, b) + 6, b, a)
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit("empty after chromakey")
    pad = 12
    return im.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(w, bbox[2] + pad),
        min(h, bbox[3] + pad),
    ))


def fit_frame(im: Image.Image) -> Image.Image:
    ratio = FRAME_H / im.height
    sized = im.resize((max(1, round(im.width * ratio)), FRAME_H), Image.Resampling.LANCZOS)
    canvas_w = max(sized.width, round(FRAME_H * 0.72))
    canvas = Image.new("RGBA", (canvas_w, FRAME_H), (0, 0, 0, 0))
    canvas.paste(sized, ((canvas_w - sized.width) // 2, 0), sized)
    return canvas


def stitch(prefix: str, dest_name: str) -> None:
    frames = []
    for index in range(1, FRAMES + 1):
        path = RAW / f"{prefix}-{index}.png"
        if not path.exists():
            path = RAW / f"{prefix}-{index}.jpg"
        if not path.exists():
            raise SystemExit(f"missing {path}")
        frames.append(fit_frame(chromakey(Image.open(path))))

    width = max(frame.width for frame in frames)
    sheet = Image.new("RGBA", (width * FRAMES, FRAME_H), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        x = index * width + (width - frame.width) // 2
        sheet.paste(frame, (x, 0), frame)
    dest = OUT / dest_name
    sheet.save(dest, "PNG", optimize=True)
    print(f"wrote {dest} {sheet.size}")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    stitch("walker-up", "walker-up.png")
    stitch("walker-down", "walker-down.png")


if __name__ == "__main__":
    main()
