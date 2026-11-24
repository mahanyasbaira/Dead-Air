import { describe, expect, it } from "vitest";
import {
  modulate,
  demodulate,
  samplesPerSymbol,
  MARK_HZ,
  SPACE_HZ,
  BAUD,
} from "./fsk";
import { frame, parse } from "./frame";

/**
 * Example tests for FSK modulation. These pin behaviour a person would describe:
 * a `1` symbol holds the mark tone and a `0` symbol holds the space tone, the
 * waveform stays within range, symbol size matches the baud/rate arithmetic, and
 * a short known frame round-trips end-to-end at one sample rate. The universal
 * round-trip across both rates (P3, requirement 2.1) lives in `fsk.prop.test.ts`.
 */

const SR = 48000;

/** Goertzel energy of a tone over a whole buffer — a local copy for assertions. */
function toneEnergy(samples: Float32Array, freq: number, sampleRate: number): number {
  const k = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < samples.length; n++) {
    const s0 = samples[n] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

describe("fsk modulate examples", () => {
  it("computes samples per symbol from sample rate and baud", () => {
    expect(samplesPerSymbol(44100)).toBe(Math.round(44100 / BAUD));
    expect(samplesPerSymbol(48000)).toBe(Math.round(48000 / BAUD));
    expect(samplesPerSymbol(44100)).toBe(294);
    expect(samplesPerSymbol(48000)).toBe(320);
  });

  it("keeps all samples within [-1, 1]", () => {
    const samples = modulate(frame(Uint8Array.of(0x55, 0xa0)), SR);
    for (let i = 0; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(-1);
      expect(samples[i]).toBeLessThanOrEqual(1);
    }
  });

  it("a single 1 bit (byte 0x80) modulates to a dominant MARK tone", () => {
    // 0x80 = 1000_0000: first symbol is a mark, the rest are space.
    const spp = samplesPerSymbol(SR);
    const samples = modulate(Uint8Array.of(0x80), SR);
    const firstSymbol = samples.subarray(0, spp);
    const mark = toneEnergy(firstSymbol, MARK_HZ, SR);
    const space = toneEnergy(firstSymbol, SPACE_HZ, SR);
    expect(mark).toBeGreaterThan(space);
  });

  it("a single 0 bit (byte 0x00) modulates to a dominant SPACE tone", () => {
    const spp = samplesPerSymbol(SR);
    const samples = modulate(Uint8Array.of(0x00), SR);
    const firstSymbol = samples.subarray(0, spp);
    const mark = toneEnergy(firstSymbol, MARK_HZ, SR);
    const space = toneEnergy(firstSymbol, SPACE_HZ, SR);
    expect(space).toBeGreaterThan(mark);
  });

  it("holds continuous phase across a mark→space symbol boundary (no jump)", () => {
    // 0xA0 = 1010_0000: symbol 0 = mark, symbol 1 = space. At the boundary the
    // sample-to-sample step should stay small (continuous), not snap.
    const spp = samplesPerSymbol(SR);
    const samples = modulate(Uint8Array.of(0xa0), SR);
    const before = samples[spp - 1];
    const after = samples[spp];
    // One-sample step of a <=2200 Hz tone at 48 kHz is well under 0.3 in amplitude.
    expect(Math.abs(after - before)).toBeLessThan(0.3);
  });

  it("round-trips a known short frame end-to-end at 48 kHz", () => {
    const payload = Uint8Array.of(0xde, 0xad, 0xa1, 0x12);
    const framed = frame(payload);
    const recovered = demodulate(modulate(framed, SR), SR);
    expect(Array.from(recovered)).toEqual(Array.from(framed));
    const result = parse(recovered);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.from(result.payload)).toEqual(Array.from(payload));
  });

  it("recovers an empty-payload frame (header + CRC only)", () => {
    const framed = frame(new Uint8Array(0));
    const recovered = demodulate(modulate(framed, SR), SR);
    expect(Array.from(recovered)).toEqual(Array.from(framed));
    expect(parse(recovered).ok).toBe(true);
  });

  it("locks the clock despite a lead-in of silence before the preamble", () => {
    const framed = frame(Uint8Array.of(0x01, 0x02, 0x03));
    const body = modulate(framed, SR);
    // Prepend a non-symbol-aligned run of silence (half a symbol).
    const lead = Math.floor(samplesPerSymbol(SR) / 2);
    const withLead = new Float32Array(lead + body.length);
    withLead.set(body, lead);
    const recovered = demodulate(withLead, SR);
    expect(parse(recovered).ok).toBe(true);
  });
});
