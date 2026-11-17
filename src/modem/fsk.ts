/**
 * Binary FSK modulation and demodulation for Dead Air's acoustic link.
 *
 * A frame (from `src/modem/frame.ts`) is a byte array. `modulate` turns it into
 * audio samples; `demodulate` turns samples back into the same bytes. Both are
 * pure functions over typed arrays — no DOM, no audio hardware, no randomness —
 * so the whole modem round-trips in Node under Vitest. The AudioWorklet (task
 * C1) is only a thin shell around these functions.
 *
 * ## Line code
 *
 * - **Binary FSK, continuous phase.** A `1` bit is the *mark* tone, a `0` bit is
 *   the *space* tone. The oscillator keeps a single running phase across symbol
 *   boundaries, so when the tone switches the waveform stays continuous (no click,
 *   no spectral splatter). This is the CPFSK / AFSK scheme Bell 202 uses.
 * - **Bit order:** most-significant bit first within each byte, matching how the
 *   frame header is described in `frame.ts`. Byte `0xAA` (`10101010`) therefore
 *   modulates as mark, space, mark, space… a clean alternating tone, which is
 *   exactly what the preamble needs for clock recovery.
 *
 * ## Starting parameters (modem steering)
 *
 * - mark = 1200 Hz, space = 2200 Hz, baud = 150.
 * - At 150 baud a symbol is `round(sampleRate / baud)` samples: 294 at 44.1 kHz,
 *   320 at 48 kHz. Both hold many cycles of each tone, so per-symbol Goertzel
 *   energy cleanly separates the two tones and the noise-free round-trip (P3,
 *   requirement 2.1) is exact at both rates. These values are recorded in
 *   `docs/RESULTS.md`; any change made by measurement is logged there with its
 *   bit-error-rate result.
 *
 * ## Demodulation
 *
 * The receiver does not know where the first symbol begins (the acoustic path
 * adds an arbitrary lead-in of silence/garbage). Clock recovery uses the known
 * preamble + sync word:
 *
 * 1. Slide a one-symbol Goertzel pair across the samples. For each candidate
 *    start offset, score how well the decoded bit stream begins with the known
 *    `preamble + sync` prefix. The best-scoring offset is the symbol clock.
 * 2. From that offset, read the length byte, then the payload and CRC, decoding
 *    each symbol by comparing mark vs space Goertzel energy.
 *
 * Because the frame layout (`PREAMBLE`, `SYNC_WORD`, length, payload, CRC) is
 * fixed and self-describing, the demodulator recovers the exact framed bytes,
 * which `parse` then validates. This resolves design open point 1 for the DSP
 * side: the preamble length (16 bits) and sync word (`0x2D 0xD4`) fixed in A3 are
 * what clock recovery locks onto; they are not changed here.
 */

import { PREAMBLE, SYNC_WORD } from "./frame";

/** Mark tone (Hz) — carries a `1` bit. */
export const MARK_HZ = 1200;
/** Space tone (Hz) — carries a `0` bit. */
export const SPACE_HZ = 2200;
/** Symbol rate (symbols per second). One bit per symbol (binary FSK). */
export const BAUD = 150;

/** Peak amplitude of the modulated carrier, leaving headroom below full scale. */
const AMPLITUDE = 0.75;

/**
 * Samples in one symbol at a given sample rate. Rounded to the nearest whole
 * sample; both 44.1 kHz (→ 294) and 48 kHz (→ 320) divide cleanly enough that the
 * per-symbol tone energy is unambiguous.
 */
export function samplesPerSymbol(sampleRate: number): number {
  return Math.round(sampleRate / BAUD);
}

/** Expand a byte array to its bits, most-significant bit first. */
function bytesToBits(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    for (let k = 0; k < 8; k++) {
      bits[i * 8 + k] = (b >> (7 - k)) & 1;
    }
  }
  return bits;
}

/** Pack a bit array (MSB first) back into bytes. Length must be a multiple of 8. */
function bitsToBytes(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(bits.length >> 3);
  for (let i = 0; i < bytes.length; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      b = (b << 1) | (bits[i * 8 + k] & 1);
    }
    bytes[i] = b;
  }
  return bytes;
}

/**
 * Modulate framed bytes to FSK audio samples.
 *
 * Continuous-phase: a single `phase` accumulator advances every sample by the
 * current tone's per-sample radian step, so the waveform never jumps when the
 * tone changes between symbols.
 *
 * @param frameBytes a complete frame (preamble + sync + length + payload + CRC).
 * @param sampleRate output sample rate in Hz (e.g. 44100 or 48000).
 * @returns mono PCM samples in [-AMPLITUDE, AMPLITUDE].
 */
