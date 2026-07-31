# Camsend

Offline optical file transfer between screens and cameras. The browser and Android endpoints use the same packet grammar, profile-specific inner protection, deterministic fountain recovery, marker geometry, calibration strip, and SHA-256 verification.

## Current build

- Offline web/PWA endpoint: `web/`
- Shared codec and optical renderer: `src/core/`
- Deterministic simulator and benchmark: `simulator/`
- Experimental high-speed glyph profiles: `glyph4` (tolerant) and `glyph6` (stationary/high-density)
- Native Android shell with camera permission, fullscreen, keep-awake/brightness controls, and native file saving: `android/`
- Debug APK after the Android build: `artifacts/camsend-debug.apk`

The Android endpoint packages the offline web endpoint inside a native application. This keeps the protocol and decoder identical across platforms while allowing Android to own permissions, display behavior, and Storage Access Framework file saving.

## Run the website

```powershell
npm install
npm run build:web
npm run serve
```

Open `http://localhost:4173/web/` in a secure browser context or serve the `web/` directory over HTTPS when using a real camera. Select Send or Receive. Files remain local; the optical path is the only transfer channel.

## Test and benchmark

```powershell
npm test
npm run benchmark
npm run benchmark:matrix
node simulator/high-speed-benchmark.mjs
```

The benchmark reports raw optical bitrate, nominal encoded-payload bitrate, recovered encoded-payload bitrate, and verified original-file goodput separately. Bitrate fields are explicitly labelled in bits/s; byte-rate fields use bytes/s. For reference, 190 kb/s is only 23.75 kB/s decimal, and the original dense baseline measures 24,000–26,667 bytes/s (192–213 kb/s). The high-speed glyph6 candidate reaches 136,364 verified bytes/s at 30 nominal fps and 272,727 verified bytes/s at 60 nominal fps on the deterministic 100 KB fixture with 8% frame loss and 5% duplicates. Those are simulator results for a geometry-neutral stationary fixture, not physical-device claims. The [Decimen optical-transfer PoC](https://github.com/bashalarmistalt/decimen-optical-transfer) reports 129.2 KiB/s in its README screenshot and approximately 128–186 KiB/s in its parent experiment, so that is the comparison floor—not a ceiling. The checked-in baseline is [benchmarks/baseline-2026-07-31.json](benchmarks/baseline-2026-07-31.json). The current VM has no physical camera/display.

`npm run benchmark:matrix` runs a bounded 3 KB/8-frame smoke matrix for the retained profiles through seeded clean, geometry/exposure, blur/defocus, glare/shadow/quantization, rolling-shutter, and partial-obstruction fixtures. Its JSON is a privacy-safe stress report: it includes frame/rejection reasons, confidence, erasures, recovery rank, and verification results, but never payload bytes, file contents, or raw frames. Decoder CPU time is reported for tuning but is not part of deterministic result comparisons; larger runs can call the exported `runImpairmentMatrix` function with explicit limits.

## Build the Android APK

Install a JDK 17+ and Android SDK command-line tools. Required packages are API 36 and build-tools 35.0.0. Then run from `android/`:

```powershell
$env:ANDROID_SDK_ROOT = 'C:\path\to\Android\Sdk'
& 'C:\path\to\gradle\bin\gradle.bat' assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The build task copies the already-built offline web assets into the APK; no backend or network is needed at runtime.

## Design and evidence

- [Version-one specification](docs/specification.md)
- [Research synthesis](docs/research/RESEARCH-SYNTHESIS.md)
- [Protocol ADR](docs/adr/0001-version-one-optical-protocol.md)
- [Wayfinder map](docs/wayfinding/optical-file-transfer-map.md)
- [Diagnostic export and hardware-test workflow](docs/tickets/05-diagnostics-and-device-fixtures.md)

The compatibility path remains a calibrated grayscale tile stream: a robust four-level profile and a dense sixteen-level profile. The measured high-speed path adds a 4×4 binary glyph alphabet, 6-bit symbols, phase search, RS(255,239), and the same fountain/file verification layer. Four saturated corner markers carry geometry only. A transfer is successful only after exact length and SHA-256 verification. The Android artifact currently packages this shared web decoder in a native shell; native CameraX/GPU decoding remains an explicit next milestone rather than an unstated capability.

