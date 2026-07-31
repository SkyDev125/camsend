# Named optical systems and present bottlenecks

Research date: 2026-07-31. This is a source-grounded survey for Wayfinder ticket #3. “Throughput” below is reported by the original authors under their particular screen, camera, distance, frame-rate, and coding conditions; it is not a cross-paper benchmark. A reported raw rate, BER, or correctly decoded-frame percentage is not the same thing as verified file goodput.

## Executive finding

The systems divide into three practical families:

1. **Visible, spatial codes** (PixNet, COBRA, RainBar, Cimbar) spend screen area on a machine-readable field. They can reach the highest useful file rates with ordinary cameras, but the receiver must solve screen localization, perspective, color/radiometric calibration, blur, frame timing, and loss recovery at once.
2. **Scalable or hidden codes** (Strata, HiLight, InFrame++, ChromaCode, AIRCODE, DeepLight) reduce the visual or hardware burden by giving up peak rate, requiring a high-refresh sender, embedding data in normal video, or adding a learned decoder/control channel.
3. **Application products and patents** generally stream QR/barcode images. They validate demand and basic protocol patterns, but do not remove the camera-pipeline bottleneck.

For Wayfinder, the strongest opportunity is not another animated QR symbol or a new alphabet. It is an end-to-end **camera-only, receiver-adaptive file protocol**: a compact non-QR tile field with robust geometry tracking, measured confidence, fountain/rateless recovery, late join and reordering, and a clearly reported file-success goodput under handheld conditions. Cimbar already demonstrates that dense color tiles plus a file envelope can approach 850 kbit/s in a controlled phone test. Wayfinder can target the gap between that proof of concept and a boringly reliable product on heterogeneous modern phones.

## Name and variant audit

### Cimbar, libcimbar, CFC, and CameraFileCopy

These are related but not interchangeable names:

- **Cimbar** is the tile/barcode design and the original research/design project.
- **libcimbar** is the optimized C++ implementation and file-envelope work.
- **CFC / CameraFileCopy** is the Android receiver application built around libcimbar.
- `cimbar.org` is a sender/web demo, while the Android application is a receiver; this is primarily a one-way display-to-camera link.

The project’s own documentation says the design is experimental, not a standards document. Its strongest file-transfer result is therefore an open-source engineering benchmark rather than a peer-reviewed independent evaluation.

### Decim and Decimen

I found no authoritative primary paper, project page, source repository, or benchmark identifying **Decim** or **Decimen** as an optical screen/camera file-transfer system. Public results under those spellings resolve to unrelated messaging, photography, semiconductor, or patent material. I therefore do not merge either name into COBRA, Cimbar, or another system. The name is probably a typo, an internal project codename, or a citation variant; the ticket should retain it as an unresolved alias until a manuscript, repository, or URL is supplied.

### COBRA and RainBar

These are separate research systems, not names for the same protocol. COBRA is the earlier adaptive color-barcode design for smartphone systems. RainBar reworks the layout, localization, synchronization, color processing, and reliability path and reports a higher rate on a later Galaxy S4 setup.

## System-by-system findings

### 1. Cimbar / libcimbar

**Primary sources and implementation.** The authoritative public sources are the [Cimbar repository](https://github.com/sz3/cimbar), [libcimbar repository](https://github.com/sz3/libcimbar), [libcimbar details](https://github.com/sz3/libcimbar/blob/master/DETAILS.md), [performance notes](https://github.com/sz3/libcimbar/blob/master/PERFORMANCE.md), and [CFC Android receiver](https://github.com/sz3/cfc). The project does not present a peer-reviewed original paper; claims below are taken from its own design and benchmark documents.

**Protocol and modulation.** A frame is a large regular field of small image-symbol tiles. The reference mode uses a 1024×1024 image, nominal 8×8 tiles, an empty row/column spacing pattern, and a dictionary of 16 tile patterns. A tile is classified by an 8×8 threshold/hash comparison and carries four symbol bits; average-color classification adds two bits in the four-color mode, for six bits per tile. An older eight-color mode carries seven bits per tile but is reported as less consistent. The symbol dictionary and cell size are design choices, not an interoperable standard.

**Markers, tracking, and synchronization.** The decoder searches for three corner patterns, estimates the fourth corner by triangulation, applies a perspective transform, and tracks drift between frames. The documented drift tracker is capped at about seven pixels. There is no camera clock synchronization; the receiver decodes whatever complete animated frames it sees and discards unusable intermediate images. Frames contain sequence/envelope information for file transfer.

**Error correction and file protocol.** Tile-level image hashing and palette classification are followed by Reed–Solomon coding. Bits are interleaved across the image so a localized glare or blur region does not erase one contiguous logical block. The optional file envelope compresses with zstd and uses a Wirehair fountain code: missing, corrupt, and out-of-order frames are acceptable once enough distinct encoded blocks arrive. This is one of the most transferable ideas in the survey. The project notes that byte-oriented RS is not a perfect match for errors that often appear as one-to-three flipped tile bits, and the fountain envelope is experimental rather than a published wire protocol.

**Rate and reliability.** In the project’s current benchmark, mode B carries 7,500 post-ECC bytes per image. A 4,689,084-byte compressed transfer took 44 seconds, or about **852 kbit/s / 106 kB/s sustained**. The benchmark used CFC with four CPU threads on a Qualcomm Snapdragon 625; the notes say modern CPU time is less important than the camera pipeline. A deprecated eight-color mode reached about 943 kbit/s but was inconsistent; a beta mode was above 1 Mbit/s and explicitly marked work in progress. The project describes sub-1% residual error as expected/correctable in its intended conditions, but this is not an independent file-success measurement.

**Hardware assumptions and failure modes.** The sender is a browser/WASM or native renderer that can fill most of a screen with a 700×700-or-larger frame. The receiver is an Android/OpenCV application with access to camera frames. The camera should be focused and the frame should fill the view. Shaky hands cause discarded frames; glare, darkness, color correction, lens distortion, oblique views, blur, and a screen that is too small all degrade classification. Dark mode is useful for backlit displays, while a white background helps some light-mode conditions. The project explicitly warns that color separation, glare, and curved surfaces remain difficult.

**Modern-phone relevance.** High. It is the only named system here with a maintained public implementation, a practical Android receiver, a WASM sender, and a file envelope. Its limit is productization: its geometry/color assumptions are still brittle, the encoder and decoder are split across platforms, and its benchmark is not a modern multi-phone test matrix. It is a strong baseline to reuse as a reference—not a reason to reproduce its exact animated barcode UX.

### 2. COBRA: Color Barcode Streaming for Smartphone Systems

**Primary source.** Hao, Zhou, and Xing, “COBRA: Color Barcode Streaming for Smartphone Systems,” MobiSys 2012, [DOI 10.1145/2307636.2307645](https://doi.org/10.1145/2307636.2307645). The authors’ [project page](https://aiot.ie.cuhk.edu.hk/2012/09/01/cobra-color-barcode-streaming-for-smartphone-systems/) is a useful companion. I did not locate a maintained public source implementation from the original authors.

**Protocol and modulation.** COBRA streams one-way color barcode frames from a display to a phone. Four colors—red, green, blue, and white—represent two bits per block. The frame layout adapts block size and layout to the estimated blur, trading spatial density for camera tolerance. The paper explicitly avoids a computationally heavy OFDM decoder on the target phones.

**Markers, tracking, and synchronization.** Each frame has color corner trackers and timing-reference blocks. Fast corner detection finds the frame, then the decoder samples the block grid after perspective correction. COBRA assumes the camera captures at least twice the display refresh rate so successive displayed frames can be distinguished; its implementation used a roughly 15 fps sender and a 30 fps receiver. This is a fragile assumption for modern camera APIs because advertised video frame rate does not guarantee exposure timing, frame delivery, or absence of rolling-shutter mixing.

**Error correction.** The paper uses a 3/7 Reed–Solomon-style configuration in its comparison with PixNet. Its main reliability lever is adaptive block size and frame acceptance: a frame is either decoded correctly or discarded; partial frame recovery is not treated as useful file goodput. The paper’s result tables therefore report correctly decoded frames and rate, not an end-to-end file hash.

**Rate and benchmark.** The best reported point is about **225 kbit/s** at block size six pixels, but the corresponding decoding rate is only about 51.1% in the paper’s experiment. Across tested block sizes, the paper reports approximately 64–98% correct frames and 91–172 kbit/s, depending on the operating point. Its comparison gives PixNet about 12.4% correct frames and 6.4 kbit/s under the phone-side decoder, making COBRA much more practical on its target hardware even though PixNet has a much higher specialized-link peak.

**Hardware and failure modes.** The prototype used a Google Nexus S as sender and HTC Inspire as receiver, with Android 2.3.3-era APIs, a 4-inch 800×480 display, an 8 MP autofocus camera, and 1280×720 capture. Small screens, low capture rate, focus/motion blur, perspective, and frame-rate mismatch are the main failure modes. Color calibration is a first-class issue: the receiver must restore/correct color before classifying the four palette values.

**Modern-phone relevance.** Medium to high as a design lineage. The adaptive block-size idea, explicit timing reference, and fast corner tracking remain useful. The exact 2012 assumptions—fixed low camera rates and a small Android screen—do not transfer. COBRA is a visible barcode stream, so it also inherits the UX and privacy cost of covering the sender screen with a code.

### 3. RainBar / “Rain Bar”

**Primary source.** Wang et al., “Rain Bar: Robust Application-Driven Visual Communication Using Color Barcodes,” ICDCS 2015, [DOI 10.1109/ICDCS.2015.61](https://doi.org/10.1109/ICDCS.2015.61). I found the paper but no maintained public source implementation from the authors.

**Protocol and modulation.** RainBar maps two bits to four colors (white, red, green, blue), with application-driven configuration. A frame has a header with sequence information, display rate, application type, and checksums/CRC. The transmitter can adapt parameters using accelerometer-derived conditions. Unlike a pure “show the densest possible image” design, RainBar spends substantial area on locating and validating the payload.

**Markers, tracking, and synchronization.** Its layout is unusually explicit:

- two top corner trackers, each a 3×3 pattern with a black center and colored surround;
- three columns of black in-frame locators at left, middle, and right for block localization;
- four border tracking bars;
- a two-bit tracking-bar indicator that changes over four consecutive frames;
- a sequence number that carries the previous-frame MSB and a 15-bit frame index.

The receiver progressively detects locators, localizes blocks, estimates blur, and selects the best duplicate image. The header compares display and capture rate. When the display is no faster than half the capture rate, every frame can be observed; otherwise tracking bars help distinguish frame state. This directly addresses the timing-reference weakness the paper attributes to COBRA under perspective distortion.

**Error correction and reliability.** Intra-frame Reed–Solomon plus CRC detects/corrects frame corruption. The sequence number permits reordering and missing-frame detection. The application-driven design favors retransmission via feedback for text-like data over blindly adding large redundancy. That feedback assumption is important: a browser-only sender and a one-way receiver cannot automatically use the same retransmission path.

**Rate and benchmark.** On two Samsung Galaxy S4 phones running Android 4.4.2, with 1920×1080 displays and 13 MP cameras, the paper reports the following measured comparison:

| Block size | RainBar | COBRA | RainBar decoding result |
| --- | ---: | ---: | --- |
| 6×6 | 955.68 kbit/s | 518.09 kbit/s | above 91% decoding rate at an 18 fps display setting |
| 7×7 | 743.85 kbit/s | 597.48 kbit/s | setup-dependent |
| 8×8 | 584.32 kbit/s | 510.40 kbit/s | setup-dependent |

The paper’s best result is therefore about **956 kbit/s under its stated setup**, not a universal phone-to-phone rate. At 13-pixel blocks, the 1920×1080 frame has roughly 147×83 blocks; RainBar’s layout provides more payload blocks than COBRA while preserving tracking structures.

**Hardware and failure modes.** The system assumes a bright, large, front-facing screen and a capable camera. Illumination/shade, lens distortion, display/capture-rate mismatch, rolling-shutter mixtures, viewing angle, hand shake, and phone-specific color response all matter. The richer marker layout improves robustness but consumes pixels and increases implementation complexity.

**Modern-phone relevance.** High for mechanisms, medium for product shape. RainBar is the best named reference for a visible color protocol that treats synchronization, tracking, CRC/RS, reordering, and feedback as one system. Its V1 lesson is not to copy every marker; it is to measure and budget the overhead of geometry and timing instead of reporting only raw payload density.

### 4. PixNet

**Primary source.** Perli, Ahmed, and Katabi, “PixNet: Interference-Free Wireless Links Using LCD-Camera Pairs,” MobiCom 2010, [DOI 10.1145/1859995.1860012](https://doi.org/10.1145/1859995.1860012), with an author-hosted [paper PDF](https://people.csail.mit.edu/nabeel/pixnet-mobicom10.pdf). The paper is not a phone-file-transfer implementation and I found no maintained public source.

**Protocol and modulation.** PixNet uses spatial OFDM: a two-dimensional frequency-domain design, 4-QAM symbols, Hermitian symmetry, and a 2D inverse FFT produce real-valued screen patterns. A cyclic prefix is used; the paper reports an empirically chosen symbol footprint around 81×81 pixels. The transmitter stacks symbols on an LCD, while the camera recovers the spatial frequency content.

**Markers, tracking, and synchronization.** A Data Matrix-style corner detector finds the rectangular coded area. Perspective correction is handled through generalized OFDM sampling correction rather than a dense visible barcode marker system. The receiver then FFT-demodulates the corrected image. There is no ordinary phone-style display/camera frame synchronization protocol; the system assumes a capture setup that can acquire the displayed spatial symbols.

**Error correction.** PixNet uses frequency-domain adaptation for blur and ignores the ambient-light DC component. The paper’s phone comparison used a 3/7 RS configuration, but its decoder could not sustain the high-rate design on the evaluated phone. This is a useful warning that physical-layer capacity and mobile decoder capacity are separate limits.

**Rate and benchmark.** The headline result is **up to 12 Mbit/s at 10 m** and **8 Mbit/s at a 120° viewing angle** in a controlled LCD/camera setup. The hardware was a 30-inch Dell display with Casio EX-F1 and Nikon D3X cameras, not commodity smartphone cameras. In the COBRA comparison, the phone-side PixNet implementation achieved only about 12.4% correct frames and 6.4 kbit/s, with a Java demodulator taking about 194 ms; a native C/KissFFT path was roughly ten times faster.

**Hardware and failure modes.** PixNet explicitly addresses perspective distortion, blur, and ambient light, but it needs enough pixels per symbol and a camera with adequate spatial resolution and processing. Loss of focus, motion blur, undersampling, severe perspective, and CPU/FFT cost are failure modes. It is a line-of-sight link and is not a “point camera at any phone screen and transfer a file” result.

**Modern-phone relevance.** Low for direct reuse, high as an upper-bound lesson. Spatial frequency modulation can exploit far more screen capacity than tile barcodes, but an ordinary browser and phone camera need a simpler decoder, and a smartphone’s ISP/rolling shutter does not expose the stable, high-quality image assumed by the prototype. PixNet’s 12 Mbit/s should not be used as the Wayfinder target without reproducing its hardware conditions.

### 5. Strata

**Primary source.** Hu et al., “Strata: Layered Coding for Scalable Visual Communication,” MobiCom 2014, [DOI 10.1145/2639108.2639132](https://doi.org/10.1145/2639108.2639132). The [MobiCom program entry](https://www.sigmobile.org/mobicom/2014/program.html) and authors’ [presentation transcript](https://www.slideserve.com/zion/strata-layered-coding-for-scalable-visual-communication) provide accessible supporting material. I did not locate public source code or an accessible primary full-text benchmark table.

**Protocol and modulation.** Strata applies hierarchical modulation recursively. It embeds coarse and fine information at multiple spatial granularities in the same code area, or at multiple temporal granularities in the same frame interval. A receiver with fewer pixels, fewer frames per second, more distance, or worse channel quality can decode a lower layer independently; a stronger receiver can decode additional layers. The design deliberately controls interference between adjacent layers.

**Markers, tracking, synchronization, and ECC.** The accessible abstract and slides establish the recursive multi-size block structure but do not expose enough of the primary paper to safely specify a complete marker format, timing protocol, or error-correction code. The slides show a block-recursive image and smartphone decoding examples; they should not be treated as a protocol specification. This is a case where the right finding is “architecture established, wire details and file-transfer benchmark not publicly recoverable in this pass.”

**Rate and hardware.** Strata’s contribution is a capacity-versus-range curve rather than one peak number. Its examples span a Lumia 1020, Nexus 5, iPhone 4, and iPhone 5s with differing resolution/frame rate. The paper claims a significantly extended operational range at the expense of less capacity than a single-layer code, but I found no stable primary source for a directly comparable kbit/s number.

**Modern-phone relevance.** High as a receiver-adaptation idea. It is especially relevant if Wayfinder wants one sender to work across a laptop webcam, a cheap Android phone, and a flagship phone. The likely V1 simplification is two or three explicit rate modes rather than a fully recursive code; the receiver can select a mode from measured cell footprint and decode confidence.

### 6. HiLight

**Primary source and code.** Li et al., “Real-Time Screen-Camera Communication Behind Any Scene,” MobiSys 2015, [DOI 10.1145/2742647.2742667](https://doi.org/10.1145/2742647.2742667), [paper PDF](https://www.cs.dartmouth.edu/~xia/publication/mobisys15-hilight/mobisys15-hilight.pdf), and the [project page with source-code link and supplemental data](https://dartnets.cs.dartmouth.edu/hilight). The linked [GitHub repository](https://github.com/Tianxing-Dartmouth/HiLight) is the relevant implementation reference.

**Protocol and modulation.** HiLight adds a communication layer using pixel alpha/translucency, leaving the displayed RGB content intact. Its default implementation modulates each grid cell with BFSK at a 60 Hz screen refresh: the two bit values use 20 Hz and 30 Hz patterns over six frames. A scene detector samples the content, defers transmission across cut-scene frames, and the GPU performs alpha blending. This is not a visible barcode and can run over images, video, web pages, and games.

**Markers, tracking, and synchronization.** There is no visible finder pattern or barcode marker. The temporal modulation itself supplies the bit timing; a transmission starts with a known signal. The receiver uses a screen detector, extracts the screen area, divides it into grids, samples a subset of pixels, and uses FFT decoding. This is elegant when the sender controls the rendering stack, but it shifts the hard problem to screen extraction, exposure, scene luminance, and platform-specific alpha APIs.

**Error correction.** The preliminary “HiLight basic” design used Vandermonde Reed–Solomon erasure coding. The final system’s main improvements are adaptive alpha and scene-aware handling; the headline paper does not present HiLight as a high-redundancy file protocol. Treat its reported accuracy as a communication-channel result, not as verified file integrity.

**Rate and benchmark.** With a Samsung Tab S sender and iPhone 5s receiver, 112 images, 60 video clips, web browsing, and games, HiLight reports **1.1 kbit/s** at 91% accuracy for static scenes and lower rates for dynamic scenes; the paper summarizes 1.1 kbit/s with 84–91%+ accuracy across scene types. Encoding and decoding delays were below 8.3 ms even for 1080p frames. It worked up to about 1 m and a 60° viewing angle on the 10.5-inch tablet, with stable indoor operation above about 40 lux. Other cameras produced several kbit/s in the paper’s expanded tests, but the iPhone 5s result is the appropriate phone baseline.

**Hardware and failure modes.** The sender must be able to add an alpha overlay/GPU layer and, in the original implementation, access display content for scene detection. Dark content provides little intensity headroom; dynamic content, cut scenes, low light, camera noise, perspective, and phone API restrictions reduce reliability. The temporal signal is unobtrusive but intentionally low rate.

**Modern-phone relevance.** High for unobtrusive side channels and low for bulk file transfer. HiLight shows that “no animated QR visible to the user” is possible on an application-controlled display, but its rate is three orders of magnitude below the dense visible systems. It is a useful fallback/control-channel concept, not Wayfinder’s bulk-transfer core.

### 7. ChromaCode

**Primary source.** Zhang et al., “ChromaCode: A Fully Imperceptible Screen-Camera Communication System,” MobiCom 2018, [DOI 10.1145/3241539.3241543](https://doi.org/10.1145/3241539.3241543), [paper PDF](https://cswu.me/papers/mobicom18_chromacode_paper.pdf).

**Protocol and modulation.** ChromaCode embeds a spatial code by modulating CIELAB lightness, adapting strength to image texture and local lightness. Successive frames use complementary positive/negative perturbations. The receiver therefore sees a machine-readable difference while the human viewer sees almost no change. A 120 fps video pipeline and full-frame preprocessing are central assumptions.

**Markers, tracking, and synchronization.** The code frame has black/white borders and four featured lines. Repeated preambles provide frame identification and coding parameters. The border lines support code detection, localization, normalization, data-block recognition, and rolling-shutter correction; one featured pattern identifies the sign flip caused by rolling shutter. This is a much more complete hidden-code framing system than simply hiding random bit noise in a video.

**Error correction.** The preamble carries sequence and coding-level fields protected by BCH. The data path uses an outer Reed–Solomon code and an inner convolutional code, with interleaving across 16 blocks and soft-decision Viterbi decoding before RS repair. The design supports multiple coding rates.

**Rate and benchmark.** The paper reports about **777 kbit/s raw** and about **120 kbit/s data goodput**, with roughly 0.05 BER in the evaluated setup; a 20-person study found the modulation fully imperceptible. These values assume a 120 fps monitor, a computer sender, and an Android receiver. The authors state that code/data were available on request rather than through a maintained public repository.

**Modern-phone relevance.** Medium. The complementary-frame idea, border-based rolling-shutter correction, adaptive strength, and concatenated coding are valuable. The 120 Hz sender, full-frame video encoding, and hidden perturbation calibration are not universal. It is a better model for a future “normal video plus side data” mode than for Wayfinder V1 file transfer.

### 8. AIRCODE

**Primary source.** Qian et al., “AIRCODE: Hidden Screen-Camera Communication on an Invisible and Inaudible Dual Channel,” NSDI 2021, [USENIX paper page](https://www.usenix.org/conference/nsdi21/presentation/qian) and [PDF](https://www.usenix.org/system/files/nsdi21-qian-kun.pdf).

**Protocol and channels.** AIRCODE combines a high-rate invisible visual channel with a low-rate, nearly inaudible audio channel. Complementary lightness modulation carries the visual payload; the audio path communicates layout/coding metadata and control. The split acknowledges that bootstrapping a visual decoder is difficult when there are no visible markers.

**Markers, tracking, and synchronization.** The visual receiver uses ORB features and visual odometry to build a 3D map, isolate the screen from in-screen video features, estimate the four screen corners, and correct perspective. It does not rely on a persistent visible barcode border. The audio preamble and short control packets provide out-of-band initialization. Reported tracking succeeds on over 97% of frames across tested video types, with about 0.79 s average initialization; localization errors above roughly 15 pixels cause the link to fail in the reported analysis.

**Error correction and rate.** The visual path uses adaptive concatenated coding (shown with RS and convolutional coding levels) plus interleaving; the audio metadata path uses short robust coded packets. The paper reports about **1,069 kbit/s / roughly 1 Mbit/s visual rate** at around **5% BER**, plus the nearly-zero-PER audio control channel. That BER still requires an application-level file protocol; it is not a completed file-success claim.

**Hardware assumptions and failure modes.** AIRCODE assumes a monitor with at least about 120 Hz, a smartphone camera, and a usable speaker/microphone path. Screen tracking, camera motion, rolling shutter, Moiré, dynamic video interference, exact initialization, muted/quiet audio, and high-refresh display availability are failure modes. The audio side-channel also introduces privacy and deployment constraints.

**Modern-phone relevance.** High for research direction, medium for a camera-only product. Modern phones can support visual odometry and fast video, but a generic laptop/phone sender may not provide a 120 Hz display or a clean inaudible audio path. AIRCODE’s strongest transferable idea is a separate low-rate bootstrap/control channel; Wayfinder can implement the same logical role inside a visible locator/bootstrap frame without requiring a microphone.

### 9. DeepLight

**Primary source.** Tran et al., “DeepLight: Robust & Unobtrusive Real-time Screen-Camera Communication for Real-World Displays,” IPSN 2021, [arXiv paper](https://arxiv.org/abs/2105.05092) and [project/presentation material](https://gihanjayatilaka.github.io/projects/deeplight/presentation.pdf).

**Protocol and modulation.** DeepLight uses a learned decoder that jointly interprets the spatial bits in a frame rather than requiring exact isolation of each bit cell. It modulates primarily the blue channel to reduce visible artifacts and uses an object-detection model to find the screen.

**Markers, tracking, and synchronization.** Screen detection is learned rather than based on a visible finder pattern. The DNN decoder tolerates screen-extraction errors and spatial interference that would make a deterministic cell-by-cell decoder fail. This is a useful modern alternative to ever more elaborate markers, but it requires a trained model and a stable inference pipeline.

**Rate and benchmark.** The paper reports screen IoU of at least 83%, frame error rate below 0.2, and **at least 0.95 kbit/s goodput** with a human-held smartphone camera at about 2 m. The rate is deliberately moderate because the goal is robust unobtrusive communication, not file transfer.

**Modern-phone relevance.** Medium. On-device neural inference is now more practical than in 2021, but model size, camera variation, training data, and thermal/energy cost complicate a small cross-platform sender/receiver. A learned screen detector could be an optional enhancement after a deterministic V1 path; it should not be the only bootstrap mechanism.

### 10. InFrame++

**Primary source.** Wang et al., “InFrame++: Achieve Simultaneous Screen-Human Viewing and Hidden Screen-Camera Communication,” MobiSys 2015, [DOI 10.1145/2742647.2742652](https://doi.org/10.1145/2742647.2742652), with an [author-hosted PDF](https://anranw.me/papers/inframepp.pdf).

InFrame++ multiplexes ordinary video and complementary data frames on a high-refresh display. It combines hierarchical frame structure, CDMA-like modulation, visual guard/reference material, and optional RS coding so a human sees normal video while a camera receives an embedded data stream. The prototype reports **150–240 kbit/s at 120 fps**, up to about **360 kbit/s** at a more aggressive data-to-video ratio, on a 24-inch LCD with smartphones including Galaxy S5 and Note 3. The paper reports that visual guard and channel-reference structures reduce errors caused by rolling shutter, but also notes that frame erasures still need recovery mechanisms.

This is stronger than HiLight for hidden throughput but still assumes a 120 fps sender, carefully composed video, and a receiver that can observe the temporal multiplexing. It is a compelling proof that “hidden” need not mean one bit per slowly varying alpha grid; it is not a drop-in browser file-transfer protocol.

### 11. PassiveCam and other adjacent newer work

[Passive Screen-to-Camera Communication](https://arxiv.org/abs/2403.16185) (“PassiveCam”) uses transparent passive displays illuminated by ambient light. Its real-time application reports about 530 ms static and 1,071 ms handheld response times and about 90% packet success in the abstract. It is relevant to future zero-power tags, but not a stronger bulk-file system: the passive optical budget and image quality constrain rate.

As a practical baseline, the [Optical File Transfer Android listing](https://play.google.com/store/apps/details?id=pl.pwrobel.opticalfiletransfer) describes QR-stream transfer without Wi-Fi, Bluetooth, or NFC and warns that small transfers can be time-consuming and may not work reliably across phones. It is not a peer-reviewed benchmark, but it confirms the product gap: users need a file-level success guarantee, not merely a sequence of decodable images.

## Cross-system comparison

| System | Physical layer / modulation | Marker and synchronization strategy | Recovery | Reported rate / reliability | Hardware assumption | Modern-phone judgment |
| --- | --- | --- | --- | --- | --- | --- |
| PixNet | 2D spatial OFDM, 4-QAM | Corner detection, perspective-aware sampling; no phone-friendly frame protocol | RS in phone comparison; frequency-domain adaptation | Up to 12 Mbit/s at 10 m on LCD + high-end cameras; 6.4 kbit/s and 12.4% correct frames in phone comparison | 30-inch LCD, high-end/fast cameras, FFT | High research value, low direct portability |
| COBRA | 4-color blocks, adaptive block size | Color corners and timing blocks; display ≤ about half capture rate assumption | 3/7 RS-style comparison; discard bad frames | 91–172 kbit/s typical table points; 225 kbit/s peak with about 51% correct frames at one setting | 2012 Android phones, 30 fps receiver | Good visible-code baseline |
| RainBar | 4-color, 2 bits/block | Corner trackers, three locator columns, four tracking bars, sequence/display-rate header | CRC + RS; sequence/retransmission path | 955.68 kbit/s best stated point; above 91% decoding at one 18 fps setting | Two Galaxy S4 phones, 1080p/13 MP | Best named protocol design for robust visible transfer |
| Cimbar | Hash-classified tile symbols plus color bits | Three corners, triangulation, perspective transform, drift tracking | RS, interleaving, Wirehair fountain envelope, zstd | About 852 kbit/s sustained / 106 kB/s on Snapdragon 625; sub-1% target error in project notes | Android/OpenCV receiver, large filled screen | Highest practical open-source baseline |
| Strata | Recursive hierarchical spatial/temporal blocks | Layered code; exact wire details not available in accessible primary text | Layer independence; exact ECC not established here | Extended operating range, lower peak capacity; no comparable rate found | Heterogeneous phone cameras/resolutions | Strong adaptive-rate concept |
| HiLight | Alpha/translucency BFSK over arbitrary content | Temporal preamble and fixed windows; screen detector, no visible marker | Preliminary RS erasure coding; scene-aware repeats | 1.1 kbit/s, 84–91%+ accuracy; sub-8.3 ms processing | Alpha-capable GPU/display, 60 Hz | Excellent hidden side channel, not bulk files |
| InFrame++ | Complementary frames, hierarchical structure, CDMA-like modulation | Visual guard and channel reference; 120 fps timing | RS and erasure handling | 150–240 kbit/s, up to 360 kbit/s at aggressive ratio | 120 fps monitor + phone video | Strong hidden video direction |
| ChromaCode | CIELAB adaptive lightness, complementary frames | Borders/featured lines and repeated preamble; rolling-shutter sign correction | BCH + convolutional + RS, interleaved | 777 kbit/s raw; about 120 kbit/s goodput; ~0.05 BER | 120 fps monitor, video encoder, Android | Strong hidden-code techniques, sender constraint |
| AIRCODE | Invisible visual channel plus inaudible audio control | Visual odometry/ORB screen tracking; audio bootstrap | Adaptive RS/conv. coding and interleaving | ~1.069 Mbit/s visual, ~5% BER; >97% tracking frames | ≥120 Hz monitor, phone camera + mic/speaker | Strongest architecture, not camera-only |
| DeepLight | Blue-channel imperceptible spatial modulation, DNN decoder | Learned screen detection and collective decoding | Learned robustness; no file envelope demonstrated | ≥0.95 kbit/s goodput, FER <0.2, IoU ≥83% | Smartphone inference at about 2 m | Robustness idea, low rate |

## What transfers to modern phones—and what does not

### Techniques that still transfer

- **A small, explicit bootstrap.** Every successful system needs a way to find the screen and determine geometry, rate, or coding mode. Three corners plus a perspective transform (Cimbar), progressive locators (RainBar), or learned screen extraction (DeepLight) are better than assuming a perfectly cropped image.
- **Receiver-adaptive spatial density.** COBRA’s block-size adaptation and Strata’s layers address the real variable: pixels per logical cell at the camera, not the sender’s nominal screen resolution.
- **Interleaving and file-level rateless recovery.** Interleaving prevents a glare patch from destroying one contiguous file region. Fountain coding makes missed frames, late starts, and out-of-order camera delivery normal rather than exceptional.
- **Separate confidence from decoded payload.** A frame should carry a sequence ID, coding mode, payload length, CRC, and confidence/quality evidence. A visually plausible but wrong frame is more dangerous than a dropped one.
- **Model the camera pipeline.** Exposure, focus, auto-white-balance, rolling shutter, stabilization, ISP sharpening, and video-frame delivery are part of the channel. CPU/FFT speed alone does not determine usable rate.
- **Use rate as a control loop.** A receiver should select cell size, color mode, crop, exposure hints, and redundancy from observed decode confidence. A fixed “maximum-density” format is usually operating outside its optimum.

### Techniques that do not transfer unchanged

- **PixNet’s headline rate.** Its display and camera are not a modern-phone baseline; the phone comparison exposes the decoder and sampling cost.
- **Fixed 2012 camera-rate assumptions.** COBRA’s two-to-one display/camera timing rule is not sufficient for current rolling-shutter video APIs and variable frame delivery.
- **Large marker budgets.** RainBar’s robust layout is instructive, but copying every locator and border reduces payload and leaves a visible animated barcode. V1 should measure the minimum bootstrap needed for a given crop and mode.
- **High-refresh hidden links as the default.** ChromaCode, InFrame++, and AIRCODE are compelling at 120 Hz, but many laptop and phone screens remain 60 Hz and browser APIs do not promise precise scanout timing.
- **Alpha-channel assumptions.** HiLight requires sender-side control of a compositing layer and, in its prototype, access to display content. A generic web page cannot assume those APIs.
- **BER as the product metric.** A 5% BER or 90% frame accuracy may still be useless for a file unless the outer protocol proves completion and integrity.

## Present bottlenecks

1. **Geometry is the first hard problem.** A few pixels of screen-corner or cell-grid error can create correlated symbol errors across a frame. Markers solve this at a visual cost; hidden systems need odometry or learned extraction.
2. **The camera is the rate limiter.** The receiver sees exposure-integrated, color-corrected, rolling-shutter samples—not the sender’s rendered pixels. Blur and frame mixing destroy the smallest cells first.
3. **Timing is implicit and unreliable.** Display refresh, camera capture, compositor scheduling, and video-frame delivery are independent clocks. A frame ID and temporal marker are needed even when the sender claims a stable fps.
4. **Color is device-dependent.** LCD/OLED primaries, brightness, auto-white-balance, gamma, ambient light, and screen reflections shift a nominal red/green/blue palette. Luminance-only or adaptive color classification is more portable, but reduces bits per cell.
5. **Visible density conflicts with usability.** Dense animated barcodes block the screen, look unattractive, and reveal that a transfer is occurring. Hidden modulation removes the UX cost but usually needs high refresh, sender preprocessing, or much lower rate.
6. **Reliable file transfer is an outer-layer problem.** It requires a manifest, total size, content hash, fragment IDs, CRCs, replay/late-join behavior, duplicate suppression, loss/reorder tolerance, and completion acknowledgement or a statistically justified fountain threshold.
7. **Evaluation is under-specified.** Papers often report the best operating point, raw throughput, or correct-frame rate. A product needs a matrix over phone models, screen sizes, 30/60 fps, distance, angle, light, focus, and hand motion, with time-to-first-byte, file-success probability, verified goodput, and energy.

## Clearest Wayfinder V1 opportunity

The recommended target is a **reliable one-way camera file link for 1–10 MB payloads across ordinary modern phone/laptop displays**, not a new animated QR replacement. The protocol should use a non-QR, dense tile field as the physical layer, but make the following product-level behaviors first-class:

1. **Persistent but small bootstrap:** a compact locator/header identifies the screen, perspective, cell grid, frame ID, mode, payload length, and coding parameters. Keep it smaller and less visually barcode-like than a full QR finder layout, but do not hide geometry until reliability is proven.
2. **Receiver-selected modes:** begin with a conservative luminance/four-color mode, estimate pixels per cell and decode confidence, then request or select denser/lower-redundancy modes when the camera can support them. A two- or three-mode Strata-inspired design is enough for V1.
3. **File envelope before peak modulation:** manifest + content hash, fragment sequence, per-frame CRC, interleaving, and fountain/rateless repair. Make frames independently useful so a receiver can join late and survive hand motion without restarting.
4. **Confidence-driven sender pacing:** the sender should slow, repeat, or increase redundancy when the receiver’s observed quality falls. If no reverse radio/control channel is available, use a conservative schedule with repeated coded blocks; if an optional reverse path exists, treat it as an optimization rather than a requirement.
5. **Modern camera handling:** request a stable preview/video mode, crop to the tracked quadrilateral, avoid relying on color auto-calibration, and explicitly measure frame drops, rolling-shutter mixing, exposure changes, and motion blur. The implementation should report file goodput, not only symbol throughput.
6. **Honest operating envelope:** optimize for a hand-held 0.5–2 m link, moderate obliqueness, 30/60 fps receivers, and ordinary indoor lighting. A lower but verified 100–500 kbit/s file goodput under these conditions is a better V1 outcome than a fragile 1 Mbit/s headline.

This targets the gap between the two best existing baselines: **Cimbar’s open, dense, file-aware implementation** and **RainBar’s explicit reliability/tracking design**. It benefits from Strata’s adaptation and AIRCODE’s control-channel separation without requiring a 120 Hz display, a microphone, a DNN, or a visually hidden video side channel. The novelty is therefore in making the complete link dependable and measurable on modern phones—not in reproducing an animated QR user experience with a different symbol shape.

### Suggested V1 acceptance test

For each sender/receiver pair, transfer a 10 MB file and verify its final hash. Test 30 and 60 fps capture, 0.5/1/2 m distance, 0°/30°/45° view angle, bright/normal/dim indoor light, and controlled hand motion. Record:

- time to first valid payload;
- verified file goodput;
- probability of complete hash-verified transfer;
- received-frame, dropped-frame, duplicate-frame, and corrected-symbol counts;
- peak memory, CPU, battery, and thermal behavior;
- recovery after a late join, temporary occlusion, and a five-second camera pause.

That benchmark would answer the practical question the older papers leave open: not “how many bits fit in one perfect frame?” but “how quickly does an ordinary person get an intact file?”

## Primary source index

- [Cimbar](https://github.com/sz3/cimbar), [libcimbar](https://github.com/sz3/libcimbar), [performance](https://github.com/sz3/libcimbar/blob/master/PERFORMANCE.md), [details](https://github.com/sz3/libcimbar/blob/master/DETAILS.md), [CFC](https://github.com/sz3/cfc)
- [COBRA DOI](https://doi.org/10.1145/2307636.2307645), [project page](https://aiot.ie.cuhk.edu.hk/2012/09/01/cobra-color-barcode-streaming-for-smartphone-systems/)
- [RainBar DOI](https://doi.org/10.1109/ICDCS.2015.61)
- [PixNet DOI](https://doi.org/10.1145/1859995.1860012), [author PDF](https://people.csail.mit.edu/nabeel/pixnet-mobicom10.pdf)
- [Strata DOI](https://doi.org/10.1145/2639108.2639132)
- [HiLight DOI](https://doi.org/10.1145/2742647.2742667), [project/source page](https://dartnets.cs.dartmouth.edu/hilight), [GitHub](https://github.com/Tianxing-Dartmouth/HiLight)
- [InFrame++ DOI](https://doi.org/10.1145/2742647.2742652), [author PDF](https://anranw.me/papers/inframepp.pdf)
- [ChromaCode DOI](https://doi.org/10.1145/3241539.3241543), [paper PDF](https://cswu.me/papers/mobicom18_chromacode_paper.pdf)
- [AIRCODE USENIX page](https://www.usenix.org/conference/nsdi21/presentation/qian), [PDF](https://www.usenix.org/system/files/nsdi21-qian-kun.pdf)
- [DeepLight arXiv](https://arxiv.org/abs/2105.05092)
- [PassiveCam arXiv](https://arxiv.org/abs/2403.16185)
- [Animated barcode patent US8342406B2](https://patents.google.com/patent/US8342406B2/en), [streamed barcode patent US8770484B2](https://patents.google.com/patent/US8770484B2/en), [color barcode patent US9454688](https://patents.google.com/patent/US9454688/en)

Patents are included as prior-art pointers only; this is not a freedom-to-operate or legal analysis.
