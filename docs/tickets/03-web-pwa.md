# Implement offline web/PWA endpoint

Part of #1.

Build a static offline website with send and receive modes, file selection, full-screen optical rendering, camera/device selection, preview, progress, verified goodput, error/frame-loss statistics, estimated remaining time, SHA-256 verification, received-file download, and diagnostic views for markers, calibration, sampled cells and confidence. Register a service worker and provide install metadata. Use a worker boundary for decoding and degrade gracefully when camera APIs or secure-context requirements are unavailable.

