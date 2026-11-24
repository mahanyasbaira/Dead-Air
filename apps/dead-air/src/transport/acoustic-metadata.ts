/**
 * Pure shaping of receive metadata for the acoustic transport (requirement 4.3).
 *
 * No Web Audio, no DOM: input is the captured `Float32Array` and its sample
 * rate, output is plain numbers the transport attaches to a transport event.
 * Airtime comes from the sample count, signal level from the samples themselves.
 */

/** Level reported for silence (no samples or all zero). */
export const SILENCE_DBFS = -120;

/** What the acoustic transport measured about one received burst. */
export interface ReceiveMetadata {
  /** Length of the captured burst in milliseconds (samples / sample rate). */
  airtimeMs: number;
  /** Root-mean-square amplitude of the burst, 0 to 1 for full-scale input. */
  rms: number;
  /** `rms` in decibels relative to full scale, floored at {@link SILENCE_DBFS}. */
  dbfs: number;
  /** Largest absolute sample value. */
  peak: number;
}

/** Duration in milliseconds of `sampleCount` samples at `sampleRate` Hz. */
export function airtimeMs(sampleCount: number, sampleRate: number): number {
  if (!(sampleRate > 0) || sampleCount <= 0) return 0;
  return (sampleCount / sampleRate) * 1000;
}

/** Root-mean-square of the samples; 0 for an empty buffer. */
export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Convert a linear amplitude to dBFS, floored at {@link SILENCE_DBFS}. */
export function toDbfs(amplitude: number): number {
  if (!(amplitude > 0)) return SILENCE_DBFS;
  return Math.max(SILENCE_DBFS, 20 * Math.log10(amplitude));
}

/** Shape the metadata for one captured burst. */
export function shapeReceiveMetadata(samples: Float32Array, sampleRate: number): ReceiveMetadata {
  const rms = rmsOf(samples);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return {
    airtimeMs: airtimeMs(samples.length, sampleRate),
    rms,
    dbfs: toDbfs(rms),
    peak,
  };
}
