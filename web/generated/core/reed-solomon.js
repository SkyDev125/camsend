// Small GF(256) Reed-Solomon block codec for the high-density glyph profiles.
// Version one used Hamming(8,4), which doubles every packet. This codec uses
// systematic RS(255,k) blocks and an algebraic locator/magnitude decoder. The
// outer fountain code still handles whole-frame erasures and reordering.

const EXP = new Uint8Array(512); const LOG = new Int16Array(256); LOG.fill(-1);
let value = 1;
for (let index = 0; index < 255; index++) { EXP[index] = value; LOG[value] = index; value <<= 1; if (value & 0x100) value ^= 0x11d; }
for (let index = 255; index < EXP.length; index++) EXP[index] = EXP[index - 255];

const mul = (left, right) => left && right ? EXP[LOG[left] + LOG[right]] : 0;
const div = (left, right) => { if (!right) throw new Error("GF(256) division by zero"); if (!left) return 0; let index = LOG[left] - LOG[right]; if (index < 0) index += 255; return EXP[index]; };
const power = (baseExponent, exponent) => EXP[(baseExponent * exponent) % 255];

const generator = (parityBytes) => {
  let polynomial = [1];
  // The decoder evaluates syndromes at alpha^1 ... alpha^parityBytes.
  // Keep the generator roots on that same convention.
  for (let index = 1; index <= parityBytes; index++) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let term = 0; term < polynomial.length; term++) {
      next[term] ^= polynomial[term];
      next[term + 1] ^= mul(polynomial[term], EXP[index]);
    }
    polynomial = next;
  }
  return polynomial;
};

const encodeBlock = (data, parityBytes) => {
  const block = new Uint8Array(255); block.set(data);
  const gen = generator(parityBytes);
  // A shortened final block is still a systematic RS block: zero-pad the
  // message to k bytes before division so parity remains at the end of the
  // 255-byte codeword rather than immediately after the short payload.
  const dataBytes = 255 - parityBytes;
  for (let index = 0; index < dataBytes; index++) {
    const factor = block[index]; if (!factor) continue;
    for (let term = 0; term < gen.length; term++) block[index + term] ^= mul(gen[term], factor);
  }
  block.set(data); return block;
};

const syndromes = (block, parityBytes) => {
  const out = new Uint8Array(parityBytes);
  for (let syndrome = 1; syndrome <= parityBytes; syndrome++) {
    let sum = 0;
    for (let index = 0; index < block.length; index++) if (block[index]) sum ^= mul(block[index], power(syndrome, block.length - 1 - index));
    out[syndrome - 1] = sum;
  }
  return out;
};

const polynomialAdd = (left, right) => {
  const length = Math.max(left.length, right.length); const result = new Array(length).fill(0);
  for (let index = 0; index < left.length; index++) result[length - left.length + index] ^= left[index];
  for (let index = 0; index < right.length; index++) result[length - right.length + index] ^= right[index];
  while (result.length > 1 && result[0] === 0) result.shift();
  return result;
};

const polynomialScale = (polynomial, scalar) => polynomial.map((coefficient) => mul(coefficient, scalar));

const polynomialEvaluate = (polynomial, valueToEvaluate) => {
  let result = 0;
  for (const coefficient of polynomial) result = mul(result, valueToEvaluate) ^ coefficient;
  return result;
};

// Berlekamp-Massey over the already-computed syndromes. The implementation
// stores polynomials highest-degree first, matching the packet byte order.
const findErrorLocator = (syndromeValues, parityBytes) => {
  let locator = [1]; let oldLocator = [1];
  const syndromeShift = syndromeValues.length - parityBytes;
  for (let index = 0; index < parityBytes; index++) {
    const position = index + syndromeShift; let discrepancy = syndromeValues[position];
    for (let term = 1; term < locator.length; term++) discrepancy ^= mul(locator[locator.length - term - 1], syndromeValues[position - term]);
    oldLocator.push(0);
    if (!discrepancy) continue;
    if (oldLocator.length > locator.length) {
      const nextLocator = polynomialScale(oldLocator, discrepancy);
      oldLocator = polynomialScale(locator, div(1, discrepancy)); locator = nextLocator;
    }
    locator = polynomialAdd(locator, polynomialScale(oldLocator, discrepancy));
  }
  return locator;
};

