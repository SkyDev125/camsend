# Implement shared protocol and codec core

Part of #1.

Implement `src/core` with the V1 wire grammar, CRC-32, Hamming(8,4), deterministic sparse-XOR fountain encoder/decoder, file metadata, SHA-256 integration, optical frame renderer, marker calibration, homography sampling, confidence diagnostics, and golden vectors. Keep the reference implementation dependency-light and usable in Node and browsers.

Done when the core tests prove exact reconstruction under order changes, duplicates, frame loss, single-bit cell errors, CRC failures and SHA-256 mismatch, and when the frame renderer/decoder round-trips generated RGBA frames.

