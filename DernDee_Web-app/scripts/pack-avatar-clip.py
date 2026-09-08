#!/usr/bin/env python3
"""Key white studio BG the same way as the existing coach clips.

Emits:
  - .webm  VP9 yuva420p (Chrome/desktop alpha)
  - .ios.mp4  packed RGB | grayscale alpha (Safari/iOS canvas)
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

W, H = 1280, 704
FPS = 24
RGB_N = W * H * 3
TH = 16
CLOSE = 9
ERODE = 1
BLUR = 2.2


def _load_cv2():
    try:
        import cv2  # noqa: WPS433
        import numpy as np  # noqa: WPS433
        return cv2, np
    except ImportError:
        venv = Path("/tmp/derndee-avatar-pack-venv")
        py = venv / "bin" / "python"
        if not py.exists():
            subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
        subprocess.check_call(
            [str(py), "-m", "pip", "install", "numpy", "opencv-python-headless"],
        )
        os.execv(str(py), [str(py), *sys.argv])


cv2, np = _load_cv2()


def make_alpha(rgb: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]],
        axis=0,
    )
    bg = np.median(border, axis=0).astype(np.float32)
    dist = np.abs(rgb.astype(np.float32) - bg).sum(axis=2)
    near = (dist <= TH).astype(np.uint8)
    _n, labels = cv2.connectedComponents(near, connectivity=8)
    border_labels = np.unique(
        np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]),
    )
    bg_mask = np.isin(labels, border_labels[border_labels != 0])
    fg = np.where(bg_mask, 0, 255).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE, CLOSE))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
    inv = cv2.bitwise_not(fg)
    _n2, lab2 = cv2.connectedComponents(inv, connectivity=8)
    hole_border = np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
    holes = (inv > 0) & (~np.isin(lab2, hole_border))
    fg[holes] = 255
    if ERODE > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ERODE * 2 + 1, ERODE * 2 + 1))
        fg = cv2.erode(fg, k)
    return cv2.GaussianBlur(fg, (0, 0), BLUR)


def iter_rgb_frames(src: Path):
    decode = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(src),
            "-an",
            "-vf",
            f"scale={W}:{H}:flags=lanczos,format=rgb24",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert decode.stdout
    n = 0
    while True:
        buf = decode.stdout.read(RGB_N)
        if not buf or len(buf) < RGB_N:
            break
        n += 1
        yield np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
    decode.stdout.close()
    err = decode.stderr.read() if decode.stderr else b""
    code = decode.wait()
    if code != 0:
        raise RuntimeError(f"decode failed: {err[-800:].decode(errors='replace')}")
    print(f"decoded {n} frames", flush=True)


def encode_webm(src: Path, dest: Path) -> None:
    encode = subprocess.Popen(
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
            f"{W}x{H}",
            "-r",
            str(FPS),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
            "-b:v",
            "0",
            "-crf",
            "30",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            str(dest),
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert encode.stdin
    for rgb in iter_rgb_frames(src):
        encode.stdin.write(np.dstack([rgb, make_alpha(rgb)]).tobytes())
    encode.stdin.close()
    err = encode.stderr.read() if encode.stderr else b""
    code = encode.wait()
    if code != 0:
        raise RuntimeError(f"webm encode failed: {err[-1200:].decode(errors='replace')}")
    print(f"webm {dest.name} {dest.stat().st_size // 1024}k", flush=True)


def encode_ios(src: Path, dest: Path) -> None:
    encode = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{W * 2}x{H}",
            "-r",
            str(FPS),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-g",
            "8",
            "-keyint_min",
            "8",
            "-x264-params",
            "scenecut=0",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(dest),
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert encode.stdin
    for rgb in iter_rgb_frames(src):
        alpha = make_alpha(rgb)
        packed = np.concatenate([rgb, np.dstack([alpha, alpha, alpha])], axis=1)
        encode.stdin.write(packed.tobytes())
    encode.stdin.close()
    err = encode.stderr.read() if encode.stderr else b""
    code = encode.wait()
    if code != 0:
        raise RuntimeError(f"ios encode failed: {err[-1200:].decode(errors='replace')}")
    print(f"ios {dest.name} {dest.stat().st_size // 1024}k", flush=True)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: pack-avatar-clip.py clip.mp4")
    src = Path(sys.argv[1]).resolve()
    encode_webm(src, src.with_suffix(".webm"))
    encode_ios(src, src.with_name(f"{src.stem}.ios.mp4"))


if __name__ == "__main__":
    main()
