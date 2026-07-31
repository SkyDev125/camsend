import { clamp } from "./math.js";
import { detectMarkers, drawBlock, drawCell, layoutFor, MARKER_SIZE, markerLayout, project, samplePatch, solveHomography } from "./optical-frame.js";

// 64 binary 4x4 glyphs selected greedily from the 16-bit space with a minimum
// Hamming distance of six. The alphabet is deliberately fixed: a sender and
// receiver can be implemented independently and still agree on every symbol.
// A 12-pixel logical cell gives each glyph subcell roughly three camera pixels
// on a 144-cell-wide 1728px raster, which is a useful high-density stationary
// mode while preserving a robust grayscale fallback.
export const GLYPH6_CODEBOOK = Object.freeze([
  0, 63, 455, 504, 1611, 1652, 1932, 1971, 2709, 2730, 2898, 2925, 3294, 3297, 3353, 3366,
  12365, 12402, 12682, 12725, 13830, 13881, 14273, 14334, 15064, 15079, 15135, 15136, 15507, 15532, 15700, 15723,
  20630, 20649, 20817, 20846, 22237, 22242, 22298, 22309, 23043, 23100, 23492, 23547, 23624, 23671, 23951, 23984,
  24795, 24804, 24860, 24867, 26256, 26287, 26455, 26472, 27214, 27249, 27529, 27574, 27653, 27706, 28098, 28157
]);

// The 16 glyph4 symbols are the linear Boolean functions over four input
// bits. Any two non-identical functions differ in exactly eight of sixteen
// positions, giving a large hard-decision margin for motion and defocus.
const parity4 = (value) => { value ^= value >>> 2; value ^= value >>> 1; return value & 1; };
export const GLYPH4_CODEBOOK = Object.freeze(Array.from({ length: 16 }, (_, symbol) => {
  let pattern = 0;
  for (let position = 0; position < 16; position++) if (parity4(symbol & position)) pattern |= 1 << position;
  return pattern;
}));

const glyphDistance = (left, right) => {
  let value = (left ^ right) & 0xffff; let count = 0;
  while (value) { value &= value - 1; count++; }
  return count;
};

// A camera frame gives us a 16-bit observed glyph. Precompute the nearest
// alphabet entry once so decoding is O(cells), rather than comparing every
// observed cell against all 64 symbols on every frame.
const buildLookup = (codebook) => {
  const nearest = new Uint8Array(1 << 16); const distance = new Uint8Array(1 << 16); const secondDistance = new Uint8Array(1 << 16);
  for (let observed = 0; observed < (1 << 16); observed++) {
    let best = 0; let bestDistance = 17; let nextDistance = 17;
    for (let symbol = 0; symbol < codebook.length; symbol++) {
      const candidateDistance = glyphDistance(observed, codebook[symbol]);
      if (candidateDistance < bestDistance) { nextDistance = bestDistance; bestDistance = candidateDistance; best = symbol; }
      else if (candidateDistance < nextDistance) nextDistance = candidateDistance;
    }
    nearest[observed] = best; distance[observed] = bestDistance; secondDistance[observed] = nextDistance;
  }
  return { nearest, distance, secondDistance };
};

const GLYPH4_LOOKUP = buildLookup(GLYPH4_CODEBOOK);
const GLYPH6_LOOKUP = buildLookup(GLYPH6_CODEBOOK);

const readBits = (bytes, bitOffset, bitCount) => {
  let value = 0;
  for (let bit = 0; bit < bitCount; bit++) if (bytes[(bitOffset + bit) >>> 3] & (1 << ((bitOffset + bit) & 7))) value |= 1 << bit;
  return value;
};

const writeBits = (bytes, bitOffset, bitCount, value) => {
  for (let bit = 0; bit < bitCount; bit++) if (value & (1 << bit)) bytes[(bitOffset + bit) >>> 3] |= 1 << ((bitOffset + bit) & 7);
};

const fillBackground = (rgba, width, height) => {
  for (let index = 0; index < rgba.length; index += 4) { rgba[index] = 4; rgba[index + 1] = 4; rgba[index + 2] = 6; rgba[index + 3] = 255; }
};

