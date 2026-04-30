from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
import httpx
from supabase import Client, create_client


def _to_iso8601(timestamp_ms: int | float | None) -> str:
    if timestamp_ms is None:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc).isoformat()


def _is_jwt_api_key(api_key: str | None) -> bool:
    if not api_key:
        return False
    return bool(re.match(r"^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$", api_key))


def _is_missing_column_error(error: Exception, column_name: str) -> bool:
    message = str(error).lower()
    normalized_column = column_name.lower()
    return normalized_column in message and ('column' in message or 'schema cache' in message or 'pgrst' in message)


class SupabaseSessionRepository:
    def __init__(self) -> None:
        load_dotenv(Path(__file__).with_name('.env'))
        self.url = os.getenv('SUPABASE_URL')
        self.service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        self.enabled = bool(self.url and self.service_role_key)
        self.client: Client | None = None
        self.rest_client: httpx.Client | None = None
        self.rest_url: str | None = f"{self.url}/rest/v1" if self.url else None

        if self.enabled:
            if _is_jwt_api_key(self.service_role_key):
                self.client = create_client(self.url, self.service_role_key)
            else:
                self.rest_client = httpx.Client(
                    base_url=self.rest_url,
                    headers={
                        'apikey': self.service_role_key,
                        'Authorization': f'Bearer {self.service_role_key}',
                        'Content-Type': 'application/json',
                    },
                    timeout=20.0,
                )
        else:
            print('⚠️ Supabase session repository is disabled. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in gateway_v2/.env')

    def _insert_rows(self, table_name: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return []

        if self.client:
            response = self.client.table(table_name).insert(rows if len(rows) > 1 else rows[0]).execute()
            return getattr(response, 'data', None) or []

        if not self.rest_client:
            return []

        response = self.rest_client.post(
            f'/{table_name}',
            headers={'Prefer': 'return=representation'},
            json=rows if len(rows) > 1 else rows[0],
        )
        response.raise_for_status()

        payload = response.json()
        return payload if isinstance(payload, list) else [payload]

    def save_session(self, session_row: dict[str, Any], gait_metrics_rows: list[dict[str, Any]]) -> str | None:
        if not self.client and not self.rest_client:
            return None

        insert_row = dict(session_row)

        try:
            session_data = self._insert_rows('sessions', [insert_row])
        except Exception as error:
            if 'details' not in insert_row or not _is_missing_column_error(error, 'details'):
                raise

            fallback_row = dict(insert_row)
            fallback_row.pop('details', None)
            session_data = self._insert_rows('sessions', [fallback_row])

        if not session_data:
            raise RuntimeError('Supabase did not return a created session row')

        session_id = session_data[0]['id']

        if gait_metrics_rows:
            for row in gait_metrics_rows:
                row['session_id'] = session_id

            self._insert_rows('gait_metrics', gait_metrics_rows)

        return session_id


@dataclass
class ActiveSession:
    patient_id: str
    session_type: str
    gateway_session_id: str = field(default_factory=lambda: str(uuid4()))
    metadata: dict[str, Any] = field(default_factory=dict)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    gait_metrics_rows: list[dict[str, Any]] = field(default_factory=list)


class SessionPersistenceManager:
    def __init__(self, repository: SupabaseSessionRepository) -> None:
        self.repository = repository
        self.active_session: ActiveSession | None = None

    @property
    def is_active(self) -> bool:
        return self.active_session is not None

    def reset(self) -> None:
        self.active_session = None

    def start_session(self, patient_id: str, session_type: str, metadata: dict[str, Any] | None = None) -> ActiveSession:
        metadata = metadata or {}
        self.active_session = ActiveSession(
            patient_id=patient_id,
            session_type=session_type,
            metadata=metadata,
        )
        return self.active_session

    def register_gait_metric(self, side: str, gait_metrics: dict[str, Any], timestamp_ms: int | float | None) -> None:
        if not self.active_session or not gait_metrics:
            return

        step_index = len(self.active_session.gait_metrics_rows) + 1
        side_label = 'left' if side == 'L' else 'right'

        row = {
            'recorded_at': _to_iso8601(timestamp_ms),
            'side': side_label,
            'step_index': step_index,
            'step_length_m': gait_metrics.get('stride_length_m', 0.0) / 2.0 if gait_metrics.get('stride_length_m') else None,
            'stride_length_m': gait_metrics.get('stride_length_m'),
            'step_time_s': gait_metrics.get('step_duration_s'),
            'swing_time_s': gait_metrics.get('swing_time_s'),
            'stance_time_s': gait_metrics.get('stance_time_s'),
            'stride_time_s': gait_metrics.get('stride_duration_s'),
            'max_clearance_m': gait_metrics.get('clearance_m'),
            'speed_mps': gait_metrics.get('speed_mps'),
            'symmetry_percent': gait_metrics.get('symmetry_percent'),
            'push_off_velocity_mps': gait_metrics.get('push_off_velocity_mps'),
            'touchdown_pitch_deg': gait_metrics.get('touchdown_pitch_deg'),
        }

        self.active_session.gait_metrics_rows.append(row)

    def end_session(
        self,
        session_metrics: dict[str, Any],
        summary_overrides: dict[str, Any] | None = None,
        session_details: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        if not self.active_session:
            return None

        summary_overrides = summary_overrides or {}
        session_details = session_details or {}
        active_session = self.active_session
        self.active_session = None

        ended_at = datetime.now(timezone.utc)
        duration_seconds = int((ended_at - active_session.started_at).total_seconds())

        total_steps = summary_overrides.get('total_steps', session_metrics.get('total_steps', 0))
        avg_speed_mps = summary_overrides.get('avg_speed_mps', session_metrics.get('avg_speed_mps'))
        cadence_spm = summary_overrides.get('cadence_spm', session_metrics.get('cadence_spm'))
        avg_stride_length_m = summary_overrides.get('avg_stride_length_m', session_metrics.get('avg_stride_length_m'))
        avg_step_length_m = summary_overrides.get(
            'avg_step_length_m',
            (avg_stride_length_m / 2.0) if avg_stride_length_m else None,
        )
        avg_clearance_m = summary_overrides.get('avg_clearance_m', session_metrics.get('avg_clearance_m'))
        symmetry_score = summary_overrides.get('symmetry_score', session_metrics.get('symmetry_percent'))
        details_payload = dict(session_details)

        game_label = active_session.metadata.get('game_label')
        if game_label and 'game_label' not in details_payload:
            details_payload['game_label'] = game_label

        session_row = {
            'patient_id': active_session.patient_id,
            'gateway_session_id': active_session.gateway_session_id,
            'session_type': active_session.session_type,
            'start_time': active_session.started_at.isoformat(),
            'end_time': ended_at.isoformat(),
            'duration_seconds': duration_seconds,
            'total_steps': total_steps,
            'avg_speed_mps': avg_speed_mps,
            'cadence_spm': cadence_spm,
            'avg_step_length_m': avg_step_length_m,
            'avg_stride_length_m': avg_stride_length_m,
            'avg_clearance_m': avg_clearance_m,
            'symmetry_score': symmetry_score,
            'source': 'gateway',
            'details': details_payload,
        }

        session_id = self.repository.save_session(session_row, active_session.gait_metrics_rows)

        return {
            'session_id': session_id,
            'gateway_session_id': active_session.gateway_session_id,
            'saved_metrics_count': len(active_session.gait_metrics_rows),
            'session_row': session_row,
        }