export function modulate(frameBytes: Uint8Array, sampleRate: number): Float32Array {
  const bits = bytesToBits(frameBytes);
  const spp = samplesPerSymbol(sampleRate);
  const out = new Float32Array(bits.length * spp);

  const markStep = (2 * Math.PI * MARK_HZ) / sampleRate;
  const spaceStep = (2 * Math.PI * SPACE_HZ) / sampleRate;

  let phase = 0;
  let n = 0;
  for (let i = 0; i < bits.length; i++) {
    const step = bits[i] === 1 ? markStep : spaceStep;
    for (let s = 0; s < spp; s++) {
      out[n++] = AMPLITUDE * Math.sin(phase);
      phase += step;
      // Keep the accumulator bounded without introducing a discontinuity.
      if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    }
  }
  return out;
}

/**
 * Goertzel energy of one tone over a sample window.
 *
 * Returns the squared magnitude of the DFT bin nearest `freq`. Cheaper than a
 * full FFT because we only need the two tone bins per symbol.
 */
function goertzelEnergy(
  samples: Float32Array,
  start: number,
  length: number,
  freq: number,
  sampleRate: number,
): number {
  const k = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const end = start + length;
  for (let n = start; n < end; n++) {
    s0 = samples[n] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  // |X_k|^2 = s1^2 + s2^2 - coeff * s1 * s2
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Decide one symbol's bit from a window: `1` (mark) if the mark tone holds more
 * energy than the space tone, else `0` (space).
 */
function decodeBit(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
): number {
  const mark = goertzelEnergy(samples, start, length, MARK_HZ, sampleRate);
  const space = goertzelEnergy(samples, start, length, SPACE_HZ, sampleRate);
  return mark >= space ? 1 : 0;
}

/** The known bit prefix every frame starts with: preamble then sync word. */
function headerPrefixBits(): Uint8Array {
  const prefix = new Uint8Array(PREAMBLE.length + SYNC_WORD.length);
  prefix.set(PREAMBLE, 0);
  prefix.set(SYNC_WORD, PREAMBLE.length);
  return bytesToBits(prefix);
}

/**
 * Recover framed bytes from FSK samples.
 *
 * Clock recovery: the exact sample offset of the first symbol is unknown, so we
 * search candidate start offsets within the first symbol-and-a-bit of samples and
 * pick the one whose decoded leading bits best match the known preamble + sync
 * prefix. Ties and off-by-a-sample rounding are handled by scoring across the
 * whole known prefix rather than a single bit.
 *
 * With a clean (noise-free) signal the correct offset scores a perfect match, so
 * the round-trip is exact (P3, requirement 2.1). Under noise (task B2) the same
 * scoring degrades gracefully.
 *
 * @param samples FSK audio samples.
 * @param sampleRate the sample rate the samples were produced at.
 * @returns the recovered frame bytes. Length is inferred from the decoded length
 *   byte; `parse` from `frame.ts` then validates sync and CRC.
 */
export function demodulate(samples: Float32Array, sampleRate: number): Uint8Array {
  const spp = samplesPerSymbol(sampleRate);
  const prefixBits = headerPrefixBits();

  if (samples.length < spp * prefixBits.length) {
    // Not enough signal to even contain the known header; return what little we
    // can so `parse` reports a sync/length failure rather than this throwing.
    return new Uint8Array(0);
  }

  // Search for the symbol-clock offset that best reproduces the known prefix.
  // The lead-in is at most one symbol of unknown alignment plus any silence; we
  // scan a full symbol of offsets, which covers every possible phase.
  const maxOffset = Math.min(spp, samples.length - spp * prefixBits.length);
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset <= maxOffset; offset++) {
    let score = 0;
    for (let i = 0; i < prefixBits.length; i++) {
      const start = offset + i * spp;
      const bit = decodeBit(samples, start, spp, sampleRate);
      if (bit === prefixBits[i]) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
      // A perfect prefix match cannot be beaten; stop early.
      if (score === prefixBits.length) break;
    }
  }

  const readByteAt = (bitStart: number): number => {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      const start = bestOffset + (bitStart + k) * spp;
      const bit = decodeBit(samples, start, spp, sampleRate);
      b = (b << 1) | bit;
    }
    return b;
  };

  // Header is fixed-size; the length byte follows preamble + sync.
  const lengthBitPos = (PREAMBLE.length + SYNC_WORD.length) * 8;
  const declaredLength = readByteAt(lengthBitPos);

  // Total frame bytes = preamble + sync + length(1) + payload + CRC(2).
  const totalBytes = PREAMBLE.length + SYNC_WORD.length + 1 + declaredLength + 2;
  const totalBits = totalBytes * 8;

  // Clamp to what the samples can actually hold, so a garbage length never reads
  // past the buffer; a short/over-long read surfaces as a parse failure.
  const availableSymbols = Math.floor((samples.length - bestOffset) / spp);
  const usableBits = Math.min(totalBits, availableSymbols);
  const wholeBytes = usableBits - (usableBits % 8);

  const bits = new Uint8Array(wholeBytes);
  for (let i = 0; i < wholeBytes; i++) {
    const start = bestOffset + i * spp;
    bits[i] = decodeBit(samples, start, spp, sampleRate);
  }
  return bitsToBytes(bits);
}