const drawGlyph = (rgba, width, height, profile, cell, pattern) => {
  const x0 = Math.floor((cell.x * width) / profile.cols) + 1;
  const y0 = Math.floor((cell.y * height) / profile.rows) + 1;
  const x1 = Math.ceil(((cell.x + 1) * width) / profile.cols) - 1;
  const y1 = Math.ceil(((cell.y + 1) * height) / profile.rows) - 1;
  const cellWidth = Math.max(1, x1 - x0); const cellHeight = Math.max(1, y1 - y0);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const px0 = x0 + Math.floor((gx * cellWidth) / 4); const px1 = x0 + Math.floor(((gx + 1) * cellWidth) / 4);
    const py0 = y0 + Math.floor((gy * cellHeight) / 4); const py1 = y0 + Math.floor(((gy + 1) * cellHeight) / 4);
    const color = pattern & (1 << (gy * 4 + gx)) ? 248 : 8;
    for (let py = py0; py < Math.min(height, py1); py++) for (let px = px0; px < Math.min(width, px1); px++) {
      const offset = (py * width + px) * 4; rgba[offset] = color; rgba[offset + 1] = color; rgba[offset + 2] = color; rgba[offset + 3] = 255;
    }
  }
};

export const renderGlyphFrame = (encodedPacket, profileInput = "glyph6", { width, height } = {}) => {
  const layout = layoutFor(profileInput); const { profile } = layout;
  if (![4, 6].includes(profile.bitsPerCell)) throw new Error("Glyph renderer requires a 4-bit or 6-bit profile");
  const codebook = profile.bitsPerCell === 4 ? GLYPH4_CODEBOOK : GLYPH6_CODEBOOK;
  if (encodedPacket.length > layout.capacityBytes) throw new Error(`Packet ${encodedPacket.length} bytes exceeds ${layout.capacityBytes}-byte glyph capacity`);
  const frameWidth = width ?? profile.cols * 12; const frameHeight = height ?? Math.round(frameWidth * 9 / 16);
  const rgba = new Uint8ClampedArray(frameWidth * frameHeight * 4); fillBackground(rgba, frameWidth, frameHeight);
  const markers = markerLayout(profile);
  for (const marker of markers) drawBlock(rgba, frameWidth, frameHeight, profile, marker.cellX, marker.cellY, MARKER_SIZE, MARKER_SIZE, marker.rgb);
  for (const cell of layout.calibration) drawCell(rgba, frameWidth, frameHeight, profile, cell, [Math.round(cell.expected), Math.round(cell.expected), Math.round(cell.expected)]);
  for (let index = 0; index < layout.data.length; index++) drawGlyph(rgba, frameWidth, frameHeight, profile, layout.data[index], codebook[readBits(encodedPacket, index * profile.bitsPerCell, profile.bitsPerCell)] ?? 0);
  return { rgba, width: frameWidth, height: frameHeight, profile, layout };
};

