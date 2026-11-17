---
inclusion: fileMatch
fileMatchPattern: ["**/modem/**/*", "**/channel/**/*", "**/transport/**/*"]
---
# Signal chain rules

- Binary FSK, continuous phase. Start from: mark 1200 Hz, space 2200 Hz, 150 baud, 44.1/48 kHz. Tune by measurement, not guesswork; record every change and its bit-error-rate result in `docs/RESULTS.md`.
- Frame: preamble (alternating bits) + sync word + length byte + payload (max 64 bytes) + CRC-16. A frame with a bad CRC is delivered to the engine as `garbled`, never silently dropped and never silently "fixed".
- Demodulator: Goertzel or quadrature correlator per symbol with clock recovery from the preamble. Pure functions over `Float32Array`; the AudioWorklet is a thin shell.
- Half-duplex: a device does not decode while it transmits. Overlapping transmissions are a `collision` event for both.
- The simulated channel applies the same impairments to bytes that the room applies to sound: delay, drop, bit flips, collision. All from the seeded PRNG.
- Every function here needs a property test: encode→decode round-trips for any payload; CRC detects any single-bit flip; same seed gives the same impairment sequence.
- Acoustic mode is time-boxed. If it is not reliable at 1 m between two laptops by Nov 21, switch the acoustic transport to the MIT-licensed `ggwave` library behind the same `Transport` interface and say so in the write-up.
