# Colour, blur, glare, and hardware impairment model

Research for Wayfinder ticket #7, “Colour, blur, glare, and hardware impairment model”.

## Decision summary

For Version 1, treat the display-camera path as a measured, time-varying image channel rather than as a binary symmetric channel. The receiver should:

- localize and rectify the display before sampling cells;
- work in linear-light values where averaging or differencing is performed, while retaining the declared colour primaries, transfer function, matrix coefficients, and range;
- estimate each frame/tile from repeated black/white or low/high reference cells, using robust medians and soft confidence rather than a single global threshold;
- mark clipped, occluded, geometrically weak, mixed, or low-contrast cells as erasures;
- use large enough symbols that the measured optical point-spread function (PSF) is a small fraction of a cell;
- use cross-frame interleaving and systematic rateless/erasure parity, increasing parity when confidence or erasure rate worsens; and
- verify the original file hash after decoding. A decoded packet stream without a verified file is not successful goodput.

Do not make high-order RGB/CSK the V1 default. White balance, camera colour correction, display gamut, gamma/transfer functions, clipping, and codec chroma processing make absolute colour a less stable observable than locally normalized luminance. Colour can be retained as an optional diversity mode after calibration. The standard OCC family is relevant context—IEEE 802.15.7a-2024 explicitly targets higher-rate, longer-range optical camera communication—but Wayfinder’s screen-to-camera link still needs to model ordinary display and phone-camera pipelines rather than assume a compliant OCC receiver ([IEEE 802.15.7a-2024](https://standards.ieee.org/ieee/802.15.7a/10367/)).

## What the primary evidence says

| Impairment | Channel effect | Mitigation with direct evidence | V1 interpretation |
|---|---|---|---|
| Motion blur and hand shake | Exposure integrates a moving, projected image; high spatial frequencies are attenuated and cell boundaries mix. | PixNet moves information into spatial frequencies, suppresses badly attenuated frequencies, and assigns more redundancy to moderately affected frequencies. It reported up to 12 Mb/s at 10 m and 8 Mb/s at a 120° view angle ([paper](https://groups.csail.mit.edu/netmit/wordpress/wp-content/themes/netmit/papers/full_paper5_pixnet.pdf)). HiLight measured a small accuracy loss at 30 cm but increasing loss with distance and hand motion ([paper](https://cse.buffalo.edu/~wenyaoxu/courses/fall2015/papers/Camera_Mobisys15.pdf)). | Model motion as a line or measured trajectory PSF. Prefer symbol enlargement, low spatial frequencies, tracking/rectification, repetition, and soft decoding. Do not assume deblurring will improve goodput; uncalibrated sharpening raises noise and ringing. |
| Defocus | A spatially local blur/low-pass filter blends neighbouring symbols. | PixNet’s blur-adaptive frequency selection; DisCo’s temporally modulated signal remains recoverable under defocus because the signal is separated from the display texture ([paper](https://cave.cs.columbia.edu/old/publications/pdfs/Jo_TOG16.pdf)). | Sweep Gaussian/defocus PSFs in display-cell units. Increase cell size or use a temporal/frequency mode when the estimated blur consumes the cell margin. |
| Glare, flare, and saturation | Additive veil/stray light raises local background; specular glare and overexposure flatten one or more channels at the sensor ceiling. | DisCo separates a temporally modulated component from the display texture using two exposures; Android Camera2 exposes AE, exposure-time, sensitivity, and frame-duration controls, but automatic AE can override application-selected values ([Android CameraMetadata](https://developer.android.com/reference/android/hardware/camera2/CameraMetadata)). | Model a spatially varying additive veil plus clipping. Prefer shorter/fixed exposure when possible, lower modulation near saturation, and ignore clipped/reference-invalid cells. Treat saturated regions as erasures, not as “bright ones”. |
| Shadows and partial obstruction | A spatial mask removes the direct display signal or mixes it with another surface; boundaries are partial-opacity mixtures. | DisCo repeats a signal and chooses a message length coprime with the number of symbols per camera interval, so an occluded location sees different symbols over successive frames; it reports graceful degradation under occlusion ([paper](https://cave.cs.columbia.edu/old/publications/pdfs/Jo_TOG16.pdf)). | Model both contiguous and moving masks. Use spatially repeated pilots/locators and temporal interleaving; recover missing cells as erasures. Do not require the whole display to be visible. |
| Moiré and aliasing | Display and camera sampling grids create periodic high-frequency interference that blurs or corrupts cell recognition. | ChromaCode identifies moiré as high-frequency noise and reports that Gaussian smoothing attenuates it effectively ([paper](https://cswu.me/papers/mobicom18_chromacode_paper.pdf)). | Estimate high-frequency energy after rectification. Apply a controlled low-pass filter before cell pooling, then sweep filter width with cell size; filtering before rectification can make the alias pattern geometry-dependent. |
| Exposure and white balance | AE changes exposure and may cause clipping; AWB changes channel gains and colour transform across frames. | Android Camera2 documents that AE can override exposure time, sensitivity, and frame duration, and that AWB can override colour gains/transform; it recommends locking or disabling AWB/AF for consistent manual AE ([CaptureRequest](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest)). ChromaCode uses reference black/white cells and median lightness normalization plus soft decoding ([paper](https://cswu.me/papers/mobicom18_chromacode_paper.pdf)). | Prefer locked AE/AWB/AF capture. When unavailable, log their state and normalize per frame/tile from reference cells. Never use raw RGB thresholds across cameras. |
| Colour-space distortion | Display primaries/transfer curve, camera gains/3×3 transform, demosaic, and YUV conversion change channel coordinates; clipping is nonlinear. | ChromaCode’s CIELAB/ΔE00 embedding improves imperceptibility and its best data-rate/BER result among the tested spaces; this is evidence for perceptual embedding, not proof that Lab is the best noisy-channel coordinate. Android documents the Bayer gains plus 3×3 transform in the colour-correction pipeline ([paper](https://cswu.me/papers/mobicom18_chromacode_paper.pdf), [Android colour correction](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest)). | Define the simulator in linear-light RGB, then apply display/camera colour transforms and transfer functions. Decode normalized luminance first; add complementary colour only as an experimentally gated mode. |
| Sensor/read noise and low light | Photon-counting noise grows with signal; read/dark/quantization noise remains when signal is low. | EMVA 1288 provides a first-party camera characterization model and measurement procedure for sensitivity, noise, saturation, dark current, spatial nonuniformity, and defective pixels ([EMVA 1288 General 4.0](https://www.emva.org/wp-content/uploads/EMVA1288General_4.0Release.pdf)). HiLight reports stability above 40 lux after adapting sensitivity and filtering noise ([paper](https://cse.buffalo.edu/~wenyaoxu/courses/fall2015/papers/Camera_Mobisys15.pdf)). | Use Poisson shot noise plus Gaussian read noise, gain, dark offset, quantization, and saturation. Calibrate from a flat-field/dark sequence when possible; otherwise expose SNR as a sweep variable. Pool multiple pixels/cells and retain soft values. |
| Compression and block artefacts | JPEG/video quantization, block boundaries, chroma subsampling, and resampling perturb fine spatial patterns and frame-to-frame amplitudes. | HiLight encodes relative temporal intensity changes and reports robustness to block-boundary effects from video compression; ChromaCode’s implementation uses FFmpeg compression and Android MediaCodec/OpenCV in its end-to-end path ([HiLight paper](https://cse.buffalo.edu/~wenyaoxu/courses/fall2015/papers/Camera_Mobisys15.pdf), [ChromaCode paper](https://cswu.me/papers/mobicom18_chromacode_paper.pdf)). | Model the actual codec/quality and chroma mode in the fixture. Prefer low-frequency spatial cells or relative temporal modulation. Benchmark lossless and lossy paths separately; do not silently compare decoded PNG frames with camera JPEG frames. |
| Mixed consecutive display frames | If display refresh and camera capture are asynchronous, one exposure can integrate two display frames; rolling shutter can integrate different frame mixtures by row. | LightSync uses in-frame colour tracking and a linear erasure code across frames, more than doubling average throughput over the prior approach and working when receive rate is at least half the transmit rate ([ACM DOI](https://doi.org/10.1145/2500423.2500437)). RescQR separates composite frames with a dedicated border and uses Viterbi inference for blurred regions; its prototype reports 400+ kb/s goodput with standard QR codes ([paper](https://hhannuaa.gitlab.io/papers/tmc2024_hhan.pdf), [IEEE DOI](https://doi.org/10.1109/TMC.2023.3277212)). | Make temporal integration a first-class channel stage. Include display/camera phase, refresh, exposure, frame duration, row time, display response, drops, duplicates, and frame IDs. Recover mixed frames where confidence permits; otherwise convert them to erasures. |

The evidence also shows an important rate/robustness crossover. ChromaCode’s measured goodput increased as cells became smaller until recognition failed; its 8×7-cell setting produced about 137 kb/s goodput, while 6×6 dropped to about 58 kb/s. Its recommended texture scaling factor was `k ∈ [0.4, 0.7]`. Stronger concatenated coding lowered BER but consumed more channel capacity; its default trade-off was convolutional `(3,1,5)` plus RS `(30,11)` ([results](https://cswu.me/papers/mobicom18_chromacode_paper.pdf)). These are useful fixture points, not universal Wayfinder defaults.

SoftLight is the clearest evidence for adaptive redundancy: it exposes a confidence hint per demodulated bit, treats uncertain bits as an erasure channel, and uses low-complexity rateless coding. Its Android prototype transferred a 22-KB photo in 0.6 s and improved average goodput by 2.2× ([author’s publication page](https://jansencl.github.io/publication/2016-04-07_TMC-2016), [IEEE DOI](https://doi.org/10.1109/TMC.2016.2551750)). V1 should therefore adapt parity to confidence/erasures, not merely retransmit a fixed number of identical frames.

## Reproducible simulator

Use a deterministic pipeline with a named seed and record the intermediate image at every stage:

1. **Logical transmitter.** Render the packet/frame into a linear-light display raster. Include a version, frame/segment sequence, packet sequence, mode, code profile, dimensions, and repeated reference cells. Keep the pilot/reference pattern outside the payload and repeat it in every tile or at least every robustly visible region.
2. **Display.** Apply pixel aperture/resampling, declared primaries and transfer function, luminance floor/ceiling, display gamma, refresh cadence, frame response time, and optional codec/compositor quantization. H.273’s colour primaries, transfer characteristics, matrix coefficients, range, and chroma-siting fields are the right metadata vocabulary for encoded video ([ITU-T H.273 (07/2024)](https://www.itu.int/dms_pubrec/itu-t/rec/h/T-REC-H.273-202407-I%21%21TOC-HTM-E.htm)).
3. **Geometry.** Apply projective homography, optional radial distortion, crop/FOV, scale, rotation, and translation. Rectify before measuring optical quality; OpenCV’s `warpPerspective` is a reproducible first-party implementation of the required 3×3 projective warp ([OpenCV geometric transforms](https://docs.opencv.org/4.13.0/da/d54/group__imgproc__transform.html)).
4. **Optics.** Apply, in this order, defocus PSF, motion PSF, glare/veil, shadow/occlusion mask, and optional moiré/alias sampling. Use measured PSFs when available. A simple V1 model is a Gaussian defocus kernel plus a line-segment motion kernel; use an elliptical or sampled trajectory kernel for rotation. OpenCV’s `GaussianBlur` documents the kernel-size and sigma parameters for a repeatable baseline ([OpenCV filtering](https://docs.opencv.org/master/d4/d86/group__imgproc__filter.html)).
5. **Temporal camera.** Integrate the display signal over exposure time with a random or fixed phase offset. For a rolling shutter, assign each row its own start time and exposure. The camera sample is therefore a weighted sum of all display states intersecting that interval, not necessarily one display frame.
6. **Sensor and image pipeline.** Apply exposure and ISO/gain, per-channel white-balance gains, a 3×3 colour matrix, black level, shot noise, read/dark noise, quantization, saturation, demosaic/resampling, sharpening/noise reduction if known, and JPEG/video encoding. The Android Camera2 and EMVA references above define what should be logged or calibrated; avoid pretending that a phone’s compressed RGB output is raw linear sensor data.
7. **Receiver.** Detect the display border/pilots, estimate the homography, rectify, apply the selected low-pass filter, compute robust cell statistics, normalize against local references, produce a soft value/LLR and confidence, mark erasures, decode, deinterleave, and verify the packet/file hash.

### V1 parameter sweep

Every sweep point should be named and reproducible. Start with a clean baseline and vary one impairment at a time, then run a small factorial stress set. Recommended ranges are test-design ranges, not claims about all consumer hardware:

| Family | Baseline | Sweep |
|---|---:|---:|
| Display/camera cadence | 60 Hz display, 30/60 fps camera | 60/90/120 Hz × 24/30/60 fps; phase `U(0, 1/f_camera)`; frame drops/duplicates 0–5% |
| Exposure/rolling shutter | `T_exp = 0.25 T_frame`, global shutter | `0.05–1.0 T_frame`; row skew 0–1 frame; exposure phase sweep; display response 0–20 ms or measured |
| Motion | 0 display-cell widths during exposure | 0–2 cell widths/exposure, horizontal/vertical/diagonal/rotational paths |
| Defocus | σ = 0 | σ = 0.25, 0.5, 1, 2 camera pixels and a disk PSF; report in camera pixels and display-cell widths |
| Glare/exposure | no veil, no clipping | local veil 0–50% of signal, radius 1–20% of frame; exposure scale 0.25–4; record clipped-pixel fraction |
| Obstruction/shadow | none | contiguous masks 5/10/25/50% area; moving mask; multiplicative gain 0.1/0.3/0.7; partial-opacity boundary |
| Moiré/filter | no alias, σ = 0 | periodic energy at measured alias frequencies; Gaussian σ 0, 0.25, 0.5, 1 cell; filter before/after rectification comparison |
| Colour | identity transform, sRGB metadata | per-channel gains 0.7–1.5; matrix perturbation ±10%; transfer/gamut variants; 4:4:4 vs 4:2:0 |
| Noise | measured camera calibration | EMVA-derived parameters; otherwise SNR 10/20/30/40 dB, plus black-level/defect-pixel cases |
| Compression | lossless | JPEG/video quality 30/50/75/95; codec and chroma mode recorded; frame-rate conversion on/off |
| Symbol density | 8×7-cell fixture point | 6×6 through 26×17 cells or equivalent camera-pixel/cell ratios; select by verified goodput, not raw throughput |

The simulator must support replay from a captured fixture: the same logical frame sequence, seed, transform parameters, timing trace, and decoder configuration must reproduce the same output. For hardware calibration, capture flat bright, flat dark, alternating checkerboard, moving-edge, blur sweep, and colour-patch sequences with the camera metadata attached.

## Normalization and decoder recommendation

The default normalization should be a local differential reference, not global histogram equalization:

1. Convert camera values to the declared/estimated linear-light working space before averaging or subtracting. W3C’s colour specification distinguishes encoded sRGB from `srgb-linear` and defines CIE Lab/Oklab conversions ([CSS Color 4](https://www.w3.org/TR/css-color-4/)).
2. For each tile, estimate `R0` and `R1` as the medians of valid reference cells representing the two states. Exclude cells with clipping, low border confidence, excessive anchor dispersion, or suspected obstruction.
3. For a cell statistic `d`, compute `z = clip((d - R0) / (R1 - R0 + ε), 0, 1)`. Preserve `z`, the denominator, and the anchor residual as decoder evidence. A value near 0.5 is low-confidence; it must not be rounded and forgotten.
4. Convert confidence into an erasure/soft-input weight using anchor separation, within-cell variance, saturation fraction, local blur estimate, and geometric residual. Keep a hard decision only for diagnostics.
5. Use a small spatial median/mean pool inside each cell. Apply Gaussian low-pass only when the moiré diagnostic justifies it; do not use CLAHE as an unvalidated default because it changes local amplitudes and can amplify noise in small tiles. OpenCV provides CLAHE, but its presence is an implementation option, not evidence of BER improvement ([CLAHE API](https://docs.opencv.org/4.10.0/d6/db6/classcv_1_1CLAHE.html)).

If the display content is arbitrary and the payload is embedded into it, use temporal differencing or complementary modulation with a pilot baseline. If the display is dedicated to transfer, two luminance states with generous margins are preferable. Use CIELAB/ΔE00 only for a human-invisibility budget or colour-embedding experiment; ChromaCode’s result supports that use, but its measured gains do not establish Lab as the best receiver space under arbitrary phone-camera colour pipelines.

## Adaptive redundancy for Version 1

Use three transmitter profiles selected by the receiver’s initial diagnostics or by feedback:

- **Fast:** large confidence margin, low blur/occlusion, systematic payload plus approximately 10% parity.
- **Balanced:** ordinary handheld use, interleaving across 4–8 frames, approximately 25% parity, repeated pilots and frame IDs.
- **Hostile:** low contrast, clipping, mixed frames, or high erasure rate; smaller payload cells per frame, approximately 50% parity, longer interleaving, and more spatially separated repetitions.

The exact percentages should be tuned by the simulator’s verified-goodput curve. The invariant design is more important: send systematic data first, expose per-symbol confidence, add parity across time and spatial regions, and stop when the receiver verifies the file. If no return channel exists, transmit a progressive parity schedule and include a profile hint in every frame. If feedback exists, increase parity and/or symbol size when erasure rate, anchor separation, or frame-mix rate crosses a threshold.

Use spatial redundancy for obstruction and low-frequency robustness, temporal redundancy for motion/mixed frames, and parity rather than identical repetition whenever the error map shows burst erasures. LightSync, DisCo, SoftLight, ChromaCode, and RescQR support this division of labour. A generic “more FEC” knob is insufficient: ChromaCode measured lower BER but lower goodput at stronger codes, while SoftLight’s confidence-aware rateless approach improved goodput by adapting to the link.

## Diagnostic export

Export one machine-readable record per capture run and one per decoded frame/packet. At minimum include:

```json
{
  "run_id": "...", "seed": 123, "config_hash": "...",
  "source_sha256": "...", "display": {"size": [1920,1080], "refresh_hz": 60, "transfer": "sRGB"},
  "camera": {"size": [1920,1080], "fps": 30, "exposure_us": 8333, "iso": 400,
             "rolling_shutter": true, "row_time_us": 12.5, "ae": "locked", "awb": "locked", "af": "locked"},
  "channel": {"homography_rmse_px": 0.7, "motion_px_per_exposure": 1.2, "defocus_sigma_px": 0.8,
              "glare_fraction": 0.04, "occlusion_fraction": 0.12, "moiré_ratio": 0.09,
              "saturation_fraction": 0.01, "snr_db": 24.0, "mixed_frame": true},
  "decode": {"raw_bits": 4096, "erasures": 311, "ber_pre_fec": 0.08,
             "ber_post_fec": 0.0, "fec_profile": "balanced", "verified": true,
             "bytes_verified": 1024, "elapsed_s": 0.42, "goodput_bps": 19505}
}
```

Also export diagnostic PNGs (or lossless images) for: rectified frame, reference-cell map, normalized-value heatmap, confidence/erasure map, clipped-pixel mask, blur/edge estimate, moiré spectrum/ratio, decoded symbol overlay, and frame-sequence/timing plot. Keep the original captured frames or a content-addressed sample set so a failed decode can be replayed.

Report these separately:

- raw optical throughput;
- pre-FEC BER and erasure rate;
- post-FEC packet success;
- verified original-file goodput (`verified bytes / wall-clock seconds`);
- frame-mix, drop, duplicate, and retry counts;
- decoder latency and energy if measured; and
- the impairment parameters and camera/display metadata that produced the result.

The V1 acceptance gate should be a verified-file goodput curve over the impairment matrix, with no silent clipping of failed runs. Retain a mitigation only when it improves verified goodput or the required success probability at a fixed viewing/compute budget, and when the improvement survives at least two camera/display classes.

## Sources

- Perli, Ahmed, Katabi, “PixNet: Interference-Free Wireless Links Using LCD-Camera Pairs,” MobiCom 2010. [MIT-hosted paper](https://groups.csail.mit.edu/netmit/wordpress/wp-content/themes/netmit/papers/full_paper5_pixnet.pdf).
- Hu, Gu, Pu, “LightSync: Unsynchronized Visual Communication over Screen-Camera Links,” MobiCom 2013. [ACM DOI](https://doi.org/10.1145/2500423.2500437).
- Jo et al., “DisCo: Display-Camera Communication Using Rolling Shutter Sensors,” ACM Transactions on Graphics 2016. [Author-hosted paper](https://cave.cs.columbia.edu/old/publications/pdfs/Jo_TOG16.pdf).
- Zhang et al., “ChromaCode: A Fully Imperceptible Screen-Camera Communication System,” MobiCom 2018 / TMC 2021. [Paper](https://cswu.me/papers/mobicom18_chromacode_paper.pdf), [first-party project](https://walleve.github.io/ChromaCode/), [ACM DOI](https://doi.org/10.1145/3241539.3241543).
- Liando, Du, Li, “Soft Hint Enabled Adaptive Visible Light Communication over Screen-Camera Links,” IEEE TMC 2017. [Author page](https://jansencl.github.io/publication/2016-04-07_TMC-2016), [IEEE DOI](https://doi.org/10.1109/TMC.2016.2551750).
- Xu et al., “Real-Time Screen-Camera Communication,” MobiSys 2015 (HiLight). [Paper](https://cse.buffalo.edu/~wenyaoxu/courses/fall2015/papers/Camera_Mobisys15.pdf).
- Tran et al., “DeepLight: Robust & Unobtrusive Real-time Screen-Camera Communication for Real-World Displays,” IPSN 2021. [arXiv record](https://arxiv.org/abs/2105.05092).
- Han et al., “RescQR: Enabling Reliable Data Recovery in Screen-Camera Communication System,” IEEE TMC 2024. [Open author copy](https://hhannuaa.gitlab.io/papers/tmc2024_hhan.pdf), [IEEE DOI](https://doi.org/10.1109/TMC.2023.3277212).
- European Machine Vision Association, “EMVA Standard 1288, General 4.0 Release,” 2021. [Official standard](https://www.emva.org/wp-content/uploads/EMVA1288General_4.0Release.pdf).
- Android Developers, Camera2 `CameraMetadata` and `CaptureRequest`. [Official API](https://developer.android.com/reference/android/hardware/camera2/CameraMetadata), [official API](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest).
- ITU-T H.273 (07/2024), “Coding-independent code points for video signal type identification.” [Official recommendation](https://www.itu.int/dms_pubrec/itu-t/rec/h/T-REC-H.273-202407-I%21%21TOC-HTM-E.htm).
- W3C, “CSS Color Module Level 4.” [Official specification](https://www.w3.org/TR/css-color-4/).
- OpenCV, geometric transforms, filtering, and CLAHE. [Official documentation](https://docs.opencv.org/4.13.0/da/d54/group__imgproc__transform.html), [filtering](https://docs.opencv.org/master/d4/d86/group__imgproc__filter.html), [CLAHE](https://docs.opencv.org/4.10.0/d6/db6/classcv_1_1CLAHE.html).
- IEEE, “802.15.7a-2024: Higher Rate, Longer Range Optical Camera Communication.” [Official standard page](https://standards.ieee.org/ieee/802.15.7a/10367/).
