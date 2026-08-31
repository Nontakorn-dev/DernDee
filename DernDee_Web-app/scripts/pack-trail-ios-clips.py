#!/usr/bin/env python3
"""Pack Trail Quest clips for iPad: left RGB, right grayscale alpha.

Mask matches chroma.ts:
  r > 158 && g < 50 && (r - g) > 115 && (b - g) > 28

The old ffmpeg colorkey chain (three keys at similarity 0.32) also
removed peach skin and bird bodies.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

SIZE = 720

def _load_numpy():
    try:
        import numpy as np  # noqa: WPS433
        return np
    except ImportError:
        venv = Path("/tmp/derndee-ios-pack-venv")
        py = venv / "bin" / "python"
        if not py.exists():
            subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
            subprocess.check_call([str(py), "-m", "pip", "install", "numpy"])
        os.execv(str(py), [str(py), *sys.argv])


np = _load_numpy()


def ffprobe_fps(src: Path) -> str:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
            "-of",
            "csv=p=0",
            str(src),
        ],
        text=True,
    ).strip()
    return out or "24/1"


def pack_one(src: Path) -> None:
    dest = src.parent / (src.stem + ".ios.mp4")
    print(f"pack {dest}", flush=True)
    fps = ffprobe_fps(src)
    decode = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(src),
            "-map",
            "0:v:0",
            "-vf",
            f"scale={SIZE}:{SIZE}:flags=lanczos,format=rgb24",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
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
            f"{SIZE * 2}x{SIZE}",
            "-r",
            fps,
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
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
    assert decode.stdout and encode.stdin
    frame_n = SIZE * SIZE * 3
    while True:
        buf = decode.stdout.read(frame_n)
        if not buf:
            break
        if len(buf) < frame_n:
            break
        frame = np.frombuffer(buf, dtype=np.uint8).reshape(SIZE, SIZE, 3)
        r = frame[:, :, 0].astype(np.int16)
        g = frame[:, :, 1].astype(np.int16)
        b = frame[:, :, 2].astype(np.int16)
        screen = (r > 158) & (g < 50) & ((r - g) > 115) & ((b - g) > 28)
        color = frame.copy()
        color[screen] = 0
        alpha = np.where(screen, 0, 255).astype(np.uint8)
        right = np.stack([alpha, alpha, alpha], axis=2)
        packed = np.concatenate([color, right], axis=1)
        encode.stdin.write(packed.tobytes())
    encode.stdin.close()
    decode.stdout.close()
    dec_err = decode.stderr.read() if decode.stderr else b""
    enc_err = encode.stderr.read() if encode.stderr else b""
    dec_code = decode.wait()
    enc_code = encode.wait()
    if dec_code != 0:
        raise RuntimeError(f"decode {src}: {dec_err[-800:].decode(errors='replace')}")
    if enc_code != 0:
        raise RuntimeError(f"encode {dest}: {enc_err[-800:].decode(errors='replace')}")
    print(f"  ok {dest.stat().st_size // 1024}k", flush=True)


def main() -> None:
    root = Path(__file__).resolve().parent.parent / "public" / "game"
    if len(sys.argv) > 1:
        srcs = [Path(p) for p in sys.argv[1:]]
    else:
        srcs = sorted(
            p for p in root.rglob("*.mp4") if not p.name.endswith(".ios.mp4")
        )
    for src in srcs:
        pack_one(src)


if __name__ == "__main__":
    main()
