import { bytesToHex, concatBytes, hexToBytes, readU16LE, readU32LE, readU64LE, utf8Decode, utf8Encode, writeU16LE, writeU32LE, writeU64LE } from "./bytes.js";
import { crc32 } from "./crc32.js";
import { hammingDecode, hammingEncode } from "./hamming.js";
import { reedSolomonDecode, reedSolomonEncode } from "./reed-solomon.js";

export const PROTOCOL_VERSION = 1;
export const PACKET_KIND = Object.freeze({ metadata: 0, systematic: 1, repair: 2 });
export const HEADER_BYTES = 130;
export const FILE_NAME_BYTES = 64;

export const encodePacket = ({ kind, session, sequence, sourceCount, blockSize, sourceIndex = 0xffffffff, fileSize, fileName = "", fileHashHex = null, flags = 0, body, innerFec = true }) => {
  const name = utf8Encode(fileName).subarray(0, FILE_NAME_BYTES);
  const header = new Uint8Array(HEADER_BYTES);
  const view = new DataView(header.buffer);
  header[0] = 0x4f; header[1] = 0x58;
  header[2] = PROTOCOL_VERSION;
  header[3] = typeof kind === "string" ? PACKET_KIND[kind] : kind;
  writeU32LE(view, 4, session);
  writeU32LE(view, 8, sequence);
  writeU32LE(view, 12, sourceCount);
  writeU16LE(view, 16, blockSize);
  writeU32LE(view, 18, sourceIndex);
  writeU64LE(view, 22, fileSize);
  writeU16LE(view, 30, body.length);
  header[32] = flags & 0xff;
  header[33] = name.length;
  header.set(name, 34);
  if (fileHashHex) header.set(hexToBytes(fileHashHex).subarray(0, 32), 98);
  const raw = concatBytes(header, body);
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, crc32(raw), true);
  const packet = concatBytes(raw, checksum);
  const mode = typeof innerFec === "object" ? innerFec.type : innerFec;
  const parityBytes = typeof innerFec === "object" ? innerFec.parityBytes : 8;
  if (mode === "rs") return reedSolomonEncode(packet, parityBytes);
  return mode ? hammingEncode(packet) : packet;
};

export const decodePacket = (encoded, { innerFec = true, erasures = [] } = {}) => {
  const mode = typeof innerFec === "object" ? innerFec.type : innerFec;
  const parityBytes = typeof innerFec === "object" ? innerFec.parityBytes : 8;
  // A glyph frame is byte-capacity padded, while an RS packet is a whole
  // number of 255-byte codewords. Try the largest aligned prefix first and
  // fall back to shorter prefixes if a damaged padded codeword is rejected.
  const candidates = mode === "rs"
    ? Array.from({ length: Math.floor(encoded.length / 255) }, (_, index) => encoded.subarray(0, Math.floor(encoded.length / 255) * 255 - index * 255))
    : [encoded];
  let lastFailure = { ok: false, reason: "packet", corrected: 0 };
  for (const candidate of candidates) {
    const candidateErasures = erasures.filter((position) => position >= 0 && position < candidate.length);
    const decoded = mode === "rs" ? reedSolomonDecode(candidate, parityBytes, candidateErasures) : (mode ? hammingDecode(candidate) : { ok: true, bytes: candidate, corrected: 0 });
    if (!decoded.ok) { lastFailure = { ok: false, reason: decoded.reason, corrected: decoded.corrected ?? 0 }; continue; }
    const bytes = decoded.bytes;
    if (bytes.length < HEADER_BYTES + 4 || bytes[0] !== 0x4f || bytes[1] !== 0x58) { lastFailure = { ok: false, reason: "magic", corrected: decoded.corrected }; continue; }
    if (bytes[2] !== PROTOCOL_VERSION) { lastFailure = { ok: false, reason: "version", corrected: decoded.corrected }; continue; }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bodyLength = readU16LE(view, 30);
    const total = HEADER_BYTES + bodyLength + 4;
    if (bytes.length < total) { lastFailure = { ok: false, reason: "truncated", corrected: decoded.corrected }; continue; }
    const expected = view.getUint32(total - 4, true);
    const actual = crc32(bytes.subarray(0, total - 4));
    if (expected !== actual) { lastFailure = { ok: false, reason: "crc", corrected: decoded.corrected }; continue; }
    const nameLength = Math.min(bytes[33], FILE_NAME_BYTES);
    const fileHash = bytesToHex(bytes.subarray(98, 130));
    return {
      ok: true,
      corrected: decoded.corrected,
      kind: bytes[3],
      session: readU32LE(view, 4),
      sequence: readU32LE(view, 8),
      sourceCount: readU32LE(view, 12),
      blockSize: readU16LE(view, 16),
      sourceIndex: readU32LE(view, 18),
      fileSize: readU64LE(view, 22),
      flags: bytes[32],
      fileName: utf8Decode(bytes.subarray(34, 34 + nameLength)),
      fileHash: /^0+$/.test(fileHash) ? null : fileHash,
      body: bytes.slice(HEADER_BYTES, HEADER_BYTES + bodyLength)
    };
  }
  return lastFailure;
};
