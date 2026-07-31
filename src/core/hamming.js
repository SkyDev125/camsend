const bit = (value, index) => (value >>> index) & 1;

export const encodeHammingNibble = (nibble) => {
  const d1 = bit(nibble, 0);
  const d2 = bit(nibble, 1);
  const d3 = bit(nibble, 2);
  const d4 = bit(nibble, 3);
  const p1 = d1 ^ d2 ^ d4;
  const p2 = d1 ^ d3 ^ d4;
  const p4 = d2 ^ d3 ^ d4;
  const value = p1 | (p2 << 1) | (d1 << 2) | (p4 << 3) | (d2 << 4) | (d3 << 5) | (d4 << 6);
  const parity = value.toString(2).split("1").length - 1;
  return value | ((parity & 1) << 7);
};

export const decodeHammingByte = (encoded) => {
  const p1 = bit(encoded, 0) ^ bit(encoded, 2) ^ bit(encoded, 4) ^ bit(encoded, 6);
  const p2 = bit(encoded, 1) ^ bit(encoded, 2) ^ bit(encoded, 5) ^ bit(encoded, 6);
  const p4 = bit(encoded, 3) ^ bit(encoded, 4) ^ bit(encoded, 5) ^ bit(encoded, 6);
  const syndrome = p1 | (p2 << 1) | (p4 << 2);
  let value = encoded;
  const overallParity = value.toString(2).split("1").length - 1;
  if (syndrome && (overallParity & 1)) {
    value ^= 1 << (syndrome - 1);
    return { nibble: bit(value, 2) | (bit(value, 4) << 1) | (bit(value, 5) << 2) | (bit(value, 6) << 3), corrected: true, uncorrectable: false };
  }
  if (!syndrome && (overallParity & 1)) return { nibble: bit(value, 2) | (bit(value, 4) << 1) | (bit(value, 5) << 2) | (bit(value, 6) << 3), corrected: true, uncorrectable: false };
  if (syndrome && !(overallParity & 1)) return { nibble: 0, corrected: false, uncorrectable: true };
  return { nibble: bit(value, 2) | (bit(value, 4) << 1) | (bit(value, 5) << 2) | (bit(value, 6) << 3), corrected: false, uncorrectable: false };
};

export const hammingEncode = (bytes) => {
  const out = new Uint8Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    out[i * 2] = encodeHammingNibble(bytes[i] & 0x0f);
    out[i * 2 + 1] = encodeHammingNibble(bytes[i] >>> 4);
  }
  return out;
};

export const hammingDecode = (encoded) => {
  if (encoded.length % 2) return { ok: false, reason: "odd-hamming-length" };
  const out = new Uint8Array(encoded.length / 2);
  let corrected = 0;
  for (let i = 0; i < out.length; i++) {
    const low = decodeHammingByte(encoded[i * 2]);
    const high = decodeHammingByte(encoded[i * 2 + 1]);
    if (low.uncorrectable || high.uncorrectable) return { ok: false, reason: "uncorrectable-hamming", corrected };
    corrected += Number(low.corrected) + Number(high.corrected);
    out[i] = low.nibble | (high.nibble << 4);
  }
  return { ok: true, bytes: out, corrected };
};
