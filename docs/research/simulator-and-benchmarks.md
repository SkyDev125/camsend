# Simulator and benchmark findings

The benchmark must report decoded file bytes only after exact reconstruction and SHA-256 verification. It separates raw optical symbol rate, recovered encoded payload, verified original-file goodput, and compression-adjusted throughput. This follows the measurement literature's emphasis on calibrated geometry and unstable optical factors. [systematic measurement](https://arxiv.org/abs/1501.02528), [capacity under perspective](https://www.sciencedirect.com/science/article/abs/S1574119214001849)

The reproducible pipeline is: render a frame, apply seeded geometry/blur/exposure/colour/noise/rolling-shutter/obstruction effects, optionally drop or duplicate the frame, decode with the same reference decoder, then run fountain recovery and SHA-256 verification. Each run emits a JSON report with seed, mode, grid, frame count, unique/duplicate/rejected frames, correction counts, decode timings, confidence, and throughput.

Retention gates compare candidate modes on the same fixture matrix. A change is retained only if it improves verified goodput without a statistically meaningful reliability regression, or materially reduces decoder cost/compatibility risk. Real-camera exports use the same schema and never include payload bytes unless an explicit recording option is enabled.

