import { decodeOpticalFrame, renderOpticalFrame } from "../src/core/optical-frame.js";
import { decodePacket } from "../src/core/protocol.js";

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const xorshift = (seed) => () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;
};

const solveHomography = (source, destination) => {
  const matrix = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = source[i]; const [x, y] = destination[i];
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

const project = (h, u, v) => {
  const d = h[6] * u + h[7] * v + h[8];
  return [(h[0] * u + h[1] * v + h[2]) / d, (h[3] * u + h[4] * v + h[5]) / d];
};

const bilinear = (rgba, width, height, x, y) => {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const x1 = x0 + 1; const y1 = y0 + 1;
  if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) return [4, 4, 6, 255];
  const fx = x - x0; const fy = y - y0;
  const out = [0, 0, 0, 255];
  for (let channel = 0; channel < 3; channel++) {
    const a = rgba[(y0 * width + x0) * 4 + channel]; const b = rgba[(y0 * width + x1) * 4 + channel];
    const c = rgba[(y1 * width + x0) * 4 + channel]; const d = rgba[(y1 * width + x1) * 4 + channel];
    out[channel] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
  return out;
};

const warpPerspective = (rgba, width, height, options) => {
  const angle = options.rotation ?? 0; const scale = options.scale ?? 1; const perspective = options.perspective ?? 0;
  const cos = Math.cos(angle); const sin = Math.sin(angle); const cx = width / 2; const cy = height / 2;
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y], index) => {
    const px = (x * width * scale); const py = (y * height * scale);
    const skew = (index === 0 || index === 3 ? -1 : 1) * perspective * width;
    return [cx + px * cos - py * sin + skew, cy + px * sin + py * cos + (index < 2 ? -perspective : perspective) * height];
  });
  const inverse = solveHomography(corners.map(([x, y]) => [x / width, y / height]), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  if (!inverse) return rgba.slice();
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [u, v] = project(inverse, x / width, y / height);
    const sample = bilinear(rgba, width, height, u * width, v * height);
    const offset = (y * width + x) * 4; out[offset] = sample[0]; out[offset + 1] = sample[1]; out[offset + 2] = sample[2]; out[offset + 3] = 255;
  }
  return out;
};

const boxBlur = (rgba, width, height, radius) => {
  if (!radius) return rgba.slice();
  const horizontal = new Uint8ClampedArray(rgba.length); const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) {
    let total = 0; let count = 0;
    for (let dx = -radius; dx <= radius; dx++) { const px = Math.max(0, Math.min(width - 1, x + dx)); total += rgba[(y * width + px) * 4 + channel]; count++; }
    horizontal[(y * width + x) * 4 + channel] = total / count;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) {
    let total = 0; let count = 0;
    for (let dy = -radius; dy <= radius; dy++) { const py = Math.max(0, Math.min(height - 1, y + dy)); total += horizontal[(py * width + x) * 4 + channel]; count++; }
    const offset = (y * width + x) * 4; out[offset + channel] = total / count;
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
};

export const makeImpairment = (seed = 1, overrides = {}) => {
  const random = xorshift(seed >>> 0);
  return {
    seed,
    rotation: ((random() % 1000) / 1000 - 0.5) * 0.14,
    scale: 0.9 + ((random() % 1000) / 1000) * 0.15,
    perspective: ((random() % 1000) / 1000 - 0.5) * 0.08,
    blurRadius: random() % 3,
    exposure: 0.82 + ((random() % 1000) / 1000) * 0.36,
    gamma: 0.88 + ((random() % 1000) / 1000) * 0.24,
    whiteBalance: [0.92 + (random() % 160) / 1000, 0.92 + (random() % 160) / 1000, 0.92 + (random() % 160) / 1000],
    noise: (random() % 1000) / 1000 * 7,
    quantize: random() % 2 ? 1 : 4,
    glare: (random() % 1000) / 1000 > 0.7,
    shadow: (random() % 1000) / 1000 > 0.75,
    rollingRows: random() % 1000 > 820 ? 0.2 + (random() % 500) / 1000 : 0,
    obstruction: (random() % 1000) > 900 ? 0.12 : 0,
    ...overrides
  };
};

export const applyImpairments = (frame, impairment, previous = null) => {
  const { rgba, width, height } = frame; const options = { ...makeImpairment(1), ...impairment };
  let out = warpPerspective(rgba, width, height, options);
  out = boxBlur(out, width, height, options.blurRadius);
  const random = xorshift((options.seed ?? 1) >>> 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const radial = Math.hypot(x - width * 0.72, y - height * 0.28) / Math.max(width, height);
    const glareBoost = options.glare ? Math.max(0, 1 - radial * 8) * 150 : 0;
    const shadowFactor = options.shadow && x > width * 0.28 && x < width * 0.65 && y > height * 0.4 && y < height * 0.85 ? 0.55 : 1;
    for (let channel = 0; channel < 3; channel++) {
      let value = out[offset + channel] * options.whiteBalance[channel];
      value = Math.pow(Math.max(0, value / 255), options.gamma) * 255 * options.exposure * shadowFactor + glareBoost;
      value += ((random() / 0xffffffff) - 0.5) * options.noise;
      if (options.quantize > 1) value = Math.round(value / options.quantize) * options.quantize;
      out[offset + channel] = clampByte(value);
    }
    out[offset + 3] = 255;
  }
  if (options.rollingRows && previous) {
    const boundary = Math.floor(height * options.rollingRows);
    for (let y = 0; y < boundary; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) out[offset + channel] = Math.round(out[offset + channel] * 0.55 + previous.rgba[offset + channel] * 0.45);
    }
  }
  if (options.obstruction) {
    const ox = Math.floor(width * 0.43); const oy = Math.floor(height * 0.25); const ow = Math.floor(width * options.obstruction); const oh = Math.floor(height * options.obstruction);
    for (let y = oy; y < oy + oh; y++) for (let x = ox; x < ox + ow; x++) { const offset = (y * width + x) * 4; out[offset] = 12; out[offset + 1] = 12; out[offset + 2] = 14; }
  }
  return { ...frame, rgba: out, impairment: options };
};

export const decodeSimulatedFrame = (frame, profile) => {
  const optical = decodeOpticalFrame(frame.rgba, frame.width, frame.height, profile);
  if (!optical.ok) return optical;
  const packet = decodePacket(optical.encodedPacket);
  return packet.ok ? { ok: true, packet, encodedPacket: optical.encodedPacket, diagnostics: optical.diagnostics } : { ok: false, reason: `packet-${packet.reason}`, diagnostics: { ...optical.diagnostics, corrected: packet.corrected } };
};
