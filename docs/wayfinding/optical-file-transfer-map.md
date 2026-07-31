# Wayfinder map: practical optical file transfer

## Destination

Reach a build-ready, research-backed Version 1 specification and a working interoperable website/PWA plus Android application for offline screen-to-camera file transfer. The destination includes a shared codec core, reproducible simulator/benchmarks, exact reconstruction with SHA-256 verification, diagnostic exports, an installable APK, and a prioritized experimental roadmap.

## Notes

- The local files mirror the canonical GitHub map at https://github.com/SkyDev125/camsend/issues/1.
- Use primary sources where possible: papers, standards, official browser/Android documentation, and first-party implementations.
- Research first, then resolve only the decisions needed to build Version 1. Research is parallelizable; implementation follows the resolved map.
- Keep all file contents local. Do not add a backend, analytics, accounts, pairing, or custom cryptography.

## Decisions so far

- [Optical modulation and symbol alphabet](https://github.com/SkyDev125/camsend/issues/2) — visible calibrated grayscale tiles; robust 2-bit mode and measured 4-bit dense mode, with saturated colour reserved for fiducials.
- [Colour, blur, glare, and hardware impairment model](https://github.com/SkyDev125/camsend/issues/3) — seeded simulation covers geometry, blur, exposure/colour, noise, rolling shutter, frame loss/duplicates and obstruction; retain only measured gains.
- [Inner and cross-frame error correction](https://github.com/SkyDev125/camsend/issues/4) — Hamming(8,4) plus CRC-32 per packet and deterministic sparse-XOR fountain recovery across unordered frames.
- [Simulator, benchmark, and evidence thresholds](https://github.com/SkyDev125/camsend/issues/5) — verified original-file goodput after exact length and SHA-256, separated from raw symbol/payload rates.
- [Named systems and present bottlenecks](https://github.com/SkyDev125/camsend/issues/6) — geometry, calibration, synchronization and acquisition cost dominate portable goodput; no direct animated-QR reproduction.
- [Camera/display synchronization and rolling shutter](https://github.com/SkyDev125/camsend/issues/7) — session/sequence IDs, duplicate suppression, repetition/fountain recovery; rolling-shutter exploitation deferred.
- [Shared web/Android implementation boundary](https://github.com/SkyDev125/camsend/issues/8) — language-neutral frame grammar with golden vectors, browser reference path and native Android adapter.
- [Tracking, perspective, and calibration](https://github.com/SkyDev125/camsend/issues/9) — coloured marker centroids plus projective homography, persistent tracking and per-frame luminance calibration.

## Open decision tickets

<!-- The research frontier is clear enough for implementation. New tickets will be added only for implementation decisions that emerge from benchmarks. -->

## Not yet specified

- Whether adaptive multi-region modulation or a full RaptorQ implementation beats the V1 baseline in the benchmark matrix.
- Which native acceleration paths are available on the build/test machine and which remain optional.
- Physical-device tuning, because no camera/display lab hardware is available in the VM.

## Out of scope

- Cloud relay, server-side upload, accounts, pairing, device discovery, or transport fallback over radio/network links.
- Custom cryptography or claims of confidentiality beyond local-only operation.
- A production-grade multi-platform native desktop application in Version 1; desktop browsers are the supported computer endpoint.
