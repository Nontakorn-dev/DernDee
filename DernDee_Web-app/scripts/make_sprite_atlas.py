#!/usr/bin/env python3
"""Build Trail Quest sprite atlases from chroma-keyed video clips.

Keeps only frames that actually change, then packs 12–24 poses per clip
instead of the full 145-frame source videos.

Usage:
  python3 scripts/make_sprite_atlas.py
  python3 scripts/make_sprite_atlas.py boy.walk bird
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from pathlib import Path

DECODE_PX = 480
FRAME_PX = 320
SIG_PX = 48
FEET_Y = 0.82
TORSO_X = 0.50
WALK_FPS = 16
TIRED_FPS = 14
PROP_FPS = 16
SOURCE_FPS = 24.0
DIFF_THRESHOLD = 6.5
CACHE_VER = 5


def _ensure_deps():
    try:
        import numpy  # noqa: F401
        return
    except ImportError:
        pass
    for py in (
        Path("/tmp/derndee-ios-pack-venv/bin/python"),
        Path("/tmp/derndee-atlas-venv/bin/python"),
    ):
        if py.exists():
            os.execv(str(py), [str(py), *sys.argv])
    raise SystemExit("numpy is required. Activate a venv that has it, then rerun.")


_ensure_deps()

import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "public" / "game"
OUT = ROOT / "sprites"

# Windows match characters.ts seek/rate and world.ts action durations.
CLIPS = [
    {
        "key": "boy.idle",
        "src": "characters/boy/walk.mp4",
        "t0": 0.0,
        "t1": 0.34,
        "min": 1,
        "max": 4,
        "loop": False,
        "fps": 8,
        "layout": "feet",
    },
    {
        "key": "boy.walk",
        "src": "characters/boy/walk.mp4",
        "t0": 0.34,
        "t1": 0.34 + 2.2,
        "min": 12,
        "max": 26,
        "loop": True,
        "fps": WALK_FPS,
        "layout": "feet",
        "sample": "cycle",
        "plant": False,
    },
    {
        "key": "boy.jump",
        "src": "characters/boy/jump.mp4",
        "t0": 1.65,
        "t1": 1.65 + 1.15 * 2.05,
        "min": 12,
        "max": 20,
        "loop": False,
        "fps": 16,
        "layout": "feet",
    },
    {
        "key": "boy.duck",
        "src": "characters/boy/duck.mp4",
        "t0": 0.05,
        "t1": 0.85 + 1.85 * 2.45,
        "min": 12,
        "max": 16,
        "loop": False,
        "fps": 12,
        "layout": "feet",
        "sample": "action",
        "plant": True,
    },
    {
        "key": "boy.tired",
        "src": "characters/boy/tired.mp4",
        "t0": 1.1,
        "t1": 2.3,
        "min": 14,
        "max": 16,
        "loop": True,
        "fps": TIRED_FPS,
        "layout": "feet",
        "sample": "even",
    },
    {
        "key": "girl.idle",
        "src": "characters/girl/walk.mp4",
        "t0": 0.0,
        "t1": 0.34,
        "min": 1,
        "max": 4,
        "loop": False,
        "fps": 8,
        "layout": "feet",
    },
    {
        "key": "girl.walk",
        "src": "characters/girl/walk.mp4",
        "t0": 0.34,
        "t1": 0.34 + 2.2,
        "min": 12,
        "max": 26,
        "loop": True,
        "fps": WALK_FPS,
        "layout": "feet",
        "sample": "cycle",
        "plant": False,
    },
    {
        "key": "girl.jump",
        "src": "characters/girl/jump.mp4",
        "t0": 1.5,
        "t1": 1.5 + 1.15 * 2.1,
        "min": 12,
        "max": 20,
        "loop": False,
        "fps": 16,
        "layout": "feet",
    },
    {
        "key": "girl.duck",
        "src": "characters/girl/duck.mp4",
        "t0": 0.05,
        "t1": 0.7 + 1.85 * 2.5,
        "min": 12,
        "max": 16,
        "loop": False,
        "fps": 12,
        "layout": "feet",
        "sample": "action",
        "plant": True,
    },
    {
        "key": "girl.tired",
        "src": "characters/girl/tired.mp4",
        "t0": 1.1,
        "t1": 2.3,
        "min": 14,
        "max": 16,
        "loop": True,
        "fps": TIRED_FPS,
        "layout": "feet",
        "sample": "even",
    },
    {
        "key": "dino.idle",
        "src": "walk.mp4",
        "t0": 0.0,
        "t1": 0.52,
        "min": 1,
        "max": 4,
        "loop": False,
        "fps": 8,
        "layout": "feet",
    },
    {
        "key": "dino.walk",
        "src": "walk.mp4",
        "t0": 0.52,
        "t1": 0.52 + 2.2,
        "min": 12,
        "max": 26,
        "loop": True,
        "fps": WALK_FPS,
        "layout": "feet",
        "sample": "cycle",
        "plant": False,
    },
    {
        "key": "dino.jump",
        "src": "jump.mp4",
        "t0": 2.2,
        "t1": 2.2 + 1.15 * 1.35,
        "min": 12,
        "max": 20,
        "loop": False,
        "fps": 16,
        "layout": "feet",
    },
    {
        "key": "dino.duck",
        "src": "duck.mp4",
        "t0": 0.05,
        "t1": 0.5 + 1.85 * 2.55,
        "min": 12,
        "max": 16,
        "loop": False,
        "fps": 12,
        "layout": "feet",
        "sample": "action",
        "plant": True,
    },
    {
        "key": "dino.tired",
        "src": "tired.mp4",
        "t0": 0.0,
        "t1": 1.2,
        "min": 14,
        "max": 16,
        "loop": True,
        "fps": TIRED_FPS,
        "layout": "feet",
        "sample": "even",
    },
    {
        "key": "bird",
        "src": "bird.mp4",
        "t0": 0.0,
        "t1": 1.25,
        "min": 12,
        "max": 16,
        "loop": True,
        "fps": PROP_FPS,
        "layout": "keep",
        "sample": "even",
    },
    {
        "key": "flag",
        "src": "flag.mp4",
        "t0": 0.0,
        "t1": 1.25,
        "min": 12,
        "max": 16,
        "loop": True,
        "fps": PROP_FPS,
        "layout": "keep",
        "sample": "even",
    },
]


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


def resize_rgba(src: np.ndarray, nw: int, nh: int) -> np.ndarray:
    h, w = src.shape[:2]
    if h == nh and w == nw:
        return src
    ys = np.linspace(0, h - 1, nh)
    xs = np.linspace(0, w - 1, nw)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    wy = (ys - y0)[:, None, None]
    wx = (xs - x0)[None, :, None]
    src_f = src.astype(np.float32)
    top = src_f[y0][:, x0] * (1 - wx) + src_f[y0][:, x1] * wx
    bot = src_f[y1][:, x0] * (1 - wx) + src_f[y1][:, x1] * wx
    return np.clip(top * (1 - wy) + bot * wy, 0, 255).astype(np.uint8)


def paste_scaled(rgba: np.ndarray, scale: float, ox: float, oy: float) -> np.ndarray:
    nh = max(1, int(round(rgba.shape[0] * scale)))
    nw = max(1, int(round(rgba.shape[1] * scale)))
    scaled = resize_rgba(rgba, nw, nh)
    out = np.zeros((FRAME_PX, FRAME_PX, 4), dtype=np.uint8)
    x = int(round(ox))
    y = int(round(oy))
    src_x0 = max(0, -x)
    src_y0 = max(0, -y)
    dst_x0 = max(0, x)
    dst_y0 = max(0, y)
    w = min(nw - src_x0, FRAME_PX - dst_x0)
    h = min(nh - src_y0, FRAME_PX - dst_y0)
    if w > 0 and h > 0:
        out[dst_y0 : dst_y0 + h, dst_x0 : dst_x0 + w] = scaled[src_y0 : src_y0 + h, src_x0 : src_x0 + w]
    return out


def torso_cx(alpha: np.ndarray, box: tuple[int, int, int, int]) -> float:
    x0, y0, x1, y1 = box
    y_cut = y0 + max(1, int((y1 - y0) * 0.52))
    ys, xs = np.nonzero(alpha[y0:y_cut, x0:x1] > 18)
    if xs.size == 0:
        return (x0 + x1) / 2.0
    return x0 + float(xs.mean())


def standing_height(rgba_frames: list[np.ndarray]) -> float:
    heights = []
    for rgba in rgba_frames:
        box = content_bbox(rgba[:, :, 3])
        if box is None:
            continue
        heights.append(box[3] - box[1])
    if not heights:
        return float(DECODE_PX)
    return float(np.percentile(np.array(heights), 88))


class CharXform:
    __slots__ = ("scale", "ref_feet", "target_cx", "stand_h")

    def __init__(self, scale: float, ref_feet: float, target_cx: float, stand_h: float):
        self.scale = scale
        self.ref_feet = ref_feet
        self.target_cx = target_cx
        self.stand_h = stand_h


def measure_char_transform(rgba_frames: list[np.ndarray]) -> CharXform:
    feet = []
    heights = []
    for rgba in rgba_frames:
        box = content_bbox(rgba[:, :, 3])
        if box is None:
            continue
        _x0, y0, _x1, y1 = box
        feet.append(y1)
        heights.append(y1 - y0)
    if not heights:
        scale = FRAME_PX / DECODE_PX
        return CharXform(scale, DECODE_PX * 0.85 * scale, FRAME_PX * TORSO_X, float(DECODE_PX))
    height = float(np.median(np.array(heights)))
    scale = min((FRAME_PX * 0.76) / max(height, 1.0), FRAME_PX / DECODE_PX)
    scaled_feet = []
    scaled_cx = []
    for rgba in rgba_frames:
        nh = max(1, int(round(rgba.shape[0] * scale)))
        nw = max(1, int(round(rgba.shape[1] * scale)))
        scaled = resize_rgba(rgba, nw, nh)
        box = content_bbox(scaled[:, :, 3])
        if box is None:
            continue
        scaled_feet.append(box[3])
        scaled_cx.append(torso_cx(scaled[:, :, 3], box))
    ref_feet = float(np.percentile(np.array(scaled_feet), 78)) if scaled_feet else FRAME_PX * FEET_Y
    target_cx = FRAME_PX * TORSO_X
    return CharXform(scale, ref_feet, target_cx, float(np.median(np.array(heights))))


def layout_frame(rgba: np.ndarray, xform: CharXform, plant: bool, scale: float | None = None) -> np.ndarray:
    use_scale = xform.scale if scale is None else scale
    scale_ratio = use_scale / xform.scale if xform.scale else 1.0
    ref_feet = xform.ref_feet * scale_ratio
    nh = max(1, int(round(rgba.shape[0] * use_scale)))
    nw = max(1, int(round(rgba.shape[1] * use_scale)))
    scaled = resize_rgba(rgba, nw, nh)
    box = content_bbox(scaled[:, :, 3])
    if box is None:
        ox = (FRAME_PX - nw) / 2
        oy = (FRAME_PX - nh) / 2
    else:
        cx = torso_cx(scaled[:, :, 3], box)
        ox = xform.target_cx - cx
        oy = FRAME_PX * FEET_Y - (box[3] if plant else ref_feet)
    return paste_scaled(rgba, use_scale, ox, oy)


def even_span(start: int, end: int, count: int, endpoint: bool) -> list[int]:
    if count <= 0:
        return []
    if end <= start:
        return [start]
    xs = np.linspace(start, end, count, endpoint=endpoint)
    out = [int(round(x)) for x in xs]
    return list(dict.fromkeys(out))


def detect_period(sigs: list[np.ndarray], min_lag: int = 8, max_lag: int = 26) -> int:
    n = len(sigs)
    if n < min_lag * 2:
        return max(1, n)
    max_lag = min(max_lag, n // 2, n - 2)
    if max_lag < min_lag:
        return max(1, n)
    s0 = sigs[0]
    scores = [(frame_diff(s0, sigs[lag]), lag) for lag in range(min_lag, max_lag + 1)]
    best = min(sc for sc, _lag in scores)
    near = [lag for sc, lag in scores if sc <= best * 1.12]
    step = min(near)
    double = step * 2
    if double <= max_lag:
        return double
    return step


def sample_action(heights: list[float], min_n: int, max_n: int) -> list[int]:
    n = len(heights)
    if n <= max_n:
        return list(range(n))
    h = np.array(heights, dtype=np.float32)
    imin = int(np.argmin(h))
    n_down = max(4, max_n // 3)
    n_hold = 2
    n_up = max(min_n - n_down - n_hold, max_n - n_down - n_hold)
    down = even_span(0, imin, n_down, True)
    hold_end = min(n - 1, imin + max(1, (n - imin) // 8))
    hold = even_span(imin, hold_end, n_hold, True)
    up = even_span(imin, n - 1, max(4, n_up), True)
    idxs = list(dict.fromkeys(down + hold + up))
    if len(idxs) > max_n:
        xs = np.linspace(0, len(idxs) - 1, max_n)
        idxs = [idxs[int(round(x))] for x in xs]
        idxs = list(dict.fromkeys(idxs))
    if len(idxs) < min_n:
        extra = even_span(0, n - 1, min_n, True)
        idxs = list(dict.fromkeys(idxs + extra))[:max_n]
    return idxs


def signature(rgba: np.ndarray) -> np.ndarray:
    small = resize_rgba(rgba, SIG_PX, SIG_PX)
    vis = small[:, :, :3].astype(np.float32)
    a = small[:, :, 3:4].astype(np.float32) / 255.0
    return vis * a


def frame_diff(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a - b)))


def pick_indices(sigs: list[np.ndarray], min_n: int, max_n: int, sample: str, loop: bool) -> list[int]:
    n = len(sigs)
    if n <= 1:
        return [0] if n else []
    if sample != "unique":
        count = min(max_n, n)
        if n >= min_n:
            count = max(min_n, count)
        count = min(count, n)
        return even_span(0, n if loop else n - 1, count, endpoint=not loop)
    kept = [0]
    for i in range(1, n):
        if frame_diff(sigs[i], sigs[kept[-1]]) >= DIFF_THRESHOLD:
            kept.append(i)
    if len(kept) > max_n:
        xs = np.linspace(0, len(kept) - 1, max_n)
        kept = [kept[int(round(x))] for x in xs]
        kept = list(dict.fromkeys(kept))
    if len(kept) < min_n and n >= min_n:
        kept = even_span(0, n - 1, min_n, True)
    return kept


def decode_rgb_frames(src: Path) -> list[np.ndarray]:
    proc = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(src),
            "-vf",
            f"scale={DECODE_PX}:{DECODE_PX}:flags=lanczos,format=rgb24",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
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
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"decode {src}: {err[-800:].decode(errors='replace')}")
    return frames


def pack_atlas(frames: list[np.ndarray]) -> tuple[np.ndarray, int, int]:
    n = len(frames)
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = max(1, math.ceil(n / cols))
    sheet = np.zeros((rows * FRAME_PX, cols * FRAME_PX, 4), dtype=np.uint8)
    for i, frame in enumerate(frames):
        col, row = i % cols, i // cols
        y, x = row * FRAME_PX, col * FRAME_PX
        sheet[y : y + FRAME_PX, x : x + FRAME_PX] = frame
    return sheet, cols, rows


def save_png(path: Path, rgba: np.ndarray) -> None:
    h, w = rgba.shape[:2]
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            f"{w}x{h}",
            "-i",
            "pipe:0",
            "-frames:v",
            "1",
            str(path),
        ],
        input=rgba.tobytes(),
        check=True,
    )


def window_frames(rgb_frames: list[np.ndarray], job: dict):
    t0 = job["t0"]
    t1 = job["t1"] if job["t1"] is not None else (len(rgb_frames) / SOURCE_FPS)
    i0 = max(0, min(len(rgb_frames) - 1, int(round(t0 * SOURCE_FPS))))
    i1 = max(i0 + 1, min(len(rgb_frames), int(round(t1 * SOURCE_FPS))))
    return rgb_frames[i0:i1], i0, i1


def pose_name(key: str) -> str:
    return key.split(".", 1)[1] if "." in key else key


def process_clip(job: dict, rgb_frames: list[np.ndarray], xform: CharXform) -> dict:
    print(f"atlas {job['key']}  <- {job['src']}", flush=True)
    window, i0, i1 = window_frames(rgb_frames, job)
    pose = pose_name(job["key"])
    plant = job.get("plant")
    if plant is None:
        plant = pose in ("idle", "duck", "tired")
    sample = job.get("sample", "even")
    rgba_window = [chroma_rgba(rgb) for rgb in window]
    if job["layout"] == "keep":
        use_scale = FRAME_PX / DECODE_PX
        ox = (FRAME_PX - DECODE_PX * use_scale) / 2
        laid = [paste_scaled(rgba, use_scale, ox, ox) for rgba in rgba_window]
    else:
        use_scale = xform.scale
        if pose == "duck":
            probe = rgba_window[:3] + rgba_window[-5:]
            stand = standing_height(probe)
            if stand > xform.stand_h * 1.03:
                use_scale = xform.scale * (xform.stand_h / stand)
        laid = [layout_frame(rgba, xform, plant, use_scale) for rgba in rgba_window]
    sigs = [signature(frame) for frame in laid]
    fps = float(job["fps"])
    if sample == "cycle":
        period = detect_period(sigs)
        period = max(1, min(period, len(laid)))
        laid = laid[:period]
        sigs = sigs[:period]
        idxs = list(range(period))
        if period > job["max"]:
            idxs = even_span(0, period, job["max"], endpoint=False)
        fps = round(SOURCE_FPS * len(idxs) / max(period, 1), 2)
        print(f"  cycle period={period} kept={len(idxs)} fps={fps}", flush=True)
    elif sample == "action":
        heights = []
        for rgba in rgba_window:
            box = content_bbox(rgba[:, :, 3])
            heights.append(float(box[3] - box[1]) if box else 0.0)
        idxs = sample_action(heights, job["min"], job["max"])
    else:
        idxs = pick_indices(sigs, job["min"], job["max"], sample, job["loop"])
    nlaid = len(laid)
    idxs = [min(nlaid - 1, max(0, i)) for i in idxs]
    chosen = [laid[i] for i in idxs]
    sheet, cols, rows = pack_atlas(chosen)
    if "." in job["key"]:
        character, pose_key = job["key"].split(".", 1)
        dest = OUT / character / f"{pose_key}.png"
        src_url = f"/game/sprites/{character}/{pose_key}.png?v={CACHE_VER}"
    else:
        dest = OUT / f"{job['key']}.png"
        src_url = f"/game/sprites/{job['key']}.png?v={CACHE_VER}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    save_png(dest, sheet)
    kb = dest.stat().st_size // 1024
    print(
        f"  {len(window)} src -> {len(chosen)} frames  {cols}x{rows}  {kb}k  "
        f"window={i0}-{i1}  scale={use_scale:.3f} plant={plant}",
        flush=True,
    )
    return {
        "src": src_url,
        "frames": len(chosen),
        "cols": cols,
        "rows": rows,
        "frame": FRAME_PX,
        "fps": fps,
        "loop": job["loop"],
        "feetY": FEET_Y if job["layout"] == "feet" else 0.87,
        "sourceFrames": len(window),
        "picked": idxs,
        "scale": round(use_scale, 4),
    }


def main() -> None:
    wanted = set(sys.argv[1:])
    jobs = [j for j in CLIPS if not wanted or j["key"] in wanted]
    OUT.mkdir(parents=True, exist_ok=True)
    meta_path = OUT / "meta.json"
    meta = {"frameSize": FRAME_PX, "version": CACHE_VER, "clips": {}}
    if meta_path.exists() and wanted:
        try:
            meta = json.loads(meta_path.read_text())
        except json.JSONDecodeError:
            pass
        meta["version"] = CACHE_VER

    chars = []
    for job in jobs:
        if "." in job["key"] and job["layout"] == "feet":
            char = job["key"].split(".", 1)[0]
            if char not in chars:
                chars.append(char)

    xforms: dict[str, CharXform] = {}
    decoded: dict[str, list[np.ndarray]] = {}

    def get_decoded(src: str) -> list[np.ndarray]:
        if src not in decoded:
            print(f"decode {src}", flush=True)
            decoded[src] = decode_rgb_frames(ROOT / src)
        return decoded[src]

    def drop_decoded(*keep: str) -> None:
        for src in list(decoded):
            if src not in keep:
                del decoded[src]

    for char in chars:
        walk = next((c for c in CLIPS if c["key"] == f"{char}.walk"), None)
        if not walk:
            continue
        rgb = get_decoded(walk["src"])
        window, _, _ = window_frames(rgb, walk)
        rgba_frames = [chroma_rgba(frame) for frame in window]
        xforms[char] = measure_char_transform(rgba_frames)
        xf = xforms[char]
        print(
            f"transform {char}: scale={xf.scale:.3f} feet={xf.ref_feet:.1f} stand={xf.stand_h:.0f}",
            flush=True,
        )

    for job in jobs:
        rgb = get_decoded(job["src"])
        if job["layout"] == "keep":
            window, _, _ = window_frames(rgb, job)
            rgba = [chroma_rgba(frame) for frame in window[:8]]
            xform = measure_char_transform(rgba)
            xform.target_cx = FRAME_PX / 2
            xform.ref_feet = FRAME_PX * 0.87
        else:
            char = job["key"].split(".", 1)[0]
            xform = xforms.get(char)
            if xform is None:
                window, _, _ = window_frames(rgb, job)
                xform = measure_char_transform([chroma_rgba(frame) for frame in window])
        meta["clips"][job["key"]] = process_clip(job, rgb, xform)
        still_needed = {j["src"] for j in jobs[jobs.index(job) + 1 :]}
        drop_decoded(*still_needed)

    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {meta_path}", flush=True)


if __name__ == "__main__":
    main()