export const decodeGlyphFrame = (rgba, width, height, profileInput = "glyph6") => {
  const layout = layoutFor(profileInput); const { profile } = layout;
  if (![4, 6].includes(profile.bitsPerCell)) return { ok: false, reason: "profile" };
  const lookup = profile.bitsPerCell === 4 ? GLYPH4_LOOKUP : GLYPH6_LOOKUP;
  const found = detectMarkers(rgba, width, height, layout);
  if (found.some((marker) => !marker)) return { ok: false, reason: "markers", diagnostics: { markerCount: found.filter(Boolean).length } };
  const source = layout.markers.map((marker) => [(marker.cellX + MARKER_SIZE / 2) / profile.cols, (marker.cellY + MARKER_SIZE / 2) / profile.rows]);
  const homography = solveHomography(source, found.map((marker) => [marker.x, marker.y]));
  if (!homography) return { ok: false, reason: "homography", diagnostics: { markerCount: 4 } };
  const calibration = layout.calibration.map((cell) => samplePatch(rgba, width, height, ...project(homography, (cell.x + 0.5) / profile.cols, (cell.y + 0.5) / profile.rows), 0));
  const black = calibration[0] ?? 0; const white = calibration[calibration.length - 1] ?? 255; const contrast = white - black;
  if (!Number.isFinite(contrast) || contrast < 24) return { ok: false, reason: "calibration", diagnostics: { calibration, contrast, homography } };
  const cellWidth = width / profile.cols; const cellHeight = height / profile.rows; const radius = Math.max(0, Math.round(Math.min(cellWidth, cellHeight) * 0.04));
  const observe = (cell, offsetX, offsetY) => {
    let observedPattern = 0;
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
      const u = (cell.x + (gx + 0.5) / 4) / profile.cols; const v = (cell.y + (gy + 0.5) / 4) / profile.rows;
      const [x, y] = project(homography, u, v); const normalized = clamp((samplePatch(rgba, width, height, x + offsetX, y + offsetY, radius) - black) / contrast, 0, 1);
      if (normalized >= 0.5) observedPattern |= 1 << (gy * 4 + gx);
    }
    const lookupKey = observedPattern & 0xffff;
    return [lookupKey, lookup.nearest[lookupKey], lookup.distance[lookupKey], lookup.secondDistance[lookupKey]];
  };
  // Marker centroids are sub-pixel noisy after rotation and rolling-shutter
  // resampling. A tiny global phase search recovers the grid alignment before
  // spending the full decode cost; the tie-breaker keeps the nominal phase.
  const phaseCandidates = [-1, -0.5, 0, 0.5, 1]; const phaseSampleCount = Math.min(1024, layout.data.length); let phaseX = 0; let phaseY = 0; let phaseScore = -1;
  for (const offsetX of phaseCandidates) for (const offsetY of phaseCandidates) {
    let score = 0;
    for (let sample = 0; sample < phaseSampleCount; sample++) { const index = Math.floor((sample * layout.data.length) / phaseSampleCount); const observed = observe(layout.data[index], offsetX, offsetY); score += (observed[3] - observed[2]) / 6; }
    score /= phaseSampleCount;
    if (score > phaseScore + 1e-6) { phaseScore = score; phaseX = offsetX; phaseY = offsetY; }
  }
  const encoded = new Uint8Array(layout.capacityBytes); const erasureScores = new Map(); const maxHardDistance = profile.bitsPerCell === 4 ? 3 : 2; let confidenceSum = 0; let lowConfidence = 0;
  for (const [index, cell] of layout.data.entries()) {
    const observed = observe(cell, phaseX, phaseY); const best = observed[1]; const bestDistance = observed[2]; const secondDistance = observed[3];
    const confidence = clamp((secondDistance - bestDistance) / 6, 0, 1); confidenceSum += confidence; if (confidence < 0.25) lowConfidence++;
    if (confidence < 0.45 || bestDistance > maxHardDistance) {
      const firstByte = Math.floor((index * profile.bitsPerCell) / 8); const lastByte = Math.floor((index * profile.bitsPerCell + profile.bitsPerCell - 1) / 8);
      const score = confidence - bestDistance / 16;
      for (let byte = firstByte; byte <= lastByte; byte++) if (score < (erasureScores.get(byte) ?? Infinity)) erasureScores.set(byte, score);
    }
    writeBits(encoded, index * profile.bitsPerCell, profile.bitsPerCell, best);
  }
  // Keep the most ambiguous bytes in each RS codeword. This prevents a large
  // blurred region from consuming erasure capacity in neighbouring codewords.
  const erasures = []; const maxErasuresPerCodeword = 4;
  for (let start = 0; start < layout.capacityBytes; start += 255) {
    for (const [byte] of [...erasureScores.entries()].filter(([position]) => position >= start && position < start + 255).sort((left, right) => left[1] - right[1]).slice(0, maxErasuresPerCodeword)) erasures.push(byte);
  }
  return { ok: true, encodedPacket: encoded, erasures, diagnostics: { markerConfidence: found.reduce((sum, marker) => sum + Math.min(1, marker.count / 100), 0) / 4, homography, calibration, calibrationContrast: contrast, calibrationSlope: contrast / 255, phaseOffset: [phaseX, phaseY], phaseScore, meanCellConfidence: confidenceSum / layout.data.length, lowConfidenceCells: lowConfidence, erasureBytes: erasures.length, sampledCells: layout.data.length } };
};
