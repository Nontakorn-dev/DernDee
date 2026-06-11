import { deg2rad, trapezoidalIntegrate } from './signalUtils.js';

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeWindow(window, sampleCount) {
  const startIdx = Math.max(0, Math.round(window?.startIdx ?? 0));
  const endIdx = Math.min(sampleCount - 1, Math.round(window?.endIdx ?? -1));
  if (endIdx < startIdx) {
    return null;
  }

  return { startIdx, endIdx };
}

function averageInWindow(values, window) {
  const samples = [];
  for (let i = window.startIdx; i <= window.endIdx; i += 1) {
    samples.push(values[i]);
  }
  return average(samples);
}

function averageIndexInWindow(window) {
  return (window.startIdx + window.endIdx) / 2;
}

export class VelocityIntegrator {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.dt = 1.0 / this.sampleRate;
    this.gravity = options.gravity || 9.81;
  }

  sensorToWorld(ay, az, angle) {
    const theta = deg2rad(angle);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const aVert = -ay * cosT + az * sinT;
    const aHoriz = -ay * sinT - az * cosT;

    return { aVert, aHoriz };
  }

  computeStrideMetrics(ayArray, azArray, angles, options = {}) {
    const sampleCount = ayArray.length;
    if (sampleCount < 2) {
      return {
        strideLength: 0,
        clearance: 0,
        velocity: [],
        displacement: [],
        verticalVelocity: [],
        verticalDisplacement: [],
      };
    }

    const integrationStartIdx = Math.max(0, Math.min(sampleCount - 1, Math.round(options.integrationStartIdx ?? 0)));
    const integrationEndIdx = Math.max(integrationStartIdx, Math.min(sampleCount - 1, Math.round(options.integrationEndIdx ?? (sampleCount - 1))));
    const measureSwingDisplacement = options.measureSwingDisplacement === true;
    const zuptExcludeIndices = new Set(
      [integrationStartIdx, integrationEndIdx].filter(Number.isInteger),
    );
    const stanceWindows = Array.isArray(options.stanceWindows)
      ? options.stanceWindows
        .map((window) => normalizeWindow(window, sampleCount))
        .filter(Boolean)
      : [];

    const aHoriz = new Array(sampleCount);
    const aVertLinear = new Array(sampleCount);

    for (let i = 0; i < sampleCount; i += 1) {
      const world = this.sensorToWorld(ayArray[i], azArray[i], angles[i]);
      aHoriz[i] = world.aHoriz;
      aVertLinear[i] = world.aVert - this.gravity;
    }

    const horizontalBiasSamples = [];
    const verticalBiasSamples = [];
    for (const stanceWindow of stanceWindows) {
      const startIdx = Math.max(0, Math.round(stanceWindow?.startIdx ?? 0));
      const endIdx = Math.min(sampleCount - 1, Math.round(stanceWindow?.endIdx ?? -1));

      if (endIdx < startIdx) {
        continue;
      }

      for (let i = startIdx; i <= endIdx; i += 1) {
        horizontalBiasSamples.push(aHoriz[i]);
        verticalBiasSamples.push(aVertLinear[i]);
      }
    }

    const horizontalBias = average(horizontalBiasSamples);
    const verticalBias = average(verticalBiasSamples);

    const correctedHoriz = aHoriz.map((value) => value - horizontalBias);
    const correctedVert = aVertLinear.map((value) => value - verticalBias);

    if (stanceWindows.length >= 2) {
      const leftStanceWindow = stanceWindows[0];
      const rightStanceWindow = stanceWindows[stanceWindows.length - 1];

      let velocityFull = trapezoidalIntegrate(correctedHoriz, this.dt);
      velocityFull = this.correctDriftWithStanceBoundaries(velocityFull, leftStanceWindow, rightStanceWindow);
      velocityFull = this.enforceZeroVelocityInStanceWindows(
        velocityFull,
        stanceWindows,
        measureSwingDisplacement ? zuptExcludeIndices : new Set(),
      );
      const displacementFull = trapezoidalIntegrate(velocityFull, this.dt);

      let verticalVelocityFull = trapezoidalIntegrate(correctedVert, this.dt);
      verticalVelocityFull = this.correctDriftWithStanceBoundaries(verticalVelocityFull, leftStanceWindow, rightStanceWindow);
      verticalVelocityFull = this.enforceZeroVelocityInStanceWindows(
        verticalVelocityFull,
        stanceWindows,
        measureSwingDisplacement ? zuptExcludeIndices : new Set(),
      );
      const verticalDisplacementFull = trapezoidalIntegrate(verticalVelocityFull, this.dt);

      const startDisplacement = averageInWindow(displacementFull, leftStanceWindow);
      const endDisplacement = averageInWindow(displacementFull, rightStanceWindow);
      const leftVerticalBaseline = averageInWindow(verticalDisplacementFull, leftStanceWindow);
      const rightVerticalBaseline = averageInWindow(verticalDisplacementFull, rightStanceWindow);
      const verticalBaseline = Math.min(leftVerticalBaseline, rightVerticalBaseline);

      let swingMaxVertical = -Infinity;
      for (let i = integrationStartIdx; i <= integrationEndIdx; i += 1) {
        swingMaxVertical = Math.max(swingMaxVertical, verticalDisplacementFull[i]);
      }

      const velocity = velocityFull.slice(integrationStartIdx, integrationEndIdx + 1);
      const displacementOffset = displacementFull[integrationStartIdx] ?? 0;
      const displacement = displacementFull
        .slice(integrationStartIdx, integrationEndIdx + 1)
        .map((value) => value - displacementOffset);
      const verticalVelocity = verticalVelocityFull.slice(integrationStartIdx, integrationEndIdx + 1);
      const verticalDisplacement = verticalDisplacementFull
        .slice(integrationStartIdx, integrationEndIdx + 1)
        .map((value) => value - verticalBaseline);

      const stanceBoundLength = Math.abs(endDisplacement - startDisplacement);
      const swingReference = displacementFull[integrationStartIdx] ?? 0;
      const swingIntegrationLength = Math.abs(
        displacementFull[integrationEndIdx] - swingReference,
      );
      const relativeSwingLength = displacement.length
        ? Math.abs(displacement[displacement.length - 1])
        : 0;
      let peakSwingDisplacement = 0;
      for (let i = integrationStartIdx; i <= integrationEndIdx; i += 1) {
        peakSwingDisplacement = Math.max(
          peakSwingDisplacement,
          Math.abs(displacementFull[i] - swingReference),
        );
      }
      const spatialLength = measureSwingDisplacement
        ? Math.max(swingIntegrationLength, relativeSwingLength, peakSwingDisplacement)
        : stanceBoundLength;

      return {
        strideLength: spatialLength,
        stepLength: measureSwingDisplacement ? spatialLength : null,
        stanceBoundLength,
        swingIntegrationLength,
        clearance: Math.max(0, swingMaxVertical - verticalBaseline),
        velocity,
        displacement,
        verticalVelocity,
        verticalDisplacement,
      };
    }

    const swingHoriz = [];
    const swingVert = [];
    for (let i = integrationStartIdx; i <= integrationEndIdx; i += 1) {
      swingHoriz.push(correctedHoriz[i]);
      swingVert.push(correctedVert[i]);
    }

    if (swingHoriz.length < 2) {
      return {
        strideLength: 0,
        clearance: 0,
        velocity: [],
        displacement: [],
        verticalVelocity: [],
        verticalDisplacement: [],
      };
    }

    let velocity = trapezoidalIntegrate(swingHoriz, this.dt);
    velocity = this.correctDrift(velocity);
    const displacement = trapezoidalIntegrate(velocity, this.dt);

    let verticalVelocity = trapezoidalIntegrate(swingVert, this.dt);
    verticalVelocity = this.correctDrift(verticalVelocity);
    const verticalDisplacement = trapezoidalIntegrate(verticalVelocity, this.dt);

    let minVertical = Infinity;
    let maxVertical = -Infinity;
    for (const value of verticalDisplacement) {
      minVertical = Math.min(minVertical, value);
      maxVertical = Math.max(maxVertical, value);
    }

    const strideLength = Math.abs(displacement[displacement.length - 1]);
    const clearance = Math.max(0, maxVertical - minVertical);

    return {
      strideLength,
      clearance,
      velocity,
      displacement,
      verticalVelocity,
      verticalDisplacement,
    };
  }

  correctDrift(velocity) {
    const sampleCount = velocity.length;
    if (sampleCount < 2) {
      return velocity;
    }

    const vStart = velocity[0];
    const vEnd = velocity[sampleCount - 1];
    const driftPerSample = (vEnd - vStart) / (sampleCount - 1);

    const corrected = new Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      corrected[i] = velocity[i] - (vStart + driftPerSample * i);
    }

    return corrected;
  }

  correctDriftWithStanceBoundaries(velocity, leftWindow, rightWindow) {
    const leftAnchorIndex = averageIndexInWindow(leftWindow);
    const rightAnchorIndex = averageIndexInWindow(rightWindow);
    if (!Number.isFinite(leftAnchorIndex) || !Number.isFinite(rightAnchorIndex) || rightAnchorIndex <= leftAnchorIndex) {
      return this.correctDrift(velocity);
    }

    const leftAnchorVelocity = averageInWindow(velocity, leftWindow);
    const rightAnchorVelocity = averageInWindow(velocity, rightWindow);
    const slope = (rightAnchorVelocity - leftAnchorVelocity) / (rightAnchorIndex - leftAnchorIndex);

    const corrected = new Array(velocity.length);
    for (let i = 0; i < velocity.length; i += 1) {
      corrected[i] = velocity[i] - (leftAnchorVelocity + (slope * (i - leftAnchorIndex)));
    }

    return corrected;
  }

  enforceZeroVelocityInStanceWindows(velocity, stanceWindows, excludeIndices = new Set()) {
    const corrected = [...velocity];
    for (const stanceWindow of stanceWindows) {
      for (let i = stanceWindow.startIdx; i <= stanceWindow.endIdx; i += 1) {
        if (!excludeIndices.has(i)) {
          corrected[i] = 0;
        }
      }
    }

    return corrected;
  }
}