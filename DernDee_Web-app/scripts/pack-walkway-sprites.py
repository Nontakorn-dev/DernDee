#!/usr/bin/env python3
"""Pack Free Walk sprite strips from chroma-keyed Grok videos.

Same pipeline as Trail Quest (`make_sprite_atlas.py`): pink studio video → walk frames.

Looks for:
  public/images/walk/walk1.mp4  (away / up)
  public/images/walk/walk2.mp4  (toward / down)

Then:
  python3 scripts/pack-walkway-sprites.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "public" / "images" / "walk" / "raw"
OUT = ROOT / "public" / "images" / "walk"
DECODE_PX = 640
FRAME_PX = 320
FRAMES = 8


def chroma_rgba(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    hot = r - g
    pink = b - g
    hard = (r > 158) & (g < 50) & (hot > 115) & (pink > 28)
    rgba = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = 255
    rgba[hard] = 0
    soft = (r > 148) & (g < 108) & (hot > 52) & (pink > 6) & ~hard
    if np.any(soft):
        tg = np.clip((92 - g.astype(np.float32)) / 58.0, 0, 1)
        tp = np.clip(pink.astype(np.float32) / 85.0, 0, 1)
        t = tg * np.maximum(tp, 0.35)
        mag = np.maximum(0, np.minimum(r, b) - g).astype(np.float32)
        rr = rgba[:, :, 0].astype(np.float32)
        gg = rgba[:, :, 1].astype(np.float32)
        bb = rgba[:, :, 2].astype(np.float32)
        aa = rgba[:, :, 3].astype(np.float32)
        use = soft & (t >= 0.12)
        next_a = aa * (1.0 - t * 0.94)
        rr = np.where(use, np.maximum(0, rr - mag * t * 0.7), rr)
        gg = np.where(use, np.minimum(255, gg + mag * t * 0.22), gg)
        bb = np.where(use, np.maximum(0, bb - mag * t * 0.55), bb)
        kill = use & (next_a < 18)
        aa = np.where(use, next_a, aa)
        rgba[:, :, 0] = np.where(kill, 0, rr).astype(np.uint8)
        rgba[:, :, 1] = np.where(kill, 0, gg).astype(np.uint8)
        rgba[:, :, 2] = np.where(kill, 0, bb).astype(np.uint8)
        rgba[:, :, 3] = np.where(kill, 0, aa).astype(np.uint8)
    return rgba


def content_bbox(alpha: np.ndarray, thresh: int = 18):
    rows = np.any(alpha > thresh, axis=1)
    cols = np.any(alpha > thresh, axis=0)
    if not rows.any() or not cols.any():
        return None
    y0, y1 = int(np.argmax(rows)), int(len(rows) - np.argmax(rows[::-1]))
    x0, x1 = int(np.argmax(cols)), int(len(cols) - np.argmax(cols[::-1]))
    return x0, y0, x1, y1


def decode_rgb(src: Path) -> list[np.ndarray]:
    proc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-i", str(src),
            "-vf", f"scale={DECODE_PX}:{DECODE_PX}:flags=lanczos,format=rgb24",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdout
    nbytes = DECODE_PX * DECODE_PX * 3
    frames = []
    while True:
        buf = proc.stdout.read(nbytes)
        if not buf or len(buf) < nbytes:
            break
        frames.append(np.frombuffer(buf, dtype=np.uint8).reshape(DECODE_PX, DECODE_PX, 3).copy())
    err = proc.stderr.read() if proc.stderr else b""
    if proc.wait() != 0:
        raise RuntimeError(f"decode {src}: {err[-800:].decode(errors='replace')}")
    if len(frames) < FRAMES:
        raise SystemExit(f"{src.name} has only {len(frames)} frames, need a 3–5s walk loop")
    return frames


def layout_square(rgba: np.ndarray) -> np.ndarray:
    out = np.zeros((FRAME_PX, FRAME_PX, 4), dtype=np.uint8)
    box = content_bbox(rgba[:, :, 3])
    if box is None:
        return out
    x0, y0, x1, y1 = box
    pad = 10
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(rgba.shape[1], x1 + pad), min(rgba.shape[0], y1 + pad)
    crop = rgba[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    scale = min((FRAME_PX * 0.88) / max(cw, 1), (FRAME_PX * 0.88) / max(ch, 1))
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    ys = np.linspace(0, ch - 1, nh)
    xs = np.linspace(0, cw - 1, nw)
    y0i = np.floor(ys).astype(np.int32)
    x0i = np.floor(xs).astype(np.int32)
    y1i = np.minimum(y0i + 1, ch - 1)
    x1i = np.minimum(x0i + 1, cw - 1)
    wy = (ys - y0i)[:, None, None]
    wx = (xs - x0i)[None, :, None]
    src_f = crop.astype(np.float32)
    top = src_f[y0i][:, x0i] * (1 - wx) + src_f[y0i][:, x1i] * wx
    bot = src_f[y1i][:, x0i] * (1 - wx) + src_f[y1i][:, x1i] * wx
    scaled = np.clip(top * (1 - wy) + bot * wy, 0, 255).astype(np.uint8)
    ox = (FRAME_PX - nw) // 2
    oy = FRAME_PX - nh - 8
    out[oy:oy + nh, ox:ox + nw] = scaled
    return out


def pick_loop_indices(n: int) -> list[int]:
    start = max(1, int(n * 0.12))
    end = max(start + FRAMES, int(n * 0.88))
    xs = np.linspace(start, end - 1, FRAMES, endpoint=False)
    return [int(round(x)) for x in xs]


def pack_video(src: Path, dest: Path) -> None:
    rgb_frames = decode_rgb(src)
    idxs = pick_loop_indices(len(rgb_frames))
    cells = [layout_square(chroma_rgba(rgb_frames[i])) for i in idxs]
    sheet = np.zeros((FRAME_PX, FRAME_PX * FRAMES, 4), dtype=np.uint8)
    for i, cell in enumerate(cells):
        sheet[:, i * FRAME_PX:(i + 1) * FRAME_PX] = cell
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "rgba",
            "-s", f"{sheet.shape[1]}x{sheet.shape[0]}",
            "-i", "pipe:0", "-frames:v", "1", str(dest),
        ],
        input=sheet.tobytes(),
        check=True,
    )
    print(f"wrote {dest} from {src.name} frames {idxs} / {len(rgb_frames)}")


def resolve_src(preferred: str, fallback: str) -> Path:
    for path in (OUT / preferred, RAW / fallback, RAW / preferred):
        if path.exists():
            return path
    return OUT / preferred


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    jobs = (
        ("walk1.mp4", "walker-up.mp4", "walker-up.png"),
        ("walk2.mp4", "walker-down.mp4", "walker-down.png"),
    )
    missing = []
    resolved = []
    for preferred, fallback, dest_name in jobs:
        src = resolve_src(preferred, fallback)
        if not src.exists():
            missing.append(preferred)
        else:
            resolved.append((src, dest_name))
    if missing:
        raise SystemExit(
            "missing " + ", ".join(missing) + f" in {OUT} or {RAW}\n"
            "Drop Grok walk videos there, then rerun."
        )
    for src, dest_name in resolved:
        pack_video(src, OUT / dest_name)


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError:
        sys.exit("ffmpeg is required")
