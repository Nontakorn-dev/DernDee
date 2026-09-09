"""Mux avatar audio without truncating the video; validate before publishing."""
import json
from pathlib import Path
import subprocess
import tempfile


def video_packets(path: Path) -> int:
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_read_packets', '-of', 'json', str(path),
    ], check=True, capture_output=True, text=True)
    streams = json.loads(result.stdout).get('streams', [])
    return int(streams[0].get('nb_read_packets', 0)) if streams else 0


def source_has_audio(path: Path) -> bool:
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', str(path),
    ], check=True, capture_output=True, text=True)
    return 'audio' in result.stdout


def mux_audio(src: Path, silent: Path, dest: Path, audio_codec: str) -> None:
    if silent.resolve() == dest.resolve():
        raise ValueError('mux destination must differ from silent video')
    expected = video_packets(silent)
    if not expected:
        raise RuntimeError(f'No video packets in {silent}')
    if not source_has_audio(src):
        silent.replace(dest)
        return
    # Keep the complete encoded video regardless of audio length. -shortest can
    # drop buffered VP9 frames; a plausible container duration hides the damage.
    with tempfile.TemporaryDirectory(prefix='avatar-mux-', dir=dest.parent) as folder:
        candidate = Path(folder) / dest.name
        subprocess.run([
            'ffmpeg', '-y', '-v', 'error', '-i', str(silent), '-i', str(src),
            '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
            '-c:a', audio_codec, str(candidate),
        ], check=True)
        actual = video_packets(candidate)
        if actual != expected:
            raise RuntimeError(f'Mux truncated video: {actual}/{expected} packets; original preserved')
        candidate.replace(dest)
    silent.unlink()
