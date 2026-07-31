# Platform API findings

The web endpoint can request camera video with `getUserMedia`, enumerate devices after permission, inspect actual settings/capabilities, and apply constraints. The browser may crop/downscale or reduce frame rate when constraints cannot be met, and camera access requires a secure context. [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints), [ImageCapture](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Image_Capture_API)

The web implementation therefore has a Canvas/ImageData reference path, a worker boundary for frame analysis, and optional WebAssembly/SIMD/WebGPU accelerators. It never assumes a particular camera format or FPS.

Android CameraX `ImageAnalysis` gives CPU-accessible frames and supports `STRATEGY_KEEP_ONLY_LATEST`, which is appropriate for low-latency optical decoding; Camera2 exposes AE lock and related controls for a native stationary mode. [CameraX analysis](https://developer.android.com/media/camera/camerax/analyze), [CameraX API](https://developer.android.com/reference/androidx/camera/core/ImageAnalysis), [Camera2 CaptureRequest](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest)

The shared boundary is a language-neutral frame grammar plus golden vectors. V1 contains a TypeScript reference core and a Kotlin adapter/reference implementation; any future Rust/WASM/native core must pass the same vectors.