// With the error locations known, solve S_j = sum(error_i * X_i^j) for the
// error magnitudes. This small Gaussian elimination avoids a quadratic scan
// over all 255 positions and remains deterministic under bad frames.
const solveErrorMagnitudes = (syndromeValues, positions) => {
  const count = positions.length; const matrix = Array.from({ length: count }, (_, row) => Array.from({ length: count + 1 }, (_, column) => column === count ? syndromeValues[row + 1] : power(1, (254 - positions[column]) * (row + 1))));
  for (let column = 0; column < count; column++) {
    let pivot = column; while (pivot < count && !matrix[pivot][column]) pivot++;
    if (pivot === count) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const inverse = div(1, matrix[column][column]);
    for (let term = column; term <= count; term++) matrix[column][term] = mul(matrix[column][term], inverse);
    for (let row = 0; row < count; row++) {
      if (row === column) continue;
      const factor = matrix[row][column]; if (!factor) continue;
      for (let term = column; term <= count; term++) matrix[row][term] ^= mul(factor, matrix[column][term]);
    }
  }
  return matrix.map((row) => row[count]);
};

const polynomialMultiplyLow = (left, right) => {
  const result = new Array(left.length + right.length - 1).fill(0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) for (let rightIndex = 0; rightIndex < right.length; rightIndex++) result[leftIndex + rightIndex] ^= mul(left[leftIndex], right[rightIndex]);
  return result;
};

const polynomialEvaluateLow = (polynomial, valueToEvaluate) => {
  let result = 0; for (let index = polynomial.length - 1; index >= 0; index--) result = mul(result, valueToEvaluate) ^ polynomial[index]; return result;
};

// Berlekamp-Massey with low-order-first coefficients. Multiplying the
// syndrome sequence by the known erasure locator removes those contributions;
// the remaining recurrence locates unknown errors without charging erasures
// twice against the parity budget.
const berlekampMasseyLow = (sequence) => {
  let locator = [1]; let previous = [1]; let degree = 0; let shift = 1; let scale = 1;
  for (let index = 0; index < sequence.length; index++) {
    let discrepancy = sequence[index];
    for (let term = 1; term <= degree && term <= index; term++) discrepancy ^= mul(locator[term], sequence[index - term]);
    if (!discrepancy) { shift++; continue; }
    const saved = locator.slice(); const factor = div(discrepancy, scale);
    while (locator.length < previous.length + shift) locator.push(0);
    for (let term = 0; term < previous.length; term++) locator[term + shift] ^= mul(factor, previous[term]);
    if (2 * degree <= index) { degree = index + 1 - degree; previous = saved; scale = discrepancy; shift = 1; }
    else shift++;
  }
  return locator.slice(0, degree + 1);
};

const findErrorPositionsLow = (locator, blockLength) => {
  const expected = locator.length - 1; const positions = [];
  for (let rootExponent = 0; rootExponent < blockLength; rootExponent++) if (polynomialEvaluateLow(locator, power(1, rootExponent)) === 0) positions.push((rootExponent + 254) % 255);
  return positions.length === expected ? positions : null;
};

