# Camsend Version 1 specification

## Scope

Camsend transfers arbitrary local files by showing an optical frame stream on one display and decoding it with another device's camera. The same frame grammar works for desktop/mobile browsers and the Android app. No account, network, radio, pairing, backend, analytics, or custom cryptography is required.

## Optical frame

- Canvas aspect ratio: 16:9.
- Robust profile: 112 × 63 logical cells, 2 bits/cell (four calibrated luminance levels), 512-byte source blocks.
- Dense profile: 144 × 81 logical cells, 4 bits/cell (sixteen calibrated luminance levels), 1536-byte source blocks when measured confidence permits.
- Tolerant glyph profile: 112 × 63 logical cells, 4 bits/cell from a 16-symbol 4×4 binary alphabet with minimum distance 8, 2600-byte source blocks, RS(255,239), and a global phase search. Its larger optical cells are intended for motion, defocus, and perspective tolerance.
- High-speed glyph profile: 144 × 81 logical cells, 6 bits/cell from a 64-symbol 4×4 binary alphabet with minimum distance 6, 7400-byte source blocks, RS(255,239), and a global phase search. This is intended for a stationary, well-focused screen-camera pair.
- Four 7-cell saturated marker squares identify top-left, top-right, bottom-right and bottom-left corners. Marker colors are geometry-only: magenta, green, blue, yellow.
- A 16-sample grayscale calibration strip is repeated in every frame. The decoder estimates affine luminance normalization and nearest-level margins from it.
- The remaining cells carry either a Hamming-protected grayscale packet or an RS-protected glyph packet. The renderer adds a quiet surround and keeps marker colors out of the payload palette.

## Packet grammar

All integer fields are little-endian. The logical packet before Hamming encoding is:

| Bytes | Field |
| ---: | --- |
| 2 | magic `OX` |
| 1 | protocol version (`1`) |
| 1 | packet kind: metadata, systematic source, or repair |
| 4 | session id |
| 4 | frame sequence |
| 4 | source block count |
| 2 | source block size |
| 4 | systematic source index or `0xffffffff` |
| 8 | original file size |
| 2 | body length |
| 1 | UTF-8 file-name length (capped at 64) |
| 1 | flags/profile |
| 64 | UTF-8 file name, zero padded |
| 32 | SHA-256 of the original file |
| N | source or repair body |
| 4 | CRC-32 over all preceding bytes |

Robust/dense payload bytes use Hamming(8,4). Glyph payload bytes use systematic RS(255,239) blocks with Berlekamp–Massey location and GF(256) magnitude solving; the decoder can correct up to eight byte errors per codeword and rejects an uncorrectable block or CRC mismatch. All variants retain CRC-32 and end-to-end SHA-256.

## Cross-frame recovery

Files are padded and split into `source block count` blocks. Systematic packets transmit source blocks in order. Repair packet coefficient sets are generated deterministically from `(session id, sequence, source count)` using a seeded xorshift PRNG and a bounded degree distribution. A repair body is the XOR of the selected source blocks. The receiver maintains GF(2) equations, eliminates pivots incrementally, and reconstructs after all source variables are solved. Frames may arrive out of order; duplicates are ignored by `(session, sequence)`.

## Decoder loop

1. Request the highest useful camera resolution/FPS with fallbacks; record actual settings.
2. Scan the reduced frame for the four saturated marker colors.
3. Smooth marker centers while confidence remains high; solve a projective homography and reacquire when confidence drops.
4. Sample calibration and data cell neighborhoods through the homography; glyph modes search a small sub-pixel phase neighborhood to compensate for marker centroid and display/camera resampling bias.
5. Normalize luminance, classify the advertised profile, apply Hamming or RS inner recovery, validate CRC, and emit a packet plus diagnostics.
6. Add new fountain equations, ignore duplicates, and expose progress.
7. Accept only after byte length and SHA-256 match.

## Diagnostics

The local export contains schema version, timestamp, platform/browser, mode, camera settings, screen profile, total/unique/duplicate/rejected frames, rejection reasons, marker/homography confidence, calibration levels/margins, glyph phase offset and confidence, corrected/uncorrectable symbols, source/repair counts, fountain rank, decode timings, wall-clock duration, raw symbol rate (bits/s), recovered payload rate (bits/s), verified original-file goodput (bytes/s and bits/s), and compression-adjusted goodput. Payload bytes and file names are excluded unless the user explicitly enables a diagnostic recording.

## Evidence gates

- Core golden vectors: encode/decode, Hamming single-bit correction, CRC rejection, fountain order/duplicate/loss recovery, and SHA-256 rejection.
- Simulator: same decoder as the browser reference path; deterministic seeded impairments; compare robust/dense/glyph profiles and baseline animated QR fixtures where available. Clean glyph6 simulation is a throughput candidate, not a physical reliability guarantee; the wider glyph4 path now completes the mild rotation/perspective/exposure fixture, while stronger blur and rolling-shutter cases remain hardening gates.
- Retain an optimization only if verified goodput improves without a reliability regression on the fixed fixture matrix, or if decoder cost/compatibility improves materially.
- Physical testing remains a follow-up because no camera/display hardware is available in the VM. The app must export the diagnostic schema for that testing.
