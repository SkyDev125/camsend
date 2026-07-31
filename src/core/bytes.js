export const concatBytes = (...parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export const utf8Encode = (value) => new TextEncoder().encode(value);
export const utf8Decode = (value) => new TextDecoder().decode(value);

export const writeU16LE = (view, offset, value) => view.setUint16(offset, value >>> 0, true);
export const writeU32LE = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
export const writeU64LE = (view, offset, value) => view.setBigUint64(offset, BigInt(value), true);
export const readU16LE = (view, offset) => view.getUint16(offset, true);
export const readU32LE = (view, offset) => view.getUint32(offset, true);
export const readU64LE = (view, offset) => Number(view.getBigUint64(offset, true));

export const xorInto = (target, source) => {
  for (let i = 0; i < target.length; i++) target[i] ^= source[i];
  return target;
};

export const copyBytes = (bytes) => new Uint8Array(bytes);

export const bytesToHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const hexToBytes = (hex) => {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const sha256Hex = async (bytes) => {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto SHA-256 is unavailable");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
};
