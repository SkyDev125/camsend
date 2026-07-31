# Camsend Version 1 specification

## Scope

Camsend transfers arbitrary local files by showing an optical frame stream on one display and decoding it with another device's camera. The same frame grammar works for desktop/mobile browsers and the Android app. No account, network, radio, pairing, backend, analytics, or custom cryptography is required.

## Optical frame

- Canvas aspect ratio: 16:9.
- Robust profile: 112 × 63 logical cells, 2 bits/cell (four calibrated luminance levels), 512-byte source blocks.
- Dense profile: 144 × 81 logical cells, 4 bits/cell (sixteen calibrated luminance levels), 1536-byte source blocks when measured confidence permits.
- Four 7-cell saturated marker squares identify top-left, top-right, bottom-right and bottom-left corners. Marker colors are geometry-only: magenta, green, blue, yellow.
- A 16-sample grayscale calibration strip is repeated in every frame. The decoder estimates affine luminance normalization and nearest-level margins from it.
- The remaining cells carry a Hamming-protected packet. The renderer adds a quiet surround and keeps marker colors out of the payload palette.

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

Each payload nibble is Hamming(8,4) encoded. The decoder reports corrected nibbles and rejects an uncorrectable syndrome or CRC mismatch.

## Cross-frame recovery

Files are padded and split into `source block count` blocks. Systematic packets transmit source blocks in order. Repair packet coefficient sets are generated deterministically from `(session id, sequence, source count)` using a seeded xorshift PRNG and a bounded degree distribution. A repair body is the XOR of the selected source blocks. The receiver maintains GF(2) equations, eliminates pivots incrementally, and reconstructs after all source variables are solved. Frames may arrive out of order; duplicates are ignored by `(session, sequence)`.

## Decoder loop

1. Request the highest useful camera resolution/FPS with fallbacks; record actual settings.
2. Scan the reduced frame for the four saturated marker colors.
3. Smooth marker centers while confidence remains high; solve a projective homography and reacquire when confidence drops.
4. Sample calibration and data cell neighborhoods through the homography.
5. Normalize luminance, classify the advertised profile, Hamming-decode, validate CRC, and emit a packet plus diagnostics.
6. Add new fountain equations, ignore duplicates, and expose progress.
7. Accept only after byte length and SHA-256 match.

## Diagnostics

The local export contains schema version, timestamp, platform/browser, mode, camera settings, screen profile, total/unique/duplicate/rejected frames, rejection reasons, marker/homography confidence, calibration levels/margins, corrected/uncorrectable nibbles, source/repair counts, fountain rank, decode timings, wall-clock duration, raw symbol rate, recovered payload rate, verified original-file goodput, and compression-adjusted goodput. Payload bytes and file names are excluded unless the user explicitly enables a diagnostic recording.

## Evidence gates

- Core golden vectors: encode/decode, Hamming single-bit correction, CRC rejection, fountain order/duplicate/loss recovery, and SHA-256 rejection.
- Simulator: same decoder as the browser reference path; deterministic seeded impairments; compare robust/dense profiles and baseline animated QR fixtures where available.
- Retain an optimization only if verified goodput improves without a reliability regression on the fixed fixture matrix, or if decoder cost/compatibility improves materially.
- Physical testing remains a follow-up because no camera/display hardware is available in the VM. The app must export the diagnostic schema for that testing.
