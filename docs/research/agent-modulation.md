# Modulation research findings for Wayfinder

Research note for the camsend Wayfinder map. Updated 2026-07-31. Sources are primary papers, standards, official project pages, or first-party implementations. The recommendation below is an experiment plan; it does not supersede [ADR-0001](../adr/0001-version-one-optical-protocol.md).

## Executive finding

For a screen-to-camera file link, the useful objective is verified application goodput, not nominal bits per displayed pixel. A receiver must survive projective geometry, blur, exposure and colour changes, unsynchronised display/camera timing, frame drops or mixtures, and contiguous obstruction. The primary literature treats these as coupled channel problems rather than as a barcode-only problem.

The lowest-risk V1 is therefore the ADR's visible tiled stream with calibrated luminance payload, strong geometric markers, explicit frame identity, erasures/soft confidence, and unordered cross-frame recovery. The modulation work should compare that baseline against a four-colour payload and a colour-plus-glyph candidate under the same layout and recovery stack. Eight-colour, high-order QAM/OFDM, rolling-shutter exploitation, and imperceptible temporal embedding belong in measured follow-up modes, not in the default acceptance path.

## Primary-source findings

### Optical camera communication is a sampled, distorted channel

- **VCode** established the streaming model directly relevant to CamSend: arbitrary data is split into a sequence of 2-D barcode images, shown on a flat-panel display, captured by a phone camera, decoded in real time, and written to a file. This validates animated/streaming barcodes as a file-transfer primitive, but does not remove the need for frame identity and recovery. [Liu, Doermann & Li, “VCode—Pervasive Data Transfer Using Video Barcode,” IEEE Transactions on Multimedia, 2008](https://doi.org/10.1109/TMM.2008.917353).
- **LightSync** measured four phone cameras whose capture rates varied from 8 to 30 fps and identified lost original frames and mixed frames when the display changed too quickly. It used in-frame colour tracking plus linear erasure coding across frames, and reported more than doubled average throughput over prior approaches in its experiments. The implication for V1 is that frame cadence, mixture detection, and cross-frame recovery are part of modulation. [Hu, Gu & Pu, “LightSync: Unsynchronized Visual Communication over Screen-Camera Links,” MobiCom 2013](https://doi.org/10.1145/2500423.2500437).
- A systematic display-camera measurement study identifies projective geometry, moiré, rolling shutter, blocking, autofocus inconsistency, trembling, and vibration as unstable channel factors. It argues for calibrated, repeatable measurements rather than renderer-only bitrate claims. [Chen & Mow, “A Systematic Scheme for Measuring the Performance of the Display-Camera Channel,” arXiv:1501.02528](https://arxiv.org/abs/1501.02528).
- **IEEE 802.15.7a-2024** confirms that optical camera communication is now treated as a distinct higher-rate, longer-range optical-wireless PHY area. Its scope is broader and more hardware-oriented than Wayfinder, so it is a standards reference, not evidence that a specific phone/browser alphabet will work. [IEEE 802.15.7a-2024](https://standards.ieee.org/ieee/802.15.7a/10367/).

### Animated and colour barcodes

- **COBRA** designed a colour barcode stream for smartphone systems and adapted block size/layout to blur and low-speed cameras, with a real-time Android implementation and evaluation. It supports using larger, more separable cells as a robustness control rather than fixing one density for every camera. [Hao, Zhou & Xing, “COBRA: Color Barcode Streaming for Smartphone Systems,” MobiSys 2012](https://doi.org/10.1145/2307636.2307645).
- **RainBar** integrated capacity, synchronization, and extraction in one colour-barcode layout. Its primary contributions include in-frame locators, progressive locator detection/localization, and robust colour recognition; Android experiments evaluated throughput under varied working environments. The lesson is that a colour alphabet needs pilots/locators and a channel-aware decoder, not only a palette table. [Wang et al., “RainBar: Robust Application-Driven Visual Communication Using Color Barcodes,” ICDCS 2015](https://doi.org/10.1109/ICDCS.2015.61).
- **JAB Code** is a useful standardised colour/geometric reference: it defines coloured modules in square or rectangular grids, a primary symbol with four finder patterns, optional cascaded secondary symbols, error correction, dimensions, and a reference decoder. It demonstrates that colour, geometry, and recovery can be specified together; it does not prove that its full palette is optimal for an unsynchronised browser-camera stream. [ISO/IEC 23634:2022, JAB Code](https://www.iso.org/standard/76478.html).
- Microsoft’s first-party HCCB description reports higher density from a different symbol shape combined with multiple colours, symbol-size adaptation for imaging fidelity, and real-time video-stream decoding. It reports eight-colour laboratory results and improved decode conditions from larger symbols, but the page describes a proprietary product lineage and a scanner-oriented evaluation, so it is design evidence rather than a CamSend dependency. [Microsoft Research, “High Capacity Color Barcodes (HCCB)”](https://www.microsoft.com/en-us/research/project/high-capacity-color-barcodes-hccb/).

### Glyphs, geometric patterns, and spatial modulation

- **ShiftCode** replaces conventional colour-bit cells with shifting shape patterns. The paper explicitly targets rolling-shutter frame mixtures, adds intra-frame reliability and inter-frame redundancy, and reports at least a two-fold goodput improvement over conventional screen-camera systems in its Android experiments. This is the strongest direct evidence for testing a glyph/geometric layer alongside luminance or colour. [Zhan et al., “Capturing the Shifting Shapes: Enabling Efficient Screen-Camera Communication with a Pattern-based Dynamic Barcode,” IMWUT 2018](https://doi.org/10.1145/3191784).
- **PixNet** generalises OFDM to LCD-camera links to address perspective distortion, blur, and ambient light; its prototype reports up to 12 Mb/s at 10 m and view angles up to 120 degrees. Those results demonstrate the potential of spatially distributed modulation, but the system is a specialised link with a more controlled signal-processing chain than an ordinary browser webcam. [Perli, Ahmed & Katabi, “PixNet: LCD-Camera Pairs as Communication Links,” MobiCom 2010](https://doi.org/10.1145/2043164.1851258).
- **DisCo** uses rolling-shutter sensors as part of display-camera communication and demonstrates a different spatial/temporal design point in which the display can carry a camera-readable signal while remaining visually unobtrusive. This supports a future rolling-shutter mode, not a V1 assumption: browser capture does not guarantee the timing controls or sensor behaviour required by that mode. [Jo, Gupta & Nayar, “DisCo: Display-Camera Communication Using Rolling Shutter Sensors,” ACM Transactions on Graphics, 2016](https://doi.org/10.1145/2896818).
- The primary **cimbar** implementation is a useful engineering reference for hybrid symbols: its documented standard configuration combines 16 image glyphs with four colours, nominally 6 bits per tile, and uses image-hash distance to separate glyphs. Its reported sustained benchmark is a project-specific measurement, not independent evidence for ordinary devices; the relevant finding is the testable design pattern of a spatial glyph alphabet plus a low-order colour alphabet. [sz3/libcimbar, first-party implementation](https://github.com/sz3/libcimbar).

### Greyscale, colour, and high-order modulation

- Binary QR and Data Matrix remain the most mature binary references: their current ISO specifications define symbol structure, dimensions, error correction, and reference decoding algorithms. They are appropriate baselines and fallback fixtures, although a custom animated stream still needs frame identity and cross-frame recovery. [ISO/IEC 18004:2024, QR Code](https://www.iso.org/standard/83389.html); [ISO/IEC 16022:2024, Data Matrix](https://www.iso.org/standard/80926.html).
- Four-state greyscale has a nominal 2 bits/cell and eight-state greyscale 3 bits/cell, but those levels are separated by luminance margins that exposure, gamma, clipping, blur, and local illumination can compress. The cited screen-camera sources do not establish a universal 4- or 8-PAM operating point; therefore greyscale must be calibrated per frame and measured as a channel, not selected from nominal bit count.
- Four-colour payload cells also provide 2 nominal bits/cell, while eight colours provide 3. The colour-barcode sources show the gain is practical only with colour recognition, pilots/calibration, geometry, and recovery. A direct primary comparison of 4-, 8-, and 16-CSK reports average classification accuracies of 100%, 96.4%, and 93.8% respectively in its evaluated LCD-to-smartphone setup, and shows confusion between neighbouring colours as the order increases. The setup is not Wayfinder’s exact channel, but it is direct evidence that alphabet expansion must be validated by an empirical confusion matrix. [Furano et al., “Data-Aided Color Shift Keying Transmission for LCD-to-Smartphone Optical Camera Communication Links,” MMSP 2020](https://doi.org/10.1145/3390525.3390534).
- High-order spatial modulation can win in controlled links. PixNet’s spatial OFDM result and later high-order camera-communication work show that equalization and channel estimation can recover more dense signals, but they move complexity into calibration, timing, and nonlinear image processing. That is a research track, not a reason to replace a diagnosable tiled V1.
- Imperceptible temporal/spatial modulation is a separate product objective. **ChromaCode** uses a perceptually uniform colour space, texture/lightness-adaptive embedding, and concatenated coding; its authors report over 700 kb/s raw and 120 kb/s data goodput in their prototype. This supports a future overlay mode, while its imperceptibility and content-adaptive assumptions conflict with a dedicated visible transfer screen. [Zhang et al., “ChromaCode: A Fully Imperceptible Screen-Camera Communication System,” MobiCom 2018](https://doi.org/10.1145/3241539.3241543).

### Soft decisions and symbol confusion

- **SoftLight** is the clearest primary source for retaining decoder uncertainty. It adds a colour modulation interface that outputs a confidence hint for each demodulated bit, treats the link as a bit-level erasure channel, and uses low-complexity bit-level rateless coding. Its Android evaluation reports a 22-KB photo transferred in 0.6 s and a 2.2x average goodput improvement over the state of the art in its test set. The generalizable design is confidence/erasure preservation plus rateless recovery; the measured rate is not a CamSend target. [Du, Liando & Li, “Soft Hint Enabled Adaptive Visible Light Communication over Screen-Camera Links,” IEEE TMC 2016](https://jansencl.github.io/publication/2016-04-07_TMC-2016).
- A symbol confusion matrix should be measured, not inferred from Euclidean palette spacing. For each candidate alphabet, transmit each known symbol at controlled geometry, blur, exposure, white-balance, angle, and motion conditions; count intended symbol on rows and decoded symbol or erasure on columns; normalize rows to conditional probabilities. The diagonal is correct classification, off-diagonal mass identifies specific confusions, and erasure mass is distinct from a wrong hard decision. The direct LCD-to-smartphone CSK study uses 4-, 8-, and 16-class confusion matrices and shows why this measurement is more informative than one aggregate accuracy. [Furano et al., MMSP 2020](https://doi.org/10.1145/3390525.3390534).
- For a hybrid tile, keep separate colour and glyph confusion matrices plus a joint matrix. Report nearest-vs-second-nearest distance or log-likelihood margin, local variance, saturation/clipping, and geometric residual alongside the hard label. A low margin should become an erasure/soft weight; it should not be forced into the nearest class before outer recovery. This is an engineering inference from the SoftLight and CSK findings, and should be validated by the measured goodput curve.

## Alphabet comparison for Wayfinder

| Candidate | Nominal payload density | Main failure mode | Calibration burden | V1 judgement |
|---|---:|---|---|---|
| Binary | 1 bit/cell before framing/FEC | More cells or frames for the same file | Low | Mandatory fallback and baseline |
| 4-level greyscale | 2 bits/cell | Adjacent levels collapse under exposure/gamma/blur | Per-frame luminance calibration | ADR-compatible robust payload candidate |
| 8-level greyscale | 3 bits/cell | Narrower level margins and more wrong hard decisions | Strong per-frame calibration and clipping detection | Measure only after 4-level mode |
| 4-colour | 2 bits/cell | White balance, gamut, ambient light, and neighbouring-colour confusion | Per-frame palette/channel estimate | Controlled comparison candidate |
| 8-colour | 3 bits/cell | More off-diagonal confusion and smaller colour margins | Strong calibration and per-device validation | Defer unless 4-colour wins clearly |
| Glyph/geometric | Depends on codebook | Blur, perspective, and tracking errors | Codebook, rectification, glyph confidence | Strong rolling-shutter/margin candidate |
| Colour + glyph hybrid | Sum of low-order colour and glyph bits | Either colour or glyph layer can fail; joint confusion matters | Both calibration paths plus joint confidence | Research candidate, not default |
| Spatial OFDM/high-order QAM | Potentially very high | Equalization/timing/geometry sensitivity | Channel estimation and specialised DSP | Defer |
| Imperceptible temporal/spatial | Content-dependent | Low signal margin and display/camera timing | Perceptual/content model | Future overlay mode |

The table’s nominal densities are information-theoretic counts before locator, calibration, framing, CRC, and recovery overhead. The selection metric must therefore be measured verified goodput, not the nominal column.

## Measurable V1 recommendation

### Decision

Keep the accepted ADR-0001 payload as the shipping V1: a visible projective tile stream with four corner fiducials, per-frame grayscale calibration, 2-bit calibrated luminance in robust mode, 4-bit calibrated luminance in dense mode, packet CRC, and unordered sparse-XOR/fountain recovery. Add two benchmark-only modulation candidates behind the same frame grammar:

1. **B1 binary:** two luminance states, same markers, header, frame sequence, CRC, and cross-frame recovery.
2. **G4 grayscale:** four calibrated luminance states, 2 bits/cell, same geometry and recovery.
3. **C4 colour:** four calibrated payload colours, 2 bits/cell, with repeated palette pilots; colour is also retained for markers.
4. **H4G16 hybrid:** four calibrated colours plus a 16-symbol glyph codebook, nominally 6 raw bits/tile before pilots, framing, and FEC. The glyph set must be generated from measured blur/perspective separability and versioned as part of the format; do not copy a proprietary codebook.

The ADR’s accepted robust/dense grayscale modes remain the compatibility path. C4 and H4G16 are hypotheses to falsify with the benchmark, not a protocol change by assertion.

### Common fixture and receiver outputs

All candidates must use the same display area, quiet margin, fiducials, projective rectification, tile pitch, frame header, sequence semantics, packet CRC, outer recovery, and file SHA-256 acceptance. Only the payload alphabet changes. Each tile decoder should emit:

- intended/decoded symbol for fixture tests;
- `erasure` when no class is sufficiently likely;
- nearest and second-nearest score and their margin;
- local luminance/chroma, variance, clipping/saturation indicators;
- glyph/image distance where applicable;
- rectification residual and frame-mixture suspicion;
- frame sequence, duplicate/drop status, and packet CRC result.

### Required measurements

Build a per-candidate symbol confusion matrix for each declared condition and report:

- row-normalized symbol confusion probabilities, including erasures;
- pre-recovery symbol substitution and erasure rates;
- frame detection, duplicate, drop, and mixed-frame rates;
- packet success and outer-code recovery overhead;
- CPU time and memory on browser and Android reference paths;
- verified file success probability;
- median and 10th-percentile verified goodput.

Use a fixed matrix of screen size/distance, camera class and observed FPS, viewing angle, focus/defocus, exposure and white-balance state, motion blur, glare, ambient light, and contiguous occlusion. The measurement scheme should record enough geometry and camera metadata to reproduce a run, following the calibration concerns identified by Chen & Mow ([measurement paper](https://arxiv.org/abs/1501.02528)).

Define verified goodput for an input of N bytes as:

\[
G_v = \frac{8N}{t_{SHA256\ success} - t_{first\ displayed\ frame}}
\]

The timer includes preamble, calibration, all displayed frames, duplicates, erasures, redundancy, decoding, and recovery. A run is successful only when exact length and SHA-256 match. Do not credit raw bits from a run that does not reconstruct the file.

Use the same acceptance gates for every alphabet:

- at least 95% verified-file success in each ordinary-condition stratum;
- at least 90% in each declared impairment stratum;
- among candidates passing the reliability gates, maximize geometric-mean verified goodput and report the worst-stratum 10th percentile.

The hybrid H4G16 hypothesis is supported only if it beats G4 and C4 on the same fixture without violating the reliability gates. C4 is worth adopting only if it beats G4/B1 after colour calibration and confusion-driven erasures are included. If neither condition holds, ship calibrated grayscale and retain colour/glyph as measured future modes.

## Sources

- [Liu, Doermann & Li, VCode, IEEE TMM 2008](https://doi.org/10.1109/TMM.2008.917353)
- [Hu, Gu & Pu, LightSync, MobiCom 2013](https://doi.org/10.1145/2500423.2500437)
- [Chen & Mow, display-camera measurement, arXiv:1501.02528](https://arxiv.org/abs/1501.02528)
- [Hao, Zhou & Xing, COBRA, MobiSys 2012](https://doi.org/10.1145/2307636.2307645)
- [Wang et al., RainBar, ICDCS 2015](https://doi.org/10.1109/ICDCS.2015.61)
- [Zhan et al., ShiftCode, IMWUT 2018](https://doi.org/10.1145/3191784)
- [Perli, Ahmed & Katabi, PixNet, MobiCom 2010](https://doi.org/10.1145/2043164.1851258)
- [Jo, Gupta & Nayar, DisCo, ACM TOG 2016](https://doi.org/10.1145/2896818)
- [Du, Liando & Li, SoftLight, IEEE TMC 2016](https://jansencl.github.io/publication/2016-04-07_TMC-2016)
- [Furano et al., data-aided CSK for LCD-to-smartphone OCC, MMSP 2020](https://doi.org/10.1145/3390525.3390534)
- [ISO/IEC 18004:2024, QR Code](https://www.iso.org/standard/83389.html)
- [ISO/IEC 16022:2024, Data Matrix](https://www.iso.org/standard/80926.html)
- [ISO/IEC 23634:2022, JAB Code](https://www.iso.org/standard/76478.html)
- [Microsoft Research, HCCB](https://www.microsoft.com/en-us/research/project/high-capacity-color-barcodes-hccb/)
- [sz3/libcimbar, first-party implementation](https://github.com/sz3/libcimbar)
- [Zhang et al., ChromaCode, MobiCom 2018](https://doi.org/10.1145/3241539.3241543)
- [IEEE 802.15.7a-2024, higher-rate OCC](https://standards.ieee.org/ieee/802.15.7a/10367/)
- [EMVA 1288, objective camera characterization](https://www.emva.org/standards-technology/emva-1288/)
