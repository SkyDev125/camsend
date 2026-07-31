# ADR-0001: Visible calibrated tile stream with fountain recovery

- Status: accepted for Version 1
- Date: 2026-07-31

## Context

The project must move arbitrary files between screens and cameras without radio, accounts, network access, or synchronized clocks. Ordinary browser webcams cannot guarantee fixed resolution, exposure, or frame rate. Research systems show that throughput depends jointly on cell footprint, perspective, blur, synchronization, calibration and recovery, not only on nominal screen pixels.

## Decision

Use a visible screen-wide tile stream. Four saturated corner fiducials define a projective quadrilateral. A per-frame grayscale calibration strip estimates luminance levels. Payload cells use 2-bit calibrated luminance in robust mode and 4-bit calibrated luminance in dense mode. Packets carry session/sequence metadata and CRC-32. Hamming(8,4) protects each nibble. File source blocks and deterministic sparse-XOR repair packets provide unordered cross-frame recovery. Acceptance requires exact length and SHA-256.

The shared protocol is specified by the JavaScript reference implementation and golden vectors. The browser and native Android host currently run those same assets; any future independent native codec must match the vectors. Camera processing exposes a low-cost reference path first; WebAssembly/SIMD/GPU and Camera2 controls are optional accelerators.

## Alternatives rejected

- Animated QR: retained only as a baseline fixture; too much finder/format overhead for the target payload.
- Full colour payload: rejected as the default because white balance and exposure make colour confusion device-dependent. Colour remains useful for markers.
- Imperceptible alpha/blue-channel embedding: rejected for file goodput; retain as a future unobtrusive mode.
- Full RaptorQ, DNN decoders, OFDM and rolling-shutter-only synchronization: deferred until measured V1 bottlenecks justify the added portability/complexity cost.

## Consequences

The baseline is deterministic and testable in browser, Node, and Android. It needs a visible transfer screen and a user who points a camera at it. The four-colour marker scan and homography are more work than a QR library, but diagnostics can explain failure. The sparse-XOR fountain is not expected to beat optimized RaptorQ for every file size; its benefit is a small, shared, inspectable first implementation.