const correctWithErasures = (block, parityBytes, erasures, syndromeValues) => {
  if (!erasures.length || erasures.length > parityBytes) return null;
  let erasureLocator = [1];
  for (const position of erasures) erasureLocator = polynomialMultiplyLow(erasureLocator, [1, power(1, 254 - position)]);
  let locator = erasureLocator.slice();
  const sequence = [];
  for (let syndromeIndex = erasures.length + 1; syndromeIndex <= parityBytes; syndromeIndex++) {
    let value = 0;
    for (let term = 0; term < erasureLocator.length; term++) value ^= mul(erasureLocator[term], syndromeValues[syndromeIndex - term]);
    sequence.push(value);
  }
  locator = polynomialMultiplyLow(locator, berlekampMasseyLow(sequence));
  const positions = findErrorPositionsLow(locator, block.length);
  if (!positions || positions.length > parityBytes) return null;
  const magnitudes = solveErrorMagnitudes(syndromeValues, positions); if (!magnitudes) return null;
  const corrected = block.slice(); for (let index = 0; index < positions.length; index++) corrected[positions[index]] ^= magnitudes[index];
  return syndromes(corrected, parityBytes).every((entry) => entry === 0) ? { block: corrected, corrected: magnitudes.filter(Boolean).length } : null;
};

const findErrorPositions = (locator, blockLength) => {
  const expected = locator.length - 1; const positions = [];
  for (let rootExponent = 0; rootExponent < blockLength; rootExponent++) if (polynomialEvaluate(locator, power(1, rootExponent)) === 0) positions.push((rootExponent + 254) % 255);
  return positions.length === expected ? positions : null;
};

const correctBlock = (block, parityBytes, erasurePositions = []) => {
  const originalSyndromes = syndromes(block, parityBytes); if (originalSyndromes.every((entry) => entry === 0)) return { ok: true, block, corrected: 0 };
  const syndromeValues = [0, ...originalSyndromes];
  const erasures = [...new Set(erasurePositions.filter((position) => Number.isInteger(position) && position >= 0 && position < block.length))];
  const erasureCorrection = correctWithErasures(block, parityBytes, erasures, syndromeValues);
  if (erasureCorrection) return { ok: true, ...erasureCorrection };
  const locator = findErrorLocator(syndromeValues, parityBytes); const positions = findErrorPositions(locator, block.length);
  if (!positions || positions.length > Math.floor(parityBytes / 2)) return { ok: false, reason: "uncorrectable-reed-solomon", corrected: 0 };
  const magnitudes = solveErrorMagnitudes(syndromeValues, positions); if (!magnitudes) return { ok: false, reason: "uncorrectable-reed-solomon", corrected: 0 };
  const corrected = block.slice(); for (let index = 0; index < positions.length; index++) corrected[positions[index]] ^= magnitudes[index];
  if (syndromes(corrected, parityBytes).some((entry) => entry !== 0)) return { ok: false, reason: "uncorrectable-reed-solomon", corrected: 0 };
  return { ok: true, block: corrected, corrected: positions.length };
};

export const reedSolomonEncode = (bytes, parityBytes = 8) => {
  const dataBytes = 255 - parityBytes; const blockCount = Math.max(1, Math.ceil(bytes.length / dataBytes)); const out = new Uint8Array(blockCount * 255);
  for (let block = 0; block < blockCount; block++) { const start = block * dataBytes; const data = bytes.slice(start, Math.min(bytes.length, start + dataBytes)); out.set(encodeBlock(data, parityBytes), block * 255); }
  return out;
};

export const reedSolomonDecode = (encoded, parityBytes = 8, erasurePositions = []) => {
  if (encoded.length % 255) return { ok: false, reason: "invalid-reed-solomon-length", corrected: 0 };
  const dataBytes = 255 - parityBytes; const out = new Uint8Array((encoded.length / 255) * dataBytes); let corrected = 0;
  for (let block = 0; block < encoded.length / 255; block++) {
    const start = block * 255; const blockErasures = erasurePositions.filter((position) => position >= start && position < start + 255).map((position) => position - start);
    const result = correctBlock(encoded.subarray(start, start + 255), parityBytes, blockErasures); if (!result.ok) return result;
    out.set(result.block.subarray(0, dataBytes), block * dataBytes); corrected += result.corrected;
  }
  return { ok: true, bytes: out, corrected };
};
