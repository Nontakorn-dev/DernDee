import { findLocalMinima, findZeroCrossing, movingAverage } from './signalUtils.js';

function getTimeAt(timestamps, index, fallbackDt) {
  if (timestamps && Number.isFinite(timestamps[index])) {
    return timestamps[index];
  }

  return index * fallbackDt;
}

function getDurationBetween(timestamps, startIdx, endIdx, fallbackDt) {
  if (startIdx === null || endIdx === null || startIdx === undefined || endIdx === undefined) {
    return null;
  }

  const startTime = getTimeAt(timestamps, startIdx, fallbackDt);
  const endTime = getTimeAt(timestamps, endIdx, fallbackDt);
  return Math.max(0, endTime - startTime);
}

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

    const smoothed = movingAverage(angVel, this.smoothingWindow);
    const minHsDistance = Math.floor(this.minStrideTime * this.sampleRate * 0.8);
    const allMinima = findLocalMinima(smoothed, this.hsProminence, minHsDistance);
    const heelStrikes = allMinima.filter((idx) => smoothed[idx] < -50);

    const events = [];
    const rawStrides = [];

    for (const idx of heelStrikes) {
      events.push({
        index: idx,
        time: getTimeAt(timestamps, idx, dt),
        type: 'HS',
      });
    }

    for (let i = 0; i < heelStrikes.length - 1; i += 1) {
      const hsStartIdx = heelStrikes[i];
      const hsEndIdx = heelStrikes[i + 1];
      const strideSamples = hsEndIdx - hsStartIdx;
      const strideTime = getDurationBetween(timestamps, hsStartIdx, hsEndIdx, dt);

      if (strideTime === null || strideTime < this.minStrideTime || strideTime > this.maxStrideTime) {
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
          time: getTimeAt(timestamps, msvIdx, dt),
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
          time: getTimeAt(timestamps, toIdx, dt),
          type: 'TO',
        });
      }

      const measuredStanceTime = toIdx !== null
        ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
        : null;
      const stanceTime = measuredStanceTime !== null
        ? Math.max(0, Math.min(strideTime, measuredStanceTime))
        : strideTime * 0.62;
      const swingTime = Math.max(0, strideTime - stanceTime);

      rawStrides.push({
        hsStart: { index: hsStartIdx, time: getTimeAt(timestamps, hsStartIdx, dt), type: 'HS' },
        hsEnd: { index: hsEndIdx, time: getTimeAt(timestamps, hsEndIdx, dt), type: 'HS' },
        to: toIdx !== null ? { index: toIdx, time: getTimeAt(timestamps, toIdx, dt), type: 'TO' } : null,
        msv: msvIdx !== null ? { index: msvIdx, time: getTimeAt(timestamps, msvIdx, dt), type: 'MSV' } : null,
        strideTime,
        stanceTime,
        swingTime,
        stancePct: strideTime > 0 ? (stanceTime / strideTime) * 100 : 0,
        swingPct: strideTime > 0 ? (swingTime / strideTime) * 100 : 0,
      });
    }

    if (heelStrikes.length >= 1 && timestamps && timestamps.length > 0) {
      const hsStartIdx = heelStrikes[heelStrikes.length - 1];
      const sampleCount = smoothed.length;

      let stillStartIdx = null;
      let endIdx = null;

      for (let i = hsStartIdx; i < sampleCount; i += 1) {
        if (Math.abs(smoothed[i]) <= this.stillAngularVelocityAbs) {
          if (stillStartIdx === null) {
            stillStartIdx = i;
          }

          const stillDuration = getDurationBetween(timestamps, stillStartIdx, i, dt);
          if (stillDuration !== null && stillDuration >= this.stillDurationSeconds) {
            endIdx = i;
            break;
          }
        } else {
          stillStartIdx = null;
        }
      }

      if (endIdx !== null) {
        const strideSamples = endIdx - hsStartIdx;
        const openStrideTime = getDurationBetween(timestamps, hsStartIdx, endIdx, dt);

        if (
          openStrideTime !== null
          && openStrideTime >= this.minOpenStrideTimeSeconds
          && openStrideTime <= this.maxStrideTime
        ) {
          let maxAbsWithin = 0;
          for (let j = hsStartIdx; j <= endIdx; j += 1) {
            maxAbsWithin = Math.max(maxAbsWithin, Math.abs(smoothed[j]));
          }

          if (maxAbsWithin >= this.minSwingAngularVelocityAbs) {
            const msvSearchEnd = hsStartIdx + Math.max(1, Math.floor(strideSamples * 0.4));
            const msvIdx = findZeroCrossing(smoothed, hsStartIdx + 5, msvSearchEnd);

            if (msvIdx !== null) {
              events.push({
                index: msvIdx,
                time: getTimeAt(timestamps, msvIdx, dt),
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
                  time: getTimeAt(timestamps, toIdx, dt),
                  type: 'TO',
                });
              }
            }

            const measuredStanceTime = toIdx !== null
              ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
              : null;
            const stanceTime = measuredStanceTime !== null
              ? Math.max(0, Math.min(openStrideTime, measuredStanceTime))
              : openStrideTime * 0.62;
            const swingTime = Math.max(0, openStrideTime - stanceTime);

            rawStrides.push({
              hsStart: { index: hsStartIdx, time: getTimeAt(timestamps, hsStartIdx, dt), type: 'HS' },
              hsEnd: { index: endIdx, time: getTimeAt(timestamps, endIdx, dt), type: 'HS' },
              to: toIdx !== null ? { index: toIdx, time: getTimeAt(timestamps, toIdx, dt), type: 'TO' } : null,
              msv: msvIdx !== null ? { index: msvIdx, time: getTimeAt(timestamps, msvIdx, dt), type: 'MSV' } : null,
              strideTime: openStrideTime,
              stanceTime,
              swingTime,
              stancePct: openStrideTime > 0 ? (stanceTime / openStrideTime) * 100 : 0,
              swingPct: openStrideTime > 0 ? (swingTime / openStrideTime) * 100 : 0,
            });
          }
        }
      }
    }

    const cycles = rawStrides.filter((cycle) => cycle?.hsStart && cycle?.hsEnd);

    events.sort((a, b) => a.index - b.index);
    return { events, cycles };
  }
}