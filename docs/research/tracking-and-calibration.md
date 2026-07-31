# Tracking, perspective, and calibration

Research for Wayfinder ticket #6, “Tracking, perspective, and calibration”. The goal is a moving, rotated, scaled, partially obstructed display that can be decoded from browser and Android camera frames.

## Recommendation

Use one known planar board coordinate system for the whole display. Put six or eight uniquely identified square fiducials in a wide, non-collinear layout around the data area: four near the display corners and the remainder at mid-edges or just inside the corners. Keep the tags in a reserved border/quiet-zone region, with the data cells inside the board. Use the same tag family, IDs, physical/logical coordinates, corner order, and canonical orientation on web and Android.

For Version 1, AprilTag 3 is the best fit if a small native C detector compiled to WebAssembly is acceptable: the first-party implementation is a small C library, exposes `hamming`, `decision_margin`, tag homography, and corner coordinates, and supports the standard and ArUco families. Its repository currently recommends `tagStandard41h12` for most applications. If the project already depends on OpenCV.js/OpenCV Android, an equivalent OpenCV ArUco `GridBoard` is a reasonable alternative; do not mix detector conventions between platforms without conformance tests. [AprilTag 3 implementation](https://github.com/AprilRobotics/apriltag), [AprilTag header/API](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.h), [OpenCV GridBoard](https://docs.opencv.org/4.6.0/db/da9/tutorial_aruco_board_detection.html)

The V1 loop should be:

1. Normalize the frame into one canonical pixel coordinate system, including camera rotation/mirroring and, where available, lens undistortion.
2. Run a full-frame fiducial detector to acquire the board. Fit the display-to-camera homography with RANSAC, then refit using all accepted correspondences.
3. While the board is healthy, track only fiducial corners or small fiducial-border patches with pyramidal Lucas–Kanade optical flow. Use the predicted homography to restrict the next detector pass to the board region, but periodically run full-frame detection as correction.
4. Map each logical cell center and its interior sub-samples through the inverse homography into the camera frame. Decode from luminance and retain local contrast/quality measurements.
5. Accept data only when marker, geometric, temporal, and photometric gates pass. On a gate failure, hold the last valid result briefly, then enter degraded mode and reacquire with a full-frame detector.

This deliberately avoids a pose filter, neural detector, dense optical flow, or full-frame perspective warp in V1. The screen is planar; a homography is the direct observable needed to locate cells.

## Fiducial layout

### Why a board, not one marker

A square marker supplies four corner correspondences and is theoretically sufficient to estimate a homography, but all four points occupy a small region. Extrapolating that homography over a large display magnifies corner noise and distortion. A board supplies redundant correspondences over the entire screen, lets RANSAC reject a bad marker, and keeps working when some tags are hidden.

Use a known board model:

```text
logical display plane, normalized to [0, 1] × [0, 1]

  tag A                         tag B
       +---------------------------+
       |       data cells          |
  tag C|                           |tag D
       |                           |
       +---------------------------+
  tag E                         tag F
```

The diagram is schematic. The useful properties are coverage, non-collinearity, and independent IDs—not a particular grid dimension.

Practical layout guidance:

- Start with six tags: four near the corners and two at opposite long-edge midpoints. Move to eight tags (four corners plus four edge midpoints) if an obstruction can cover a large part of the display or if the first benchmark shows unstable extrapolation.
- Place tags well inside the visible display boundary, leaving a quiet border and enough separation that neighboring black borders do not merge after blur or downsampling. Do not put all tags on one edge or in a single row.
- Make the four corner tags the largest or most conservative tags; they control board coverage and reacquisition. The edge tags add redundancy and constrain the middle of the homography.
- Keep all tag corners and logical coordinates in the board definition, not inferred from the current frame. The ID-to-location table is part of the wire-format contract between web and Android.
- Use a dictionary/family with large inter-code distance and enough IDs for the board. ArUco’s original work explicitly constructs dictionaries by maximizing inter-marker distance and bit transitions; AprilTag describes stronger coding and robustness to warping and occlusion. [Garrido-Jurado et al., ArUco, Pattern Recognition 2014](https://doi.org/10.1016/j.patcog.2014.01.005), [Olson, AprilTag](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf)
- Keep a generous black/white quiet zone and avoid placing data cells immediately adjacent to a tag. This is a design inference from the detector’s contour and bit-sampling assumptions and must be validated at the smallest projected tag size.
- Do not rely on a partially decoded tag for normal data acceptance. Treat a fully decoded tag as one robust board observation; let the board tolerate missing tags. AprilTag’s original paper reports robustness to occlusion, while AprilTag 2 explicitly discusses a trade-off between recovering partially occluded borders and speed/false positives. [AprilTag](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf), [AprilTag 2](https://april.eecs.umich.edu/media/pdfs/wang2016iros.pdf)

For the first benchmark, vary tag size and spacing rather than hard-coding a pixel threshold. A useful acceptance heuristic is that the projected tag side must leave several samples per code bit after blur and downsampling; the correct value is camera/display dependent. Record detection recall against projected tag side, viewing angle, motion blur, glare, and obstruction.

### AprilTag versus ArUco

Both are suitable. AprilTag 3 is attractive for a shared native core because its first-party repository is a small C library with a stable C API and includes pose estimation, flexible layouts, and ArUco families. Its detection result includes a Hamming error count and `decision_margin`; the implementation describes the latter as the separation of sampled bits from the decision threshold. [AprilTag repository](https://github.com/AprilRobotics/apriltag), [AprilTag result structure and decoder](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.h), [AprilTag decoder implementation](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.c)

ArUco is attractive when OpenCV is already the shared dependency. OpenCV exposes `GridBoard`, board-aware detection, rejected candidates, corner refinement, and `refineDetectedMarkers`, which can use the known board layout to recover markers that were initially rejected. OpenCV also documents ChArUco as a higher-precision option for calibration and pose estimation while retaining partial-board flexibility. [OpenCV ArUco detection](https://docs.opencv.org/4.12.0/d2/d1a/classcv_1_1aruco_1_1ArucoDetector.html), [OpenCV board refinement](https://docs.opencv.org/4.4.0/d9/d6a/group__aruco.html), [OpenCV ChArUco detection](https://docs.opencv.org/master/df/d4a/tutorial_charuco_detection.html)

Recommendation: choose AprilTag 3 for V1 unless OpenCV is already unavoidable. The protocol should expose detector-independent observations—`id`, four ordered corners, decode quality, and frame timestamp—so the detector can be swapped without changing homography or cell decoding.

## Homography and perspective correction

Let (q=(u,v)) be a logical point on the display plane and (p=(x,y)) its camera-frame pixel location. Estimate (H_{D\to C}) such that:

\[
  \tilde p \sim H_{D\to C}\tilde q,
\]

where tildes denote homogeneous coordinates. Store both (H_{D\to C}) and its inverse (H_{C\to D}). Cell sampling uses the inverse; diagnostic overlays and projected board boundaries use the forward map.

Build correspondences by looking up every detected marker ID in the board model and pairing its four canonical marker corners with the observed corners. Use all visible tags, not one tag’s center. Reject impossible corner order, negative/near-zero projected area, duplicate IDs, and points outside the camera buffer.

Use a robust estimator. OpenCV defines `findHomography` as finding a perspective transformation between two planes and supports RANSAC; its documentation describes the reprojection threshold as the pixel distance used to classify inliers. The original RANSAC paper explains why random minimal subsets are useful when measurements contain gross errors. [OpenCV `findHomography`](https://docs.opencv.org/4.13.0/d1/dfb/intro.html), [OpenCV calibration/homography documentation](https://docs.opencv.org/2.4.4/modules/calib3d/doc/camera_calibration_and_3d_reconstruction.html), [Fischler and Bolles, RANSAC](https://www.sri.com/publication/artificial-intelligence-pubs/random-sample-consensus-a-paradigm-for-model-fitting-with-applications-to-image-analysis-and-automated-cartography-2/)

Use a threshold in camera pixels, scaled with the actual analysis resolution. Start with a threshold tied to expected corner localization noise (a few pixels at the analysis resolution), then measure false acceptance and false rejection; do not copy a universal threshold. After RANSAC, refit (H) from all inlier corners and compute residuals against the refitted model. If camera intrinsics are known, undistort the observed corners first, or undistort the frame once and do all geometry in that rectified coordinate system. OpenCV’s `undistortPoints` returns ideal point coordinates, and its calibration documentation models radial and tangential distortion. [OpenCV `undistortPoints`](https://docs.opencv.org/4.4.0/d9/d0c/group__calib3d.html), [OpenCV camera calibration](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html)

Use pose estimation only as an optional diagnostic. OpenCV notes that planar PnP initialization uses homography decomposition and provides IPPE specifically for coplanar points, but V1 does not need metric distance or a 6-DOF pose to sample the screen. [OpenCV PnP documentation](https://docs.opencv.org/4.11.0/d5/d1f/calib3d_solvePnP.html)

### Homography gates

Keep the following values as a vector, not one opaque probability:

- number of visible tags and number of inlier corners;
- inlier ratio and RMS / 95th-percentile reprojection error in pixels;
- board coverage: convex-hull area of accepted board points divided by projected board area;
- minimum projected tag side, minimum edge angle, and quadrilateral orientation;
- homography conditioning or sensitivity measured by perturbing marker corners and observing displacement at the four display corners and cell centers;
- change from the previous (H): translation, scale, rotation/shear, and corner displacement per frame;
- whether the projected display remains inside a plausible camera ROI and preserves orientation.

Use hysteresis: a stricter gate to enter `TRACKING`, a looser one to remain there for a short period, and a timeout after consecutive failures. A single tag may be used for coarse reacquisition, but require multiple well-distributed tags and low residuals before accepting payload data. This is a design choice based on homography conditioning, not a claim that one marker cannot mathematically determine a plane.

## Continuous tracking loop

Use a small state machine:

```text
SEARCH → ACQUIRE → TRACK
  ↑        ↓         ↓
  └──── LOST ← DEGRADED
```

- `SEARCH`: run full-frame detection, preferably at a reduced pyramid level first and at full resolution when no candidate is found.
- `ACQUIRE`: collect one or more good detections, fit/refine (H), and require stable geometry for a short confirmation window.
- `TRACK`: propagate the four corners of several visible tags with pyramidal Lucas–Kanade flow. Refit (H) from the tracked points, then periodically run board detection to correct drift.
- `DEGRADED`: keep sampling only if geometry is still inside the conservative gate; increase detector frequency and lower the ROI restriction. Do not silently decode with an extrapolated stale homography.
- `LOST`: discard the old model after a bounded grace interval and return to full-frame acquisition.

Lucas–Kanade is a good fit for the inter-detection step because it performs local image registration from spatial gradients and can handle rotation, scaling, and shearing with suitable patches. Shi–Tomasi’s feature-selection paper adds a monitoring method for occlusions, disocclusions, and points that no longer correspond to physical features. Track tag borders/corners, not payload cells, because the payload intentionally changes every symbol/frame. [Lucas and Kanade, 1981](https://idl.uw.edu/living-papers-paper/lucas-kanade/), [Shi and Tomasi, 1994](https://publications.ri.cmu.edu/good-features-to-track)

Suggested V1 schedule:

- run the detector every 5–10 camera frames while tracking, with the interval reduced when residuals or temporal motion grow;
- use the current projected board as a detector ROI, expanded by a motion margin, but run a full-frame detector after any failed ROI pass;
- retain several points per marker border and reject flow points with failed status, excessive forward-backward error, or a large local photometric residual;
- use the tracked homography only for short prediction. A sudden jump, display animation, camera shake, or obstruction should trigger correction rather than long extrapolation;
- timestamp every frame at acquisition and report frame age. A geometrically good but old frame is not a good tracking observation.

This is intentionally a correction loop, not a Kalman-filter project. Add a filter only after benchmark traces show that detector jitter, rather than decode latency or motion blur, is the dominant problem.

## Local cell sampling

Do not perspective-warp the whole camera frame for V1. For each logical cell rectangle, map its center and a small interior sampling pattern through (H_{D\to C}). Sample away from cell boundaries: for example, use a 3×3 pattern over the inner 60–70% of the cell, aggregate with a median or trimmed mean, and mark samples that fall outside the projected display or into a known marker/quiet-zone mask. The exact interior fraction is a benchmark parameter; it trades blur tolerance against contamination from neighboring cells.

Use the camera luminance plane for marker and binary-cell work. For each cell retain:

- robust luminance estimate;
- local contrast or distance from the decision threshold;
- sample count and projected cell footprint;
- clipping/saturation fraction;
- intra-cell spread, which is a useful blur/glare indicator;
- whether the point lies close to a projected cell boundary or a tag mask.

Prefer inverse mapping (logical cell → camera samples) over forward splatting. It avoids holes, handles perspective naturally, and makes the sampling footprint explicit. If the projected cell is smaller than a few camera pixels or has a large condition/sensitivity score, return “unknown” rather than a confident bit. Use a local threshold or pilot/reference cells to compensate for illumination gradients; never assume one global camera-luminance threshold across the whole display.

For a decoded symbol, combine the cell-quality vector with the frame-level geometry. A cell can be locally bad even when the board homography is excellent, for example because of glare or a finger over one region. Preserve that locality for the error-correction layer instead of discarding the entire frame.

## Confidence and obstruction tolerance

### Marker-level signals

For AprilTag, use family validity, Hamming distance, `decision_margin`, corner geometry, and detector homography. The first-party API defines `decision_margin` as a binary-decoding quality measure and Hamming as the code distance/error count. For ArUco, use valid dictionary ID, corner-refinement result, board-consistency residual, and rejected-candidate/recovery information; OpenCV exposes rejected candidates and board-aware marker refinement. [AprilTag API](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.h), [OpenCV ArUco API](https://docs.opencv.org/4.4.0/d9/d6a/group__aruco.html)

### Board-level signals

Require a minimum number of valid, non-duplicate tags, but make the threshold depend on coverage. One tag can initialize a coarse model; two separated tags can be useful; three or more distributed tags should be the normal data-acceptance target. A board with four tags all in one quadrant is worse than two tags at opposite edges. Gate on residuals, coverage, projected cell size, and temporal consistency together.

### Partial obstruction

Design for missing complete tags. With six/eight distributed tags, an obstruction can remove a local region while the remaining tags still constrain the plane. Do not fill missing corners by copying the previous frame unless the result is explicitly marked predicted and kept out of payload acceptance. If only one tag remains, use it to guide reacquisition and display a degraded diagnostic state; recover normal decoding after board coverage is restored.

If using OpenCV ArUco, board refinement can use the known board layout and rejected candidates. If using AprilTag, the detector’s code and corner confidence are useful, but board-level redundancy remains the safer obstruction strategy. AprilTag’s documented robustness to occlusion and ArUco’s multi-marker board design support this division of responsibility: detector-level recovery is opportunistic; board-level geometry is authoritative. [AprilTag](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf), [ArUco paper](https://doi.org/10.1016/j.patcog.2014.01.005), [OpenCV board detection](https://docs.opencv.org/4.6.0/db/da9/tutorial_aruco_board_detection.html)

## Calibration

Separate camera calibration from per-session screen tracking.

### Intrinsic camera calibration

If the camera is unknown, calibrate its intrinsics and distortion once per camera mode/resolution/orientation. Zhang’s planar calibration method requires a planar pattern observed at several unknown orientations, models radial distortion, and refines a closed-form solution by nonlinear optimization. A ChArUco board is a practical target because OpenCV combines ArUco’s partial-view flexibility with chessboard corner precision. [Zhang, “A Flexible New Technique for Camera Calibration”](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/zhan99.pdf), [OpenCV ChArUco calibration guidance](https://docs.opencv.org/master/df/d4a/tutorial_charuco_detection.html)

Store calibration keyed by camera identity/facing, output width/height, crop/zoom mode, and sensor orientation. If the camera pipeline changes any of those, invalidate or revalidate the calibration. For wide-angle cameras, undistort before fitting the screen homography; otherwise the four-corner fit can look good while the interior cell grid bends near the image edges.

### Per-session screen-to-camera calibration

The display board itself defines the screen coordinate frame. The sender should render markers at exact backing-store coordinates and keep CSS/display transforms separate from logical board coordinates. On the receiver:

1. normalize orientation and mirroring;
2. detect the board in a static calibration view;
3. collect several good frames while the camera is reasonably still;
4. fit (H_{D\to C}) per frame and select/refine a robust representative;
5. validate by projecting all known tag corners and checking residuals, coverage, and cell footprints;
6. enter tracking only after the board is stable.

Do not average homography matrix entries directly across strongly different viewpoints. A better V1 approach is to retain the best low-residual frame or refit from pooled inlier correspondences over a short stable window. Recalibrate when the camera resolution/orientation changes, the screen moves relative to the camera, or tracking confidence remains below threshold.

## Browser guidance

Acquire the camera with `navigator.mediaDevices.getUserMedia()`. The returned resolution and frame rate may differ from requested preferences, so use the actual track settings in all pixel thresholds and diagnostics. [MDN `getUserMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

For capable browsers, move frame processing to a dedicated worker: `MediaStreamTrackProcessor` can consume a camera `MediaStreamTrack` and produce `VideoFrame` objects, while WebCodecs exposes raw frames and integrates with Canvas. Keep a compatibility path using a hidden video element plus `requestVideoFrameCallback`/Canvas when the worker API is unavailable; MDN labels `MediaStreamTrackProcessor` limited availability. [MDN `MediaStreamTrackProcessor`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor), [W3C WebCodecs](https://www.w3.org/TR/webcodecs/), [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)

Use an `OffscreenCanvas` in the worker for visualization or small-region pixel access. A Canvas 2D `getImageData()` path is widely available but copies pixel data; minimize copies by keeping one reusable buffer, processing luminance, and sampling only the board ROI/cell points. A compiled detector and geometry core in WebAssembly is a good portability boundary; enable SIMD only as a capability/performance optimization, not as a correctness requirement. Always close each consumed `VideoFrame` promptly to release media resources. [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas), [MDN `getImageData`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData), [MDN WebAssembly SIMD](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/SIMD), [MDN `VideoFrame.close()`](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/close)

The worker should return compact observations—not full frames—to the UI: timestamp, state, homography, board confidence vector, cell-quality vector, dropped-frame count, and processing time. Keep all camera pixels local.

## Android guidance

Use CameraX `ImageAnalysis` with a background executor. The default `STRATEGY_KEEP_ONLY_LATEST` is a good fit for a latency-sensitive tracker: when analysis falls behind, CameraX overwrites the pending image rather than blocking preview. Close every `ImageProxy` in all paths. [Android CameraX image analysis](https://developer.android.com/media/camera/camerax/analyze), [Android `ImageAnalysis.Builder`](https://developer.android.com/reference/androidx/camera/core/ImageAnalysis.Builder)

Use `YUV_420_888` by default and read the Y plane directly for marker and cell luminance. CameraX documents YUV as the default CPU-accessible format; RGBA conversion adds overhead. Respect each plane’s row stride and pixel stride—never assume tightly packed rows. Use RGBA only when a downstream API requires it. [Android `ImageAnalysis`](https://developer.android.com/reference/androidx/camera/core/ImageAnalysis), [Android `ImageFormat`](https://developer.android.com/reference/android/graphics/ImageFormat)

CameraX analyzers normally receive buffers in sensor orientation and expose `rotationDegrees`; camera2 exposes `SENSOR_ORIENTATION`, and Android documents that sensor orientation and rolling-shutter direction are related to the sensor coordinate system. Normalize this before marker detection and include the applied rotation/mirror in diagnostics. Do not cache a logical-camera orientation across fold/device-state changes without checking the current capture metadata. [Android `ImageAnalysis.Analyzer`](https://developer.android.com/reference/androidx/camera/core/ImageAnalysis.Analyzer), [Android camera preview/orientation](https://developer.android.com/media/camera/camera2/camera-preview), [Android `CameraCharacteristics.SENSOR_ORIENTATION`](https://developer.android.com/reference/android/hardware/camera2/CameraCharacteristics)

Share the same WebAssembly/native geometry core if practical, but keep frame adapters platform-specific: browser `VideoFrame`/Canvas pixels and Android `ImageProxy` planes have different lifetime, stride, rotation, and color-conversion rules.

## Diagnostics and benchmark plan

Every processed frame should be optionally exportable as a compact local record with:

- capture timestamp, frame age, actual width/height, rotation/mirror, and dropped-frame count;
- detector/tracker mode and per-stage duration;
- detected IDs, corner coordinates, Hamming/decision margin or ArUco quality, and rejected candidates;
- homography, visible-tag count, inlier count/ratio, RMS and 95th-percentile residual, coverage, projected corner displacement, and sensitivity score;
- per-cell luminance, contrast/margin, clipping, sample count, projected footprint, boundary distance, and decoded/unknown status;
- reason for every state transition or rejected frame.

Overlay the same information on a debug preview: marker IDs, ordered corners, outliers in red, the projected display polygon, a sparse projected cell grid, current state, confidence gates, and frame age. This makes coordinate-order, rotation, mirroring, and stale-frame errors visible quickly.

Benchmark at the actual analysis resolution with recorded camera frames and a simulator. Sweep:

- translation, rotation, scale, keystone, and camera distance;
- motion blur, exposure changes, glare, defocus, lens distortion, and display brightness;
- one or more missing tags and partial tag obstruction;
- dropped frames and processing overload;
- portrait/landscape rotation and front-camera mirroring;
- smallest projected tag and cell sizes.

Measure marker recall, homography corner error, cell-center mapping error, false-valid-frame rate, reacquisition frames/time, end-to-end latency, CPU time, allocations, and dropped-frame rate. Set V1 thresholds from these traces, then keep the raw diagnostic vectors so later calibration or decoder changes can be evaluated without changing the tracking protocol.

## Sources

- [Olson, “AprilTag: A robust and flexible visual fiducial system”](https://april.eecs.umich.edu/pdfs/olson2010tags.pdf)
- [Wang and Olson, “AprilTag 2: Efficient and robust fiducial detection”](https://april.eecs.umich.edu/media/pdfs/wang2016iros.pdf)
- [Krogius, Haggenmiller, and Olson, “Flexible Layouts for Fiducial Tags”](https://april.eecs.umich.edu/pdfs/krogius2019iros.pdf)
- [AprilRobotics AprilTag first-party implementation](https://github.com/AprilRobotics/apriltag)
- [Garrido-Jurado et al., “Automatic generation and detection of highly reliable fiducial markers under occlusion”](https://doi.org/10.1016/j.patcog.2014.01.005)
- [OpenCV ArUco/board documentation](https://docs.opencv.org/master/df/d4a/tutorial_charuco_detection.html)
- [Zhang, “A Flexible New Technique for Camera Calibration”](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/zhan99.pdf)
- [Fischler and Bolles, “Random Sample Consensus”](https://www.sri.com/publication/artificial-intelligence-pubs/random-sample-consensus-a-paradigm-for-model-fitting-with-applications-to-image-analysis-and-automated-cartography-2/)
- [Lucas and Kanade, “An Iterative Image Registration Technique”](https://idl.uw.edu/living-papers-paper/lucas-kanade/)
- [Shi and Tomasi, “Good Features to Track”](https://publications.ri.cmu.edu/good-features-to-track)
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/) and [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [MDN MediaStreamTrackProcessor](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor)
- [Android CameraX image analysis](https://developer.android.com/media/camera/camerax/analyze)
- [Android CameraX `ImageAnalysis` API](https://developer.android.com/reference/androidx/camera/core/ImageAnalysis)
