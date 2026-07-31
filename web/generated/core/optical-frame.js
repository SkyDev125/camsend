import { clamp } from "./math.js";

export const PROFILES = Object.freeze({
  robust: Object.freeze({ name: "robust", cols: 112, rows: 63, bitsPerCell: 2, levels: 4, blockSize: 512 }),
  dense: Object.freeze({ name: "dense", cols: 144, rows: 81, bitsPerCell: 4, levels: 16, blockSize: 1536 })
});

const MARKER_SIZE = 7;
const MARKERS = Object.freeze([
  { name: "top-left", rgb: [255, 31, 110], x: 2, y: 2 },
  { name: "top-right", rgb: [0, 214, 143], x: -1, y: 2 },
  { name: "bottom-right", rgb: [47, 128, 255], x: -1, y: -1 },
  { name: "bottom-left", rgb: [255, 204, 51], x: 2, y: -1 }
]);

const getProfile = (profile) => typeof profile === "string" ? PROFILES[profile] : profile;
const key = (x, y) => `${x}:${y}`;

const markerLayout = (profile) => MARKERS.map((marker) => ({
  ...marker,
  cellX: marker.x < 0 ? profile.cols + marker.x - MARKER_SIZE + 1 : marker.x,
  cellY: marker.y < 0 ? profile.rows + marker.y - MARKER_SIZE + 1 : marker.y
}));

export const layoutFor = (profileInput) => {
  const profile = getProfile(profileInput);
  const reserved = new Set();
  for (const marker of markerLayout(profile)) {
    for (let y = marker.cellY; y < marker.cellY + MARKER_SIZE; y++) for (let x = marker.cellX; x < marker.cellX + MARKER_SIZE; x++) reserved.add(key(x, y));
  }
  const calibrationY = MARKER_SIZE + 3;
  const calibration = [];
  for (let index = 0; index < profile.levels; index++) {
    const cell = { x: 2 + index, y: calibrationY, expected: (index / (profile.levels - 1)) * 255 };
    calibration.push(cell);
    reserved.add(key(cell.x, cell.y));
  }
  const data = [];
  for (let y = 1; y < profile.rows - 1; y++) {
    for (let x = 1; x < profile.cols - 1; x++) if (!reserved.has(key(x, y))) data.push({ x, y });
  }
  return { profile, markers: markerLayout(profile), calibration, data, capacityBytes: Math.floor((data.length * profile.bitsPerCell) / 8) };
};

const drawCell = (rgba, width, height, profile, cell, color) => {
  const x0 = Math.floor((cell.x * width) / profile.cols) + 1;
  const y0 = Math.floor((cell.y * height) / profile.rows) + 1;
  const x1 = Math.ceil(((cell.x + 1) * width) / profile.cols) - 1;
  const y1 = Math.ceil(((cell.y + 1) * height) / profile.rows) - 1;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
    let offset = (y * width + Math.max(0, x0)) * 4;
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
      rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255; offset += 4;
    }
  }
};

const drawBlock = (rgba, width, height, profile, x, y, cellWidth, cellHeight, color) => {
  const x0 = Math.floor((x * width) / profile.cols) + 1;
  const y0 = Math.floor((y * height) / profile.rows) + 1;
  const x1 = Math.ceil(((x + cellWidth) * width) / profile.cols) - 1;
  const y1 = Math.ceil(((y + cellHeight) * height) / profile.rows) - 1;
  for (let py = Math.max(0, y0); py < Math.min(height, y1); py++) {
    let offset = (py * width + Math.max(0, x0)) * 4;
    for (let px = Math.max(0, x0); px < Math.min(width, x1); px++) { rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255; offset += 4; }
  }
};

export const renderOpticalFrame = (encodedPacket, profileInput = "robust", { width, height } = {}) => {
  const profile = getProfile(profileInput);
  const layout = layoutFor(profile);
  if (encodedPacket.length > layout.capacityBytes) throw new Error(`Packet ${encodedPacket.length} bytes exceeds ${layout.capacityBytes}-byte optical capacity`);
  const frameWidth = width ?? profile.cols * 10;
  const frameHeight = height ?? Math.round(frameWidth * 9 / 16);
  const rgba = new Uint8ClampedArray(frameWidth * frameHeight * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 4; rgba[i + 1] = 4; rgba[i + 2] = 6; rgba[i + 3] = 255; }
  for (const marker of layout.markers) drawBlock(rgba, frameWidth, frameHeight, profile, marker.cellX, marker.cellY, MARKER_SIZE, MARKER_SIZE, marker.rgb);
  for (const cell of layout.calibration) {
    const gray = Math.round(cell.expected);
    drawCell(rgba, frameWidth, frameHeight, profile, cell, [gray, gray, gray]);
  }
  const mask = (1 << profile.bitsPerCell) - 1;
  for (let index = 0; index < layout.data.length; index++) {
    const bitOffset = index * profile.bitsPerCell;
    const byteIndex = bitOffset >>> 3;
    const shift = bitOffset & 7;
    const value = byteIndex < encodedPacket.length ? (encodedPacket[byteIndex] >>> shift) & mask : 0;
    const gray = Math.round((value / mask) * 255);
    drawCell(rgba, frameWidth, frameHeight, profile, layout.data[index], [gray, gray, gray]);
  }
  return { rgba, width: frameWidth, height: frameHeight, profile, layout };
};

