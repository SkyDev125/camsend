# Tracking research for Wayfinder

Research date: 2026-07-31. Scope: screen-camera marker layout, planar homography, continuous tracking, calibration, local cell sampling, partial obstruction, confidence, and a lightweight browser-to-Android receiver loop. The repository has no `CONTEXT.md`; the relevant accepted decision is [ADR-0001](../adr/0001-version-one-optical-protocol.md), which already specifies four saturated corner fiducials, a projective homography, a per-frame grayscale calibration strip, calibrated luminance cells, and a low-cost reference path.

## Recommendation

Keep the Version 1 geometry deliberately small:

1. Put four large, unique, saturated corner fiducials just outside the payload grid, in a fixed cyclic order. Give each fiducial a dark center/core so its center can be found from a luminance/edge cue even when color response varies. The ordered colors remove the 90-degree rotation ambiguity; the core and surrounding color make false detections less likely.
2. Keep a narrow, persistent calibration/header strip inside the quadrilateral. It should repeat low/high (and, for dense mode, intermediate) luminance references plus the stream/frame identity. A future robustness profile may add one interior locator rail, but Version 1 should not require a full internal fiducial lattice.
3. On a newly acquired frame, estimate the screen-to-image homography from the four corner centers. On a locked frame, track those centers and update the homography; periodically reacquire all four markers or reacquire immediately when quality falls.
4. Do not warp the complete camera image for the reference path. Map each logical cell center through the homography and read a small interior patch. Emit a cell value plus confidence; emit an erasure when geometry, photometry, or temporal consistency is weak.
5. Treat payload obstruction as localized loss. Treat marker/strip obstruction as loss of geometry or frame identity. Do not calculate a new general homography from only three visible corners; hold the last validated transform briefly, then reacquire.

This is an engineering synthesis from the sources below. The exact marker size, patch radius, confidence threshold, reacquisition interval, and logical frame cadence must be measured on the target display/Android devices.

## What the primary sources say

### Marker layouts

COBRA uses four colored corner trackers, each a large colored square with a small black square at its center. The four colors are arranged as a distinctive clockwise pattern so the barcode is identifiable regardless of image orientation. It also places alternating black/white tracking bits along the four sides; their line intersections locate code blocks. The receiver searches around the previous frame's corner positions to accelerate the next detection. [COBRA design and receiver algorithm](https://pages.cs.wisc.edu/~anant/docs/visible-light-communication.pdf), pp. 2–3.

