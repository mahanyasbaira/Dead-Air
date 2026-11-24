/**
 * Noise-tolerance trial (task B2, requirement 2.2).
 *
 * Fixed-seed statistical test: 200 frames, each modulated, mixed with seeded
 * white Gaussian noise at a given SNR, demodulated and parsed. Recovery means
 * `parse` returns ok with the original payload. All randomness comes from the
 * seeded PRNG, so the measured numbers are identical on every run.
 *
 * SNR is signal power over noise power across the whole modulated burst, with
 * white noise at the sample rate: SNR_dB = 10 log10(P_signal / sigma^2).
 */
import { describe, expect, it } from "vitest";
import { createPrng, type Prng } from "hindsight";
import { demodulate, modulate } from "./fsk";
import { frame, parse } from "./frame";

const TRIAL_FRAMES = 200;
const TRIAL_SEED = 0xb2;
const SNR_DB = 12;

/** Standard normal sample via Box-Muller, from the seeded PRNG only. */
function gaussian(rng: Prng): number {
  const u1 = 1 - rng.nextFloat(); // (0, 1]
  const u2 = rng.nextFloat();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function addWhiteNoise(samples: Float32Array, snrDb: number, rng: Prng): Float32Array {
  let power = 0;
  for (let i = 0; i < samples.length; i++) power += samples[i] * samples[i];
  power /= samples.length;
  const sigma = Math.sqrt(power / 10 ** (snrDb / 10));
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] + sigma * gaussian(rng);
  return out;
}

export interface TrialResult {
  frames: number;
  recovered: number;
  rate: number;
  bitErrors: number;
  bitsCompared: number;
  ber: number;
}

export function runTrial(sampleRate: number, snrDb: number, seed: number): TrialResult {
  const rng = createPrng(seed);
  let recovered = 0;
  let bitErrors = 0;
  let bitsCompared = 0;
  for (let f = 0; f < TRIAL_FRAMES; f++) {
    const len = 1 + (rng.nextUint32() % 16);
    const payload = new Uint8Array(len);
    for (let i = 0; i < len; i++) payload[i] = rng.nextUint32() & 0xff;
    const bytes = frame(payload);
    const noisy = addWhiteNoise(modulate(bytes, sampleRate), snrDb, rng);
    const got = demodulate(noisy, sampleRate);

    // Bit-error rate over the transmitted frame's bits.
    for (let i = 0; i < bytes.length; i++) {
      const diff = (got[i] ?? ~bytes[i]) ^ bytes[i];
      for (let k = 0; k < 8; k++) bitErrors += (diff >> k) & 1;
    }
    bitsCompared += bytes.length * 8;

    const result = parse(got);
    if (
      result.ok &&
      result.payload.length === payload.length &&
      result.payload.every((b, i) => b === payload[i])
    ) {
      recovered++;
    }
  }
  return {
    frames: TRIAL_FRAMES,
    recovered,
    rate: recovered / TRIAL_FRAMES,
    bitErrors,
    bitsCompared,
    ber: bitErrors / bitsCompared,
  };
}

describe("FSK noise tolerance (requirement 2.2)", () => {
  for (const sampleRate of [44100, 48000]) {
    it(`recovers >= 95% of ${TRIAL_FRAMES} frames at ${SNR_DB} dB SNR, ${sampleRate} Hz`, () => {
      const r = runTrial(sampleRate, SNR_DB, TRIAL_SEED);
      // eslint-disable-next-line no-console
      console.log(
        `B2 trial ${sampleRate} Hz @ ${SNR_DB} dB: ${r.recovered}/${r.frames} ` +
          `(${(r.rate * 100).toFixed(1)}%), BER ${r.ber.toExponential(3)} ` +
          `(${r.bitErrors}/${r.bitsCompared})`,
      );
      expect(r.rate).toBeGreaterThanOrEqual(0.95);
    });
  }

  it("is deterministic: the same seed gives the same result", () => {
    expect(runTrial(44100, SNR_DB, TRIAL_SEED)).toEqual(runTrial(44100, SNR_DB, TRIAL_SEED));
  });
});