const solveHomography = (source, destination) => {
  const matrix = [];
  for (let i = 0; i < source.length; i++) {
    const [u, v] = source[i];
    const [x, y] = destination[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) < 1e-9) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let j = column; j < 9; j++) matrix[column][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let j = column; j < 9; j++) matrix[row][j] -= factor * matrix[column][j];
    }
  }
  return matrix.map((row) => row[8]).concat(1);
};

const project = (homography, u, v) => {
  const denominator = homography[6] * u + homography[7] * v + homography[8];
  return [(homography[0] * u + homography[1] * v + homography[2]) / denominator, (homography[3] * u + homography[4] * v + homography[5]) / denominator];
};

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const samplePatch = (rgba, width, height, x, y, radius) => {
  let sum = 0; let count = 0;
  const cx = Math.round(x); const cy = Math.round(y);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const px = cx + dx; const py = cy + dy;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const offset = (py * width + px) * 4;
    sum += luma(rgba[offset], rgba[offset + 1], rgba[offset + 2]); count++;
  }
  return count ? sum / count : 0;
};

const markerDistance = (rgba, width, x, y, rgb) => {
  const offset = (Math.round(y) * width + Math.round(x)) * 4;
  const dr = rgba[offset] - rgb[0]; const dg = rgba[offset + 1] - rgb[1]; const db = rgba[offset + 2] - rgb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const detectMarkers = (rgba, width, height, layout) => {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 500));
  const sums = layout.markers.map(() => ({ x: 0, y: 0, count: 0, minX: width, minY: height, maxX: 0, maxY: 0 }));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const offset = (y * width + x) * 4;
    const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 70) continue;
    let best = 0; let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < layout.markers.length; index++) {
      const marker = layout.markers[index]; const distance = Math.sqrt((r - marker.rgb[0]) ** 2 + (g - marker.rgb[1]) ** 2 + (b - marker.rgb[2]) ** 2);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    if (bestDistance > 220) continue;
    const weight = 1 - bestDistance / 220;
    const found = sums[best]; found.x += x * weight; found.y += y * weight; found.count += weight; found.minX = Math.min(found.minX, x); found.minY = Math.min(found.minY, y); found.maxX = Math.max(found.maxX, x); found.maxY = Math.max(found.maxY, y);
  }
  return sums.map((found, index) => found.count < 8 ? null : { x: found.x / found.count, y: found.y / found.count, count: found.count, marker: layout.markers[index] });
};

export const decodeOpticalFrame = (rgba, width, height, profileInput = "robust") => {
  const profile = getProfile(profileInput); const layout = layoutFor(profile);
  const found = detectMarkers(rgba, width, height, layout);
  if (found.some((marker) => !marker)) return { ok: false, reason: "markers", diagnostics: { markerCount: found.filter(Boolean).length } };
  const source = layout.markers.map((marker) => [(marker.cellX + MARKER_SIZE / 2) / profile.cols, (marker.cellY + MARKER_SIZE / 2) / profile.rows]);
  const destination = found.map((marker) => [marker.x, marker.y]);
  const homography = solveHomography(source, destination);
  if (!homography) return { ok: false, reason: "homography", diagnostics: { markerCount: 4 } };
  const radius = Math.max(0, Math.round(Math.min(width / profile.cols, height / profile.rows) * 0.12));
  const calibration = layout.calibration.map((cell) => samplePatch(rgba, width, height, ...project(homography, (cell.x + 0.5) / profile.cols, (cell.y + 0.5) / profile.rows), radius));
  const meanX = layout.calibration.reduce((sum, cell) => sum + cell.expected, 0) / calibration.length;
  const meanY = calibration.reduce((sum, value) => sum + value, 0) / calibration.length;
  let numerator = 0; let denominator = 0;
  for (let i = 0; i < calibration.length; i++) { numerator += (layout.calibration[i].expected - meanX) * (calibration[i] - meanY); denominator += (layout.calibration[i].expected - meanX) ** 2; }
  const slope = denominator ? numerator / denominator : 0; const intercept = meanY - slope * meanX;
  if (!Number.isFinite(slope) || slope < 0.15) return { ok: false, reason: "calibration", diagnostics: { slope, calibration, markers: found, homography } };
  const mask = (1 << profile.bitsPerCell) - 1; const encoded = new Uint8Array(layout.capacityBytes); let marginSum = 0; let lowConfidence = 0;
  for (let index = 0; index < layout.data.length; index++) {
    const cell = layout.data[index]; const [x, y] = project(homography, (cell.x + 0.5) / profile.cols, (cell.y + 0.5) / profile.rows);
    const observed = clamp((samplePatch(rgba, width, height, x, y, radius) - intercept) / slope, 0, 255);
    const level = clamp(Math.round((observed / 255) * mask), 0, mask); const ideal = (level / mask) * 255; const distance = Math.abs(observed - ideal) / (255 / mask);
    const confidence = clamp(1 - distance, 0, 1); marginSum += confidence; if (confidence < 0.35) lowConfidence++;
    const bitOffset = index * profile.bitsPerCell; const byteIndex = bitOffset >>> 3; encoded[byteIndex] |= level << (bitOffset & 7);
  }
  const markerConfidence = found.reduce((sum, marker) => sum + Math.min(1, marker.count / 100), 0) / 4;
  return { ok: true, encodedPacket: encoded, diagnostics: { markerConfidence, homography, calibration, calibrationSlope: slope, meanCellConfidence: marginSum / layout.data.length, lowConfidenceCells: lowConfidence, sampledCells: layout.data.length } };
};
