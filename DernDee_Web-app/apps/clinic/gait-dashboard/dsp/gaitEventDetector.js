/**
 * Gait Event Detector
 *
 * Detects gait events from shank-mounted IMU angular velocity (sagittal plane).
 */

import { findLocalMinima, findZeroCrossing, movingAverage } from './signalUtils.js';

export class GaitEventDetector {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.hsProminence = options.hsProminence || 80;
    this.toProminence = options.toProminence || 30;
    this.minStrideTime = options.minStrideTime || 0.6;
    this.maxStrideTime = options.maxStrideTime || 2.0;
    this.smoothingWindow = options.smoothingWindow || 5;
    this.stillAngularVelocityAbs = options.stillAngularVelocityAbs ?? 10;
    this.stillDurationSeconds = options.stillDurationSeconds ?? 0.2;
    this.minSwingAngularVelocityAbs = options.minSwingAngularVelocityAbs ?? 20;
    this.minOpenStrideTimeSeconds = options.minOpenStrideTimeSeconds ?? 0.3;
  }

  detect(angVel, timestamps) {
    const dt = 1.0 / this.sampleRate;
    const minStrideSamples = Math.floor(this.minStrideTime * this.sampleRate);
    const maxStrideSamples = Math.ceil(this.maxStrideTime * this.sampleRate);
    const stillSamples = Math.max(1, Math.floor(this.stillDurationSeconds * this.sampleRate));

    const smoothed = movingAverage(angVel, this.smoothingWindow);
    const minHsDistance = Math.floor(minStrideSamples * 0.8);
    const allMinima = findLocalMinima(smoothed, this.hsProminence, minHsDistance);
    const heelStrikes = allMinima.filter((idx) => smoothed[idx] < -50);

    const events = [];
    const cycles = [];

    for (const idx of heelStrikes) {
      events.push({
        index: idx,
        time: timestamps ? timestamps[idx] : idx * dt,
        type: 'HS',
      });
    }

    for (let i = 0; i < heelStrikes.length - 1; i += 1) {
      const hsStartIdx = heelStrikes[i];
      const hsEndIdx = heelStrikes[i + 1];
      const strideSamples = hsEndIdx - hsStartIdx;

      if (strideSamples < minStrideSamples || strideSamples > maxStrideSamples) {
        continue;
      }

      const msvIdx = findZeroCrossing(
        smoothed,
        hsStartIdx + 5,
        hsStartIdx + Math.floor(strideSamples * 0.4),
      );

      if (msvIdx !== null) {
        events.push({
          index: msvIdx,
          time: timestamps ? timestamps[msvIdx] : msvIdx * dt,
          type: 'MSV',
        });
      }

      const toSearchStart = hsStartIdx + Math.floor(strideSamples * 0.35);
      const toSearchEnd = hsStartIdx + Math.floor(strideSamples * 0.75);
      const toMinima = findLocalMinima(
        smoothed.slice(toSearchStart, toSearchEnd),
        this.toProminence,
        10,
      );

      let toIdx = null;
      if (toMinima.length > 0) {
        toIdx = toMinima[0] + toSearchStart;
        events.push({
          index: toIdx,
          time: timestamps ? timestamps[toIdx] : toIdx * dt,
          type: 'TO',
        });
      }

      const strideTime = (hsEndIdx - hsStartIdx) * dt;
      const stanceTime = toIdx !== null ? (toIdx - hsStartIdx) * dt : strideTime * 0.62;
      const swingTime = strideTime - stanceTime;

      cycles.push({
        hsStart: { index: hsStartIdx, time: timestamps ? timestamps[hsStartIdx] : hsStartIdx * dt, type: 'HS' },
        hsEnd: { index: hsEndIdx, time: timestamps ? timestamps[hsEndIdx] : hsEndIdx * dt, type: 'HS' },
        to: toIdx !== null
          ? { index: toIdx, time: timestamps ? timestamps[toIdx] : toIdx * dt, type: 'TO' }
          : null,
        msv: msvIdx !== null
          ? { index: msvIdx, time: timestamps ? timestamps[msvIdx] : msvIdx * dt, type: 'MSV' }
          : null,
        strideTime,
        stanceTime,
        swingTime,
        stancePct: (stanceTime / strideTime) * 100,
        swingPct: (swingTime / strideTime) * 100,
      });
    }

    if (heelStrikes.length >= 1 && timestamps && timestamps.length > 0) {
      const hsStartIdx = heelStrikes[heelStrikes.length - 1];
      const n = smoothed.length;

      const stillAbs = this.stillAngularVelocityAbs;
      let stillRun = 0;
      let endIdx = null;

      for (let i = hsStartIdx; i < n; i += 1) {
        if (Math.abs(smoothed[i]) <= stillAbs) {
          stillRun += 1;
          if (stillRun >= stillSamples) {
            endIdx = i;
            break;
          }
        } else {
          stillRun = 0;
        }
      }

      if (endIdx !== null) {
        const strideSamples = endIdx - hsStartIdx;
        const minOpenStrideSamples = Math.floor(this.minOpenStrideTimeSeconds * this.sampleRate);
        if (strideSamples >= minOpenStrideSamples && strideSamples <= maxStrideSamples) {
          let maxAbsWithin = 0;
          for (let j = hsStartIdx; j <= endIdx; j += 1) {
            const v = Math.abs(smoothed[j]);
            if (v > maxAbsWithin) {
              maxAbsWithin = v;
            }
          }

          if (maxAbsWithin >= this.minSwingAngularVelocityAbs) {
            const msvSearchEnd = hsStartIdx + Math.max(1, Math.floor(strideSamples * 0.4));
            const msvIdx = findZeroCrossing(smoothed, hsStartIdx + 5, msvSearchEnd);
            if (msvIdx !== null) {
              events.push({
                index: msvIdx,
                time: timestamps[msvIdx],
                type: 'MSV',
              });
            }

            const toSearchStart = hsStartIdx + Math.floor(strideSamples * 0.35);
            const toSearchEnd = Math.min(hsStartIdx + Math.floor(strideSamples * 0.75), endIdx);
            let toIdx = null;
            if (toSearchEnd > toSearchStart + 2) {
              const toMinima = findLocalMinima(
                smoothed.slice(toSearchStart, toSearchEnd),
                this.toProminence,
                10,
              );
              if (toMinima.length > 0) {
                toIdx = toMinima[0] + toSearchStart;
                events.push({
                  index: toIdx,
                  time: timestamps[toIdx],
                  type: 'TO',
                });
              }
            }

            const strideTime = (endIdx - hsStartIdx) * dt;
            const stanceTime = toIdx !== null ? (toIdx - hsStartIdx) * dt : strideTime * 0.62;
            const swingTime = strideTime - stanceTime;

            cycles.push({
              hsStart: { index: hsStartIdx, time: timestamps[hsStartIdx], type: 'HS' },
              hsEnd: { index: endIdx, time: timestamps[endIdx], type: 'HS' },
              to: toIdx !== null ? { index: toIdx, time: timestamps[toIdx], type: 'TO' } : null,
              msv: msvIdx !== null ? { index: msvIdx, time: timestamps[msvIdx], type: 'MSV' } : null,
              strideTime,
              stanceTime,
              swingTime,
              stancePct: (stanceTime / strideTime) * 100,
              swingPct: (swingTime / strideTime) * 100,
            });
          }
        }
      }
    }

    events.sort((a, b) => a.index - b.index);
    return { events, cycles };
  }
}