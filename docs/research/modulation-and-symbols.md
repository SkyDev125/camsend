# Optical modulation and symbol alphabet

Research note for Wayfinder ticket “Optical modulation and symbol alphabet”. Updated 2026-07-31.

## Bottom line

The evidence supports the accepted Version 1 direction in [ADR-0001](../adr/0001-version-one-optical-protocol.md): a **visible, spatially tiled, calibrated-luminance stream**, carried in animated frames with explicit geometry, frame identifiers, erasures, and rateless/inter-frame recovery. The strongest higher-density challenger is a four-colour-plus-glyph hybrid, but it should be benchmarked as an experimental mode rather than silently replacing the accepted default.

- Use a large rectangular code region with a quiet margin, four strong corner locators, and a small number of repeated calibration/pilot cells.
- Encode the robust mode with calibrated two-bit luminance levels and the dense mode with calibrated four-bit luminance levels, as ADR-0001 specifies. Benchmark a low-order four-colour alphabet plus a deliberately separated geometric/glyph alphabet as a challenger; make ambiguous observations erasures rather than forced decisions.
- Treat every displayed image as a packet-bearing frame. Include stream ID, frame sequence, mode, tile geometry, payload length, and a per-frame integrity check. Do not require the receiver to see frames in order.
- Use a capture-safe initial cadence, then adapt frame duration and payload geometry from receiver observations. A faster mode may exploit mixed rolling-shutter frames later, but it should not be the baseline assumption.
- Apply interleaving and rateless/fountain recovery across frames. At the tile decoder, preserve a confidence value or erasure flag and let the outer code consume it.

This is a hypothesis to measure, not a claim that the hybrid alphabet is already proven best. The evidence supports each ingredient separately; the combined six-bit-per-tile design needs an apples-to-apples experiment against binary, four-colour, and QR baselines.

### Relationship to ADR-0001

This note does not reopen the accepted ADR. Its calibrated-luminance robust/dense modes are the V1 decision; the colour/glyph mode is a research challenger motivated by ShiftCode and libcimbar. If the challenger does not pass the reliability gate below, the ADR’s luminance design remains the recommendation.

## What the channel actually rewards

Screen-to-camera communication is not just a barcode scanned once. The receiver sees a sampled, blurred, geometrically transformed and colour-distorted sequence of display states. The key failure modes are:

1. **Spatial loss:** the screen is only partly visible, perspective-warped, out of focus, or motion-blurred. Small cells and high-order alphabets lose their margin first.
2. **Temporal loss:** display refresh and camera capture are unsynchronised. A captured image can contain a mixture of two displayed frames, or frames can be duplicated/dropped. LightSync measured camera rates from 8–30 fps and specifically reports lost and mixed frames when the sender changes too quickly ([Hu, Gu & Pu, LightSync](https://doi.org/10.1145/2500423.2500437)).
3. **Radiometric/colour loss:** exposure, white balance, ambient illumination, screen gamma, camera colour response, and channel cross-talk move the observed cell away from its nominal value. HCCB localisation work identifies camera colour balance, poor cellphone images, lighting, rotation, perspective, blur, and variable code density as consumer-reading problems ([Parikh & Jancke](https://doi.org/10.1109/WACV.2008.4544033)). A colour-barcode study likewise attributes density loss to chromatic and geometric distortions and the redundancy needed to correct them ([Querini & Italiano](https://doi.org/10.2298/CSIS131218054Q)).
4. **Obstruction/local corruption:** a hand, glare patch, or crop destroys a contiguous region. Interleaving and spatial redundancy are more useful than assuming independent uniformly random bit errors.

The practical consequence is that goodput is governed by **usable decoded bits per verified second**, not nominal bits per pixel. A larger alphabet can lose its theoretical advantage when colour classification, localisation, or retransmission overhead rises.

## Evidence by modulation family

### Binary and greyscale

Binary cells have the smallest alphabet and therefore the largest nominal decision margin. QR and Data Matrix are mature, widely implemented symbologies with explicit finder/locator structure and error correction. The current standards are [ISO/IEC 18004:2024 for QR Code](https://www.iso.org/standard/83389.html) and [ISO/IEC 16022:2024 for Data Matrix](https://www.iso.org/standard/80926.html); [ZXing](https://github.com/zxing/zxing) is a widely used open-source implementation supporting QR, Data Matrix, and Aztec.

For streaming, VCode established the basic model: arbitrary data is split into a sequence of 2D barcode images displayed on a flat panel and captured/decoded in real time by a camera ([Liu, Doermann & Li](https://doi.org/10.1109/TMM.2008.917353)). TXQR is a later, concrete open-source baseline that uses animated QR frames and fountain codes ([divan/txqr](https://github.com/divan/txqr)).

Binary is the best fallback and the most credible first localisation/debugging mode. Its weaknesses are lower spatial density and the need to transmit more frames. Greyscale multi-level pulse-amplitude modulation can add bits per cell, but exposure/gamma and camera noise make the levels unequal; the evidence below suggests using it only after calibration rather than as an unqualified default.

### Four-colour and eight-colour cells

Colour directly increases bits per cell: four classes carry two nominal bits and eight classes three. HCCB demonstrated a practical colour/glyph direction with coloured triangular symbols; Microsoft reports four/eight-colour variants, symbol-size adaptation, and blur/light-to-dark decoding in its project description ([Microsoft Research HCCB](https://www.microsoft.com/en-us/research/project/high-capacity-color-barcodes-hccb/)). HCCB is proprietary, so it is evidence for the design trade-off, not a suitable dependency.

COBRA made the colour-barcode idea specific to smartphone screen streams: it designed a 2D colour barcode for small screens and low-speed cameras, adapted block size/layout to blur, and evaluated real-time Android decoding ([Hao, Zhou & Xing](https://doi.org/10.1145/2307636.2307645)). Rain Bar added robust localisation and colour extraction for application-driven streaming ([Wang et al.](https://doi.org/10.1109/ICDCS.2015.61)); RainBar+ added adaptive barcode configuration and selective retransmission using an acoustic feedback channel ([Zhou et al.](https://doi.org/10.1109/TWC.2018.2873731)). The latter is not a pure screen-camera link because its feedback path is speaker-to-microphone, but its barcode-side techniques are relevant.

Colour requires pilots or a channel estimate. A colour-barcode theory paper shows why: observed colour depends on illuminant and viewing parameters, and proposes joint/subspace decoding rather than assuming a fixed reference palette ([Bagherinia & Manduchi](https://doi.org/10.1109/ICCVW.2011.6130335)). Complementary-colour OCC similarly uses pilot symbols to estimate the display-to-camera channel before decoding data ([Jung et al.](https://doi.org/10.1155/2020/3898427)).

Eight colours are not automatically better. The open libcimbar implementation reports that its eight-colour mode has been inconsistent and was removed from the preferred configuration, while its four-colour mode is the recommended balance ([libcimbar performance notes](https://github.com/sz3/libcimbar/blob/master/PERFORMANCE.md)). This is a repository self-report, not a controlled paper, but it is a useful warning for V1: four colours have a better evidence/risk ratio than eight.

### Glyph and geometric symbols

Geometry can carry information without requiring many narrowly spaced intensity levels. ShiftCode encodes bits with shifting shape patterns, explicitly targets the rolling-shutter frame-mixture problem, and adds intra-frame reliability plus inter-frame redundancy; its Android implementation reported at least a two-fold goodput improvement over conventional screen-camera systems ([Zhan et al.](https://doi.org/10.1145/3191784)).

The strongest practical example found is **cimbar**. Its tiles are selected from 16 binary image-hash-separated glyphs, with roughly 20 bits of Hamming distance between symbols; four colours add two further bits, giving a nominal six bits per tile. The decoder reports a tile distance/confidence, tracks local drift, interleaves error-correction chunks, and uses fountain coding for missing/out-of-order frames ([libcimbar details](https://github.com/sz3/libcimbar/blob/master/DETAILS.md)). Its published repository benchmark reports roughly 850 kbit/s sustained in a 1024×1024 animated code with four colours, but this is an author-maintained benchmark with a particular Android handset, not independent evidence for ordinary devices ([libcimbar performance](https://github.com/sz3/libcimbar/blob/master/PERFORMANCE.md)).

Colour/glyph combinations therefore have a credible path to high density, but they spend complexity on custom localisation, perspective correction, tile tracking, and decoder compatibility. They should be an experimental V1 mode with a binary fallback, not the only alphabet.

JAB Code is the strongest standardised colour/geometric reference found. Its basic symbols are coloured square modules in square or rectangular grids; a primary symbol has four corner finder patterns and secondary symbols can be cascaded. The specification includes structure, dimensions, cascading, error correction, and a reference decoder ([ISO/IEC 23634:2022](https://www.iso.org/standard/76478.html)); the authors’ implementation is [jabcode/jabcode](https://github.com/jabcode/jabcode). JAB is valuable as a geometry and multi-symbol reference, but the standard does not by itself prove that its full colour alphabet is optimal for a rolling-shutter screen stream.

### Spatial OFDM and high-order QAM

Spatial frequency-domain approaches use the whole display as a 2D signal rather than independent barcode cells. PixNet used spatial OFDM-like processing to address perspective, blur, ambient light, and wide view angle, reporting multi-megapixel/screen-camera rates in its prototype ([Perli, Ahmed & Katabi](https://doi.org/10.1145/1859995.1860012)). The underlying pixelated optical-channel work introduced spatial discrete multitone modulation to combat low-pass spatial distortion and alignment problems ([Hranilovic & Kschischang](https://www.ece.mcmaster.ca/~hranilovic/publications/articles/06/IEEEjstqe06.pdf)).

More recent work combines colour channels, 16/64-QAM, nonlinear equalisation, nonbinary coding, probabilistic shaping, and precoding, reporting 3.8–3.3× higher rates than earlier schemes at 60–160 cm ([Fujihashi et al., MERL technical report](https://www.merl.com/publications/TR2020-048)). These results show that high-order modulation is technically possible, not that it is the best V1 choice: it assumes a carefully engineered signal-processing chain, channel estimation/equalisation, and a controlled screen/camera geometry. It is a later high-throughput track.

### Imperceptible temporal/spatial embedding

Hidden communication papers are relevant to modulation, but their objective differs from CamSend’s visible file-transfer baseline. InFrame++ multiplexes complementary frames and CDMA-like structure, reporting 150–240 kbit/s at 120 fps with one data frame per 12 display frames, and up to 360 kbit/s at a 1:6 data/video ratio ([Wang et al.](https://doi.org/10.1145/2742647.2742652)). Uber-in-light uses complementary RGB intensity changes, MFSK, a dedicated synchronisation signal, and MUSIC demodulation ([Izz et al.](https://doi.org/10.1109/INFOCOM.2016.7524513)). High-rate flicker-free work adds content-adaptive spatial embedding and reports about 22 kbit/s average goodput while remaining flicker-free ([Nguyen et al.](https://doi.org/10.1109/INFOCOM.2016.7524512)).

ChromaCode moves further toward perceptual coding: it uses a perceptually uniform colour space, content/texture-adaptive embedding, concatenated coding, and reports over 700 kbit/s raw and 120 kbit/s goodput in its prototype ([project page and paper](https://walleve.github.io/ChromaCode/)). DeepLight avoids explicitly splitting the extracted screen into a perfect grid and instead decodes all spatial bits with a neural network; it modulates only the blue channel and reports frame error rate below 0.2 and at least 0.95 kbit/s goodput at about 2 m ([paper](https://doi.org/10.1145/3412382.3458269), [authors’ implementation](https://github.com/LARC-CMU-SMU/deeplight)). These systems support content-adaptive modulation and holistic decoding as future directions, but they add training data, model/runtime dependencies, or high-refresh/display assumptions. They should not displace a deterministic visible code in V1.

Two newer systems are worth tracking. **RescQR** recovers information from composite frames using a dedicated frame border, mixture separation, and Viterbi inference; its paper reports 400+ kbit/s goodput even with standard QR codes ([Han et al.](https://doi.org/10.1109/TMC.2023.3277212)). This is strong evidence that frame mixtures need not be discarded, but it is a specialised recovery path and not evidence that a higher-order alphabet is unnecessary under every condition. **Revelio** uses OKLAB temporal flicker fusion, spatially adaptive flicker, region-shape encoding, and a two-stage neural decoder; the available primary preprint says it targets asynchronicity and real-world distortion but reports only initial experiments ([Nishar et al.](https://doi.org/10.48550/arXiv.2501.02349)). It is promising for a future unobtrusive mode, not a V1 dependency.

## Comparison for ordinary screens and cameras

| Alphabet/modulation | Nominal density | Blur / perspective | Exposure / colour distortion | Rolling shutter / frame loss | V1 judgement |
|---|---:|---|---|---|---|
| Binary QR/Data Matrix | 1 bit/cell before code overhead | Best-understood; mature locators and decoders; still loses at tiny cells | Strongest margin; mostly insensitive to hue | Requires frame IDs and fountain/repetition for streaming | Mandatory baseline and fallback |
| Greyscale 4/8-PAM | 2–3 bits/cell | Level boundaries collapse under blur and gamma | Poor without per-frame calibration | No special advantage | Defer; use only as a measured variant |
| Four-colour matrix | 2 bits/cell | Good if cells remain large; localisation still geometric | Needs pilots, colour-space normalisation, and erasure decisions | Works with frame sequencing and redundancy | Good low-risk density mode |
| Eight-colour matrix | 3 bits/cell | Smaller decision margins | More sensitive to white balance, gamut and exposure | More wrong hard decisions when mixed | Defer until four-colour wins a controlled test |
| Glyph/geometric | Depends on glyph set | Can be blur-tolerant when codewords are well separated; custom warp/track required | More robust than pure colour if geometry survives | ShiftCode shows direct rolling-shutter benefit | Strong candidate for a spatial layer |
| Hybrid colour + glyph | 4–6+ bits/tile | Potentially best density/margin trade-off; needs larger tiles | Colour layer needs calibration; glyph layer supplies extra separation | Sequence, interleave, confidence and fountain coding fit naturally | V1 hypothesis, to be falsified by benchmark |
| Spatial OFDM / high-order QAM | Very high in controlled links | Equalisation can recover blur, but implementation is sensitive | Requires channel model and nonlinear equalisation | Not a simple frame-stream baseline | Research track, not V1 |
| Imperceptible temporal embedding | Content-dependent | Can use large regions, but subtle signals have low SNR | Perceptual colour/texture adaptation helps | Usually depends on refresh/camera timing and model decoding | Future unobtrusive mode |

## Soft decisions are a first-class design requirement

Hard nearest-symbol decisions discard the most useful information: whether a tile was clear, borderline, or nearly tied between two symbols. SoftLight makes this explicit. It extends colour modulation to produce a confidence “soft hint”, models the link as a bit-level erasure channel, and uses rateless coding; its Android experiments transmitted a 22 kB photo in 0.6 s and reported a 2.2× average goodput improvement over the state of the art ([Du, Liando & Li](https://doi.org/10.1109/INFOCOM.2016.7524510)).

CamSend should therefore expose, at minimum, for each tile:

- selected symbol or `erasure`;
- distance/margin to the nearest and second-nearest colour/glyph codewords;
- local brightness and saturation quality;
- geometric drift or sampling residual;
- frame-level integrity result.

The outer decoder should prefer high-confidence observations, interleave spatially, and request/recreate missing information through fountain symbols. This is more defensible than trying to tune one universal threshold for every camera and display.

## Proposed measurable V1 hypothesis

### Candidate modes

Implement the following as benchmark candidates, ordered from simplest to most ambitious:

1. **B1 binary:** QR-like square tiles with four corner locators, frame ID, CRC, and fountain-coded payload.
2. **L2 robust luminance:** four calibrated luminance levels, two payload bits per tile, using a repeated grayscale calibration strip.
3. **L4 dense luminance:** sixteen calibrated luminance levels, four payload bits per tile, using the same geometry and a stricter confidence/erasure threshold.
4. **H4G16 challenger:** four calibrated colours × 16 binary glyphs whose 8×8 image hashes are maximally separated. This is inspired by, but not copied from, libcimbar; the glyph dictionary must be generated and versioned as part of the format. Each payload tile carries six raw bits before pilots, framing, and FEC.

All modes use the same screen region, tile pitch, locator layout, frame metadata, interleaver, and measurement harness. That prevents the alphabet comparison from being confounded by a better locator or a larger code area. The L2 mode is the direct implementation hypothesis from ADR-0001; L4 and H4G16 are density challengers.

### Modulation schedule

- Begin with a short preamble containing a high-contrast border, mode/version, tile dimensions, display orientation, and a calibration palette.
- Display frames at a capture-safe cadence chosen by a small receiver-to-sender capability exchange. The fallback must tolerate a camera in the 8–30 fps range reported by LightSync; do not assume 120 fps.
- Every frame has a monotonically increasing sequence number and a payload identity. Repeated frames are harmless; missing/out-of-order frames are expected.
- Use interleaved frame payloads plus a rateless/fountain outer code. A frame is useful even if only a subset of its tiles decode.
- Initially reject mixed frames when the frame border or preamble is inconsistent. Add a RescQR-like composite-frame recovery experiment only after the deterministic baseline is measured.

### Selection criterion

For a transfer of original size (N) bytes, define verified goodput as:

\[
G_v = \frac{8N}{t_{SHA256\ success} - t_{first\ displayed\ frame}}
\]

The timer includes all preamble, calibration, display cadence, decoding, redundancy, duplicates, and recovery time. A run counts as successful only when the reconstructed file’s SHA-256 matches the sender’s hash.

Evaluate each candidate over the same matrix of screen size/distance, camera model and capture rate, perspective angle, defocus, motion blur, exposure/white-balance variation, glare, and 10/25/50% contiguous obstruction. Record frame detection rate, tile hard-error rate, tile erasure rate, frame mixture rate, CPU time, memory, energy if available, file-success probability, median (G_v), and 10th-percentile (G_v).

Use two gates:

- **Reliability gate:** at least 95% verified-file success in each ordinary-condition stratum and at least 90% in each declared impairment stratum.
- **Performance objective:** among candidates passing the gate, maximise the geometric mean of verified goodput across strata, while reporting the worst-stratum 10th percentile. The geometric mean prevents a mode that is spectacular in a clean lab but unusable under one common impairment from winning on average.

The ADR-aligned hypothesis is that L2 will maximise verified goodput in the impairment-heavy strata, while L4 will improve clean/ordinary-condition goodput without an unacceptable rise in erasures or file failures. H4G16 is supported only if it beats L4 on geometric-mean verified goodput without violating the reliability gate. If L4 or H4G16 fails, retain L2 as the dense-mode fallback and do not promote the more complex alphabet.

## Decisions and non-decisions

**Supported enough for V1:** animated frame streaming; explicit frame sequence numbers; strong geometric locators; calibrated low-order luminance modulation; interleaving; fountain/rateless recovery; soft tile confidence/erasures; adaptive frame rate or frame length; a binary fallback.

**Not supported enough to make the V1 default:** eight colours without a controlled win; greyscale/QAM without calibration and equalisation; spatial OFDM; imperceptible blue-only or OKLAB temporal embedding; a neural decoder; reliance on a second acoustic channel; or a claim that a published headline bitrate transfers to ordinary CamSend hardware.

## Primary sources and implementation references

- [ISO/IEC 18004:2024, QR Code](https://www.iso.org/standard/83389.html)
- [ISO/IEC 16022:2024, Data Matrix](https://www.iso.org/standard/80926.html)
- [ISO/IEC 23634:2022, JAB Code](https://www.iso.org/standard/76478.html)
- [IEEE 802.15.7-2018, short-range optical wireless communications](https://standards.ieee.org/ieee/802.15.7/6820/)
- [Liu, Doermann & Li, VCode, IEEE TMM 2008](https://doi.org/10.1109/TMM.2008.917353)
- [Perli, Ahmed & Katabi, PixNet, MobiCom 2010](https://doi.org/10.1145/1859995.1860012)
- [Bagherinia & Manduchi, A Theory of Color Barcodes, ICCV Workshops 2011](https://doi.org/10.1109/ICCVW.2011.6130335)
- [Hao, Zhou & Xing, COBRA, MobiSys 2012](https://doi.org/10.1145/2307636.2307645)
- [Hu, Gu & Pu, LightSync, MobiCom 2013](https://doi.org/10.1145/2500423.2500437)
- [Wang et al., RDCode, MobiCom 2014](https://doi.org/10.1145/2639108.2639135)
- [Wang et al., InFrame++, MobiSys 2015](https://doi.org/10.1145/2742647.2742652)
- [Wang et al., Rain Bar, ICDCS 2015](https://doi.org/10.1109/ICDCS.2015.61)
- [Izz et al., Uber-in-light, INFOCOM 2016](https://doi.org/10.1109/INFOCOM.2016.7524513)
- [Nguyen et al., spatially adaptive embedding, INFOCOM 2016](https://doi.org/10.1109/INFOCOM.2016.7524512)
- [Du, Liando & Li, SoftLight, INFOCOM 2016](https://doi.org/10.1109/INFOCOM.2016.7524510)
- [Zhan et al., ShiftCode, IMWUT 2018](https://doi.org/10.1145/3191784)
- [Zhang et al., ChromaCode, MobiCom 2018](https://walleve.github.io/ChromaCode/)
- [Jung et al., Complementary Color Barcode OCC, 2020](https://doi.org/10.1155/2020/3898427)
- [Bufalino et al., MAMBA, WoWMoM 2020](https://doi.org/10.1109/WoWMoM49955.2020.00059)
- [Fujihashi et al., High-Throughput Visual MIMO, IEEE TMC 2021](https://doi.org/10.1109/TMC.2020.2977042)
- [Tran et al., DeepLight, IPSN 2021](https://doi.org/10.1145/3412382.3458269)
- [Han et al., RescQR, IEEE TMC 2024](https://doi.org/10.1109/TMC.2023.3277212)
- [Ghiasi, Kaldenbach & Zúñiga, Passive Screen-to-Camera Communication, 2024](https://doi.org/10.1109/DCOSS-IoT61029.2024.00016)
- [Nishar et al., Revelio, ICASSP 2025 preprint](https://doi.org/10.48550/arXiv.2501.02349)
- [ZXing barcode library](https://github.com/zxing/zxing)
- [TXQR animated QR and fountain-code implementation](https://github.com/divan/txqr)
- [JAB Code implementation](https://github.com/jabcode/jabcode)
- [libcimbar colour-icon-matrix implementation](https://github.com/sz3/libcimbar)
- [DeepLight authors’ implementation](https://github.com/LARC-CMU-SMU/deeplight)
- [US8186572B2, systems and methods for animating barcodes](https://patents.google.com/patent/US8186572)