RainBar is a stronger precedent for a moving, distorted screen-camera link. It uses corner trackers, persistent tracking bars, and code locators. Its experiments found that two corner trackers plus in-frame locators can be sufficient for corner localization, and it adds three locator columns so the left and right halves of the payload are interpolated from nearby anchors. Its stated observation is important for Wayfinder: a captured image can be globally distorted while each local region remains close to affine/linear, so local anchors can outperform one global interpolation. [RainBar](https://doi.org/10.1109/ICDCS.2015.61), [author-hosted full text](https://www.researchgate.net/publication/283877651_Rain_Bar_Robust_Application-Driven_Visual_Communication_Using_Color_Barcodes).

Recommendation: retain four outer fiducials because they make the Version 1 geometry explicit and diagnosable. Use the calibration strip as the first interior reference. Add a center rail or three locator columns only if measured reprojection error or local sampling drift shows that the four-corner homography is insufficient. Interior locators cost payload but provide a useful fallback against lens distortion, curved/blurred edges, and local obstruction.

### Homography and calibration

The display is planar, so its logical coordinates and camera-image coordinates are related by a 2-D projective transform. Four non-collinear point correspondences are the minimum for a general homography; additional correspondences are useful for residual checks and robust fitting. The screen-camera capacity study explicitly models distance, angle, block size, perspective distortion, blur, and camera quantization rather than treating every screen cell as equally sampled. [Ashok et al., *Capacity of screen-camera communications under perspective distortions*](https://www.winlab.rutgers.edu/~shubhamj/papers/shubham_pmc.pdf).

Use the following acceptance checks after every full marker solve:

- corner order is cyclic and the projected quadrilateral is convex;
- signed area is positive and above a minimum fraction of the camera image;
- no edge is implausibly short or crossed;
- forward projection of the known logical corners has low reprojection residual;
- the homography is not near-singular over the payload ROI;
- the calibration-strip reference levels are separated and not clipped.

If more than four trusted points exist, fit with a robust estimator and retain the inlier mask. OpenCV's documented homography API describes the RANSAC/LMeDS/RHO approach as repeatedly estimating from four-point subsets and scoring inliers/reprojection quality. [OpenCV `findHomography` documentation](https://docs.opencv.org/3.3.1/d9/d0c/group__calib3d.html).

Full metric camera calibration is not required for the first link: a per-session planar homography absorbs the dominant screen pose. It is still useful to undistort the camera when device intrinsics are available, because radial distortion makes one homography less accurate near the image edges. Zhang's planar calibration method needs a known planar pattern viewed at multiple orientations, models radial distortion, and refines the solution by maximum likelihood. That is suitable for a device test/calibration tool, not for a user-facing transfer prerequisite. [Zhang, *A flexible new technique for camera calibration*](https://www-users.cse.umn.edu/~hspark/CSci5980/zhang.pdf).

### Continuous tracking

The inexpensive locked path should track the four fiducial cores/edges between full detections. Tomasi–Kanade derives the Lucas–Kanade tracker as a small-window intensity-registration problem and selects features using the minimum eigenvalue of the local gradient structure; the report also discusses detecting occlusion. The method is appropriate here because the four targets are known, sparse, and expected to move only a small amount between camera frames. [Tomasi and Kanade, CMU-CS-91-132](https://helios2.mi.parisdescartes.fr/~lomn/Cours/CV/SeqVideo/Articles/tomasi-kanade-techreport-1991.pdf).

COBRA provides a simpler screen-camera-specific optimization: search concentric squares around each previous corner because at high capture rates the corner displacement is small. Use that as the fallback if a full pyramidal tracker is too expensive. [COBRA](https://pages.cs.wisc.edu/~anant/docs/visible-light-communication.pdf), pp. 2–3.

Recommended state machine:

| State | Work | Acceptance rule |
| --- | --- | --- |
| `SEARCH` | Downsampled scan for the four marker colors/cores; test all plausible cyclic orders. | Enter `LOCKED` only with four valid correspondences and a passing homography/strip check. |
| `LOCKED` | Track four centers in a small window; update `H`; sample cells and persistent fields. | Keep lock only while tracker residual, quadrilateral shape, calibration separation, and frame/header checks pass. |
| `GRACE` | Reuse the last validated `H` for a short bounded interval; mark suspect cells/rows as erasures. | Return to `LOCKED` if reacquisition or tracking succeeds; otherwise return to `SEARCH`. |

Use a small robust temporal smoother only after validation. Smoothing must not make a bad marker look valid or smear a fast camera movement into the next frame. A forward/backward tracking residual or a patch match score is a better lock signal than position smoothing alone. Reacquisition should be periodic even during a good lock, and immediate on a large residual, marker-color failure, implausible homography, or calibration collapse.

### Photometric calibration and local cell sampling

The calibration strip should provide per-frame reference observations, not just a one-time screen calibration. For grayscale cells, normalize a sample against the observed low/high reference levels and classify against the calibrated level set. If the observed span is too small, either exposure is saturated or the screen is not being resolved; mark cells as erased.

RainBar uses HSV because hue and saturation are more stable than RGB value under changing illumination for its red/green/blue/white/black palette. Its classifier explicitly separates black by value, white by low saturation, and chromatic values by hue. This supports using saturated colors for geometry while keeping payload luminance-only as required by ADR-0001. [RainBar HSV extraction](https://www.researchgate.net/publication/283877651_Rain_Bar_Robust_Application-Driven_Visual_Communication_Using_Color_Barcodes), pp. 543–544.

Sample the interior, not the cell boundary. For each logical cell, project its center and a small cross or 3×3/5×5 patch through the current homography. Aggregate with a median or trimmed mean; reject samples with high within-patch variance, clipping, or a projected patch that approaches a neighboring cell. Bilinear interpolation of projected block coordinates is a documented COBRA approach, while RainBar reports that adjacent local block centers are nearly collinear even when the whole image is badly distorted. [COBRA](https://pages.cs.wisc.edu/~anant/docs/visible-light-communication.pdf), p. 3; [RainBar](https://www.researchgate.net/publication/283877651_Rain_Bar_Robust_Application-Driven_Visual_Communication_Using_Color_Barcodes), pp. 542–543.

Keep three independent confidence components:

- **Geometry:** homography reprojection residual, local projected cell area/shape, distance from the cell boundary, and tracker residual.
- **Photometry:** distance to the nearest calibrated luminance level (or hue/saturation class), normalized by the calibration span; patch agreement and non-clipping.
- **Temporal/frame integrity:** header/CRC validity, persistent-field agreement, and whether rolling-shutter tracking indicates a mixed row/band.

Use the weakest component as the cell/frame confidence, or combine calibrated components conservatively. Do not turn a low-margin cell into a hard symbol merely because its nearest level wins. SoftLight is the clearest primary precedent: it derives a soft hint for each demodulated bit, discards low-confidence bits as erasures, and uses lightweight coding that tolerates a small false-positive rate. It also reports strong spatially varying BER within one frame, which argues for interleaving cells across payload positions. [SoftLight](https://www3.ntu.edu.sg/home/limo/papers/INFOCOM16-SoftLight.pdf), pp. 1, 3–5.

### Partial obstruction and mixed captures

There are three different failures and they should not share one recovery rule:

1. **Payload-cell obstruction:** keep the homography and erase only the affected cells. Cross-frame repair can recover them if the protocol has enough independent symbols.
2. **Marker or calibration-strip obstruction:** do not update geometry or photometric levels from the suspect observation. Hold the last validated state briefly, then reacquire. Four corners are a deliberate V1 requirement; three corners do not define a trustworthy general projective mapping.
3. **Rolling-shutter/mixed frame:** preserve only rows or bands whose persistent tracking field identifies a single display state; erase ambiguous bands. RainBar places tracking bars on all four borders and uses their sequence-coded colors to distinguish adjacent partial frames line by line. [RainBar tracking bars](https://www.researchgate.net/publication/283877651_Rain_Bar_Robust_Application-Driven_Visual_Communication_Using_Color_Barcodes), pp. 540–541.

AprilTag is useful evidence for the general marker principle: a deliberately coded fiducial can be detected/localized at low resolution and its quad extraction is designed to handle significant occlusion, warping, and lens distortion. It is not a reason to replace Wayfinder's four colored corner markers with a full AprilTag detector; it supports keeping marker identity, geometry, and occlusion checks explicit. [Olson, *AprilTag*](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf).

The V1 behavior should be conservative: never emit a frame because its geometry was merely predicted, and never use a bad frame to move the tracker. A partial payload can be useful; a partial locator is evidence of uncertainty.

## Lightweight browser + Android loop

### Browser sender

1. Render the complete logical frame to one canvas: four corner markers, border/header, calibration strip, payload cells, and a sequence/generation identity. Keep those fields in every frame; do not rely on a one-shot preamble.
2. Advance logical frames from a `requestAnimationFrame()` loop using its timestamp. `requestAnimationFrame()` is one-shot, generally follows display refresh, and is paused in hidden tabs, so hold a logical frame for a time interval and do not treat callback count as a display clock. [MDN `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame); [WHATWG animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html).
3. Require a visible page and request a screen wake lock where supported. Reacquire it after visibility returns. [Screen Wake Lock API](https://www.w3.org/TR/screen-wake-lock/).
4. Start conservatively around 10–15 logical frames/s, holding each state across several display refreshes. Measure actual capture/decode goodput before enabling a faster profile. This is a starting profile, not a device-independent guarantee.
5. Loop the coded sequence or fountain/repair stream. There is no assumed receiver feedback channel, so duplicates must be harmless and sequence identity must be present in every frame.

### Android receiver

1. Use one modest-resolution `YUV_420_888` analysis stream; convert/downsample only the pixels needed for marker search and cell patches. Android documents `YUV_420_888` with `ImageReader` as the direct application-processing path.
2. In real-time mode, call `ImageReader.acquireLatestImage()` and close every acquired image. Android explicitly recommends this mode for processing that must catch up to the newest image; using `acquireNextImage()` can accumulate delay and eventually stall.
3. Search/tracking and sampling should run on a worker thread with bounded memory. The hot path is: latest image → marker track/search → homography checks → strip normalization → local cell patches → confidence/CRC/FEC.
4. Record `CaptureResult.SENSOR_TIMESTAMP`, `SENSOR_EXPOSURE_TIME`, `SENSOR_FRAME_DURATION`, and `SENSOR_ROLLING_SHUTTER_SKEW` when present. The Android API defines timestamp as first-row exposure start, exposure time per pixel, frame duration between readouts, and rolling-shutter skew across sensor rows. These values are diagnostics and aid mixed-row classification; they are not sender frame IDs. [Android `CaptureResult`](https://developer.android.com/reference/android/hardware/camera2/CaptureResult).
5. Let auto-exposure converge. If the device supports manual control, an optional stable mode can set `CONTROL_AE_MODE_OFF` and use measured/requested exposure and frame duration; Android documents that AE-enabled modes override application-selected exposure time, sensitivity, and frame duration. Otherwise retain auto exposure and rely on the strip plus confidence/erasure path. [Android `CaptureRequest`](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest).
6. Deduplicate by the embedded transmitter sequence/generation identity, not by Android frame number. Stop only after the exact byte length and final SHA-256 verify; surface diagnostics such as lock state, homography residual, calibration span, valid-cell ratio, erasure reason, and reacquisition count.

## Evidence gates for implementation

Before increasing payload density, measure a matrix of camera/display pairs and deliberately vary distance, angle, focus, exposure, motion, partial payload cover, one-marker cover, and screen-edge crop. Retain these gates:

- four-corner lock must reject false color/order matches;
- homography residual and calibration span must predict cell error rate;
- a covered payload region must produce erasures rather than confident wrong cells;
- a lost marker must trigger grace/reacquisition, not a silently drifting homography;
- confidence threshold changes must show the expected goodput/reliability tradeoff;
- mixed rolling-shutter rows must be classified as valid bands or erasures;
- final output must never be released without length and hash verification.

## Primary sources

- [ADR-0001: Visible calibrated tile stream with fountain recovery](../adr/0001-version-one-optical-protocol.md)
- [COBRA / Color Barcode Streaming for Smartphone Systems](https://pages.cs.wisc.edu/~anant/docs/visible-light-communication.pdf)
- [RainBar: Robust Application-driven Visual Communication using Color Barcodes](https://doi.org/10.1109/ICDCS.2015.61)
- [PixNet: Interference-Free Wireless Links Using LCD-Camera Pairs](https://people.csail.mit.edu/nabeel/pixnet-mobicom10.pdf)
- [Capacity of screen-camera communications under perspective distortions](https://www.winlab.rutgers.edu/~shubhamj/papers/shubham_pmc.pdf)
- [Tomasi–Kanade, Detection and Tracking of Point Features](https://helios2.mi.parisdescartes.fr/~lomn/Cours/CV/SeqVideo/Articles/tomasi-kanade-techreport-1991.pdf)
- [Zhang, A Flexible New Technique for Camera Calibration](https://www-users.cse.umn.edu/~hspark/CSci5980/zhang.pdf)
- [Olson, AprilTag: A Robust and Flexible Visual Fiducial System](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf)
- [SoftLight: Soft hint enabled adaptive visible light communication over screen-camera links](https://www3.ntu.edu.sg/home/limo/papers/INFOCOM16-SoftLight.pdf)
- [Android `CaptureResult`](https://developer.android.com/reference/android/hardware/camera2/CaptureResult), [`CaptureRequest`](https://developer.android.com/reference/android/hardware/camera2/CaptureRequest), [`ImageReader`](https://developer.android.com/reference/android/media/ImageReader), and [Camera2 package guidance](https://developer.android.com/reference/android/hardware/camera2/package-summary)
- [WHATWG animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html), [Screen Wake Lock](https://www.w3.org/TR/screen-wake-lock/)
