"""
Live sample export helpers for replaying IMU streams offline.

Exports replay-friendly per-sensor files:
- CSV with flat timestamp/accel/gyro columns
- JSONL with richer metadata and the same accel/gyro arrays the prototype expects
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional


@dataclass
class SensorExportWriters:
    csv_path: Path
    jsonl_path: Path
    csv_handle: object
    jsonl_handle: object


class LiveSampleExporter:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.is_recording = False
        self.session_dir: Optional[Path] = None
        self.started_at_utc: Optional[str] = None
        self.stopped_at_utc: Optional[str] = None
        self._sensor_writers: Dict[str, SensorExportWriters] = {}
        self.sample_counts: Dict[str, int] = {}

    @staticmethod
    def _utc_now() -> str:
        return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    @staticmethod
    def _safe_name(sensor_name: str) -> str:
        safe = []
        for ch in sensor_name:
            if ch.isalnum() or ch in {"_", "-"}:
                safe.append(ch)
            else:
                safe.append("_")
        return "".join(safe)

    def start(self) -> Dict[str, object]:
        if self.is_recording:
            return self.get_status()

        session_stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        self.session_dir = self.base_dir / f"session_{session_stamp}"
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.started_at_utc = self._utc_now()
        self.stopped_at_utc = None
        self._sensor_writers = {}
        self.sample_counts = {}
        self.is_recording = True

        return self.get_status()

    def stop(self) -> Dict[str, object]:
        if not self.is_recording:
            return self.get_status()

        self.stopped_at_utc = self._utc_now()
        self._write_session_metadata()

        for writers in self._sensor_writers.values():
            writers.csv_handle.close()
            writers.jsonl_handle.close()

        self._sensor_writers = {}
        self.is_recording = False
        return self.get_status()

    def _write_session_metadata(self) -> None:
        if self.session_dir is None:
            return

        metadata = {
            "started_at_utc": self.started_at_utc,
            "stopped_at_utc": self.stopped_at_utc,
            "sample_counts": self.sample_counts,
            "files": {
                sensor_name: {
                    "csv": str((self.session_dir / f"{self._safe_name(sensor_name)}.csv").resolve()),
                    "jsonl": str((self.session_dir / f"{self._safe_name(sensor_name)}.jsonl").resolve()),
                }
                for sensor_name in self.sample_counts
            },
        }

        meta_path = self.session_dir / "session_meta.json"
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    def _ensure_sensor_writers(self, sensor_name: str) -> SensorExportWriters:
        if self.session_dir is None:
            raise RuntimeError("Recording session has not been started")

        if sensor_name in self._sensor_writers:
            return self._sensor_writers[sensor_name]

        safe_name = self._safe_name(sensor_name)
        csv_path = self.session_dir / f"{safe_name}.csv"
        jsonl_path = self.session_dir / f"{safe_name}.jsonl"
        csv_handle = csv_path.open("w", encoding="utf-8", newline="")
        jsonl_handle = jsonl_path.open("w", encoding="utf-8")

        csv_handle.write(
            "timestamp_ms,side,sensor_mount,ax,ay,az,gx,gy,gz,"
            "raw_ax,raw_ay,raw_az,raw_gx,raw_gy,raw_gz,dt_sec\n"
        )

        writers = SensorExportWriters(
            csv_path=csv_path,
            jsonl_path=jsonl_path,
            csv_handle=csv_handle,
            jsonl_handle=jsonl_handle,
        )
        self._sensor_writers[sensor_name] = writers
        self.sample_counts[sensor_name] = 0
        return writers

    def record_sample(
        self,
        sensor_name: str,
        side: str,
        sensor_mount: str,
        timestamp_ms: float,
        accel,
        gyro,
        raw_accel,
        raw_gyro,
        dt_sec: float,
    ) -> None:
        if not self.is_recording:
            return

        writers = self._ensure_sensor_writers(sensor_name)
        accel_list = [float(v) for v in accel]
        gyro_list = [float(v) for v in gyro]
        raw_accel_list = [float(v) for v in raw_accel]
        raw_gyro_list = [float(v) for v in raw_gyro]

        csv_line = (
            f"{float(timestamp_ms):.0f},{side},{sensor_mount},"
            f"{accel_list[0]:.8f},{accel_list[1]:.8f},{accel_list[2]:.8f},"
            f"{gyro_list[0]:.8f},{gyro_list[1]:.8f},{gyro_list[2]:.8f},"
            f"{raw_accel_list[0]:.8f},{raw_accel_list[1]:.8f},{raw_accel_list[2]:.8f},"
            f"{raw_gyro_list[0]:.8f},{raw_gyro_list[1]:.8f},{raw_gyro_list[2]:.8f},"
            f"{float(dt_sec):.6f}\n"
        )
        writers.csv_handle.write(csv_line)

        json_obj = {
            "timestamp_ms": float(timestamp_ms),
            "name": sensor_name,
            "side": side,
            "sensor_mount": sensor_mount,
            "accel": accel_list,
            "gyro": gyro_list,
            "raw_accel": raw_accel_list,
            "raw_gyro": raw_gyro_list,
            "dt_sec": float(dt_sec),
        }
        writers.jsonl_handle.write(json.dumps(json_obj) + "\n")

        self.sample_counts[sensor_name] = self.sample_counts.get(sensor_name, 0) + 1

        if self.sample_counts[sensor_name] % 100 == 0:
            writers.csv_handle.flush()
            writers.jsonl_handle.flush()

    def get_status(self) -> Dict[str, object]:
        files = {}
        if self._sensor_writers:
            for sensor_name, writers in self._sensor_writers.items():
                files[sensor_name] = {
                    "csv": str(writers.csv_path.resolve()),
                    "jsonl": str(writers.jsonl_path.resolve()),
                }
        elif self.session_dir is not None:
            for sensor_name in self.sample_counts:
                safe_name = self._safe_name(sensor_name)
                files[sensor_name] = {
                    "csv": str((self.session_dir / f"{safe_name}.csv").resolve()),
                    "jsonl": str((self.session_dir / f"{safe_name}.jsonl").resolve()),
                }

        return {
            "is_recording": self.is_recording,
            "session_dir": str(self.session_dir.resolve()) if self.session_dir else None,
            "started_at_utc": self.started_at_utc,
            "stopped_at_utc": self.stopped_at_utc,
            "sample_counts": dict(self.sample_counts),
            "files": files,
        }
