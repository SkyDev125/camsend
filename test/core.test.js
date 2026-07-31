import test from "node:test";
import assert from "node:assert/strict";
import { decodePacket, encodePacket, PACKET_KIND } from "../src/core/protocol.js";
import { decodeHammingByte, encodeHammingNibble, hammingDecode, hammingEncode } from "../src/core/hamming.js";
import { FileReceiver, FileSender } from "../src/core/transfer.js";
import { decodeOpticalFrame, layoutFor, PROFILES, renderOpticalFrame } from "../src/core/optical-frame.js";
import { decodeGlyphFrame, GLYPH4_CODEBOOK, GLYPH6_CODEBOOK, renderGlyphFrame } from "../src/core/glyph-frame.js";
import { reedSolomonDecode, reedSolomonEncode } from "../src/core/reed-solomon.js";

const bytes = (length, seed = 7) => Uint8Array.from({ length }, (_, index) => (index * 31 + seed) & 0xff);

test("Hamming(8,4) round-trips every nibble and corrects one bit", () => {
  for (let nibble = 0; nibble < 16; nibble++) {
    const encoded = encodeHammingNibble(nibble);
    assert.equal(decodeHammingByte(encoded).nibble, nibble);
    for (let bit = 0; bit < 8; bit++) {
      const decoded = decodeHammingByte(encoded ^ (1 << bit));
      assert.equal(decoded.uncorrectable, false);
      assert.equal(decoded.nibble, nibble);
      assert.equal(decoded.corrected, true);
    }
  }
});

test("Hamming byte stream round-trips and detects a double-bit error", () => {
  const original = bytes(257);
  const encoded = hammingEncode(original);
  assert.deepEqual(hammingDecode(encoded), { ok: true, bytes: original, corrected: 0 });
  const corrupted = encoded.slice();
  corrupted[0] ^= 0b00000011;
  assert.equal(hammingDecode(corrupted).ok, false);
});

test("Reed-Solomon blocks round-trip, including shortened blocks and two byte errors", () => {
  for (const parityBytes of [8, 16]) {
    const original = bytes(7400, parityBytes);
    const encoded = reedSolomonEncode(original, parityBytes);
    const clean = reedSolomonDecode(encoded, parityBytes);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.bytes.slice(0, original.length), original);
    const damaged = encoded.slice(); damaged[17] ^= 0x5a; damaged[93] ^= 0xa5;
    const repaired = reedSolomonDecode(damaged, parityBytes);
    assert.equal(repaired.ok, true);
    assert.equal(repaired.corrected, 2);
    assert.deepEqual(repaired.bytes.slice(0, original.length), original);
  }
});

test("Reed-Solomon uses known erasures beyond the unknown-error budget", () => {
  const original = bytes(200, 91); const encoded = reedSolomonEncode(original, 16); const damaged = encoded.slice(); const erasures = [];
  for (let index = 0; index < 12; index++) { damaged[index * 7 + 3] ^= (index + 1) * 17; erasures.push(index * 7 + 3); }
  const repaired = reedSolomonDecode(damaged, 16, erasures);
  assert.equal(repaired.ok, true, repaired.reason);
  assert.equal(repaired.corrected, 12);
  assert.deepEqual(repaired.bytes.slice(0, original.length), original);
});

test("Reed-Solomon combines known erasures with unknown errors", () => {
  const original = bytes(200, 93); const encoded = reedSolomonEncode(original, 16); const damaged = encoded.slice(); const erasures = [];
  for (let index = 0; index < 8; index++) { const position = index * 9 + 2; damaged[position] ^= index + 17; erasures.push(position); }
  for (let index = 0; index < 4; index++) damaged[180 + index * 7] ^= index + 91;
  const repaired = reedSolomonDecode(damaged, 16, erasures);
  assert.equal(repaired.ok, true, repaired.reason);
  assert.deepEqual(repaired.bytes.slice(0, original.length), original);
});

test("glyph alphabet has the promised minimum distance", () => {
  for (let left = 0; left < GLYPH6_CODEBOOK.length; left++) for (let right = left + 1; right < GLYPH6_CODEBOOK.length; right++) {
    let value = GLYPH6_CODEBOOK[left] ^ GLYPH6_CODEBOOK[right]; let distance = 0;
    while (value) { value &= value - 1; distance++; }
    assert.ok(distance >= 6, `${left}/${right} distance=${distance}`);
  }
  for (let left = 0; left < GLYPH4_CODEBOOK.length; left++) for (let right = left + 1; right < GLYPH4_CODEBOOK.length; right++) {
    let value = GLYPH4_CODEBOOK[left] ^ GLYPH4_CODEBOOK[right]; let distance = 0;
    while (value) { value &= value - 1; distance++; }
    assert.ok(distance >= 8, `${left}/${right} distance=${distance}`);
  }
});

test("packet grammar preserves metadata, body, and CRC", () => {
  const body = bytes(37);
  const packet = encodePacket({ kind: PACKET_KIND.systematic, session: 123, sequence: 4, sourceCount: 8, blockSize: 37, sourceIndex: 4, fileSize: 271, fileName: "résumé.bin", fileHashHex: "ab".repeat(32), body });
  const decoded = decodePacket(packet);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.session, 123);
  assert.equal(decoded.sequence, 4);
  assert.equal(decoded.fileName, "résumé.bin");
  assert.equal(decoded.fileHash, "ab".repeat(32));
  assert.deepEqual(decoded.body, body);
  const damaged = packet.slice(); damaged[12] ^= 0b00000011;
  assert.equal(decodePacket(damaged).ok, false);
});

test("RS packet grammar accepts a glyph-capacity padded codeword", () => {
  const fec = { type: "rs", parityBytes: 16 };
  const body = bytes(PROFILES.glyph6.blockSize, 51);
  const packet = encodePacket({ kind: PACKET_KIND.systematic, session: 9, sequence: 2, sourceCount: 4, blockSize: body.length, sourceIndex: 0, fileSize: body.length, fileName: "glyph.bin", body, innerFec: fec });
  const padded = new Uint8Array(layoutFor("glyph6").capacityBytes); padded.set(packet);
  const decoded = decodePacket(padded, { innerFec: fec });
  assert.equal(decoded.ok, true, decoded.reason);
  assert.deepEqual(decoded.body, body);
});

test("file transfer reconstructs after unordered loss, repair frames, and duplicates", async () => {
  const original = bytes(19_000, 29);
  const sender = await new FileSender(original, "payload.bin", { blockSize: 512, session: 9876 }).prepare();
  const receiver = new FileReceiver();
  const sequence = [];
  for (let index = 0; index < sender.sourceCount + 1_000; index++) if (index % 4 !== 1) sequence.push(index);
  for (const index of sequence.reverse()) {
    receiver.accept(sender.packet(index));
    if (index % 7 === 0) receiver.accept(sender.packet(index));
    if (receiver.file) break;
  }
  assert.equal(receiver.progress, 1);
  assert.equal((await receiver.verify()).ok, true);
  assert.deepEqual(receiver.file, original);
});

for (const profile of ["robust", "dense"]) {
  test(`optical ${profile} frame renderer and homography decoder round-trip`, async () => {
    const source = await new FileSender(bytes(profile === "robust" ? 900 : 2_000), "frame.bin", { blockSize: profile === "robust" ? 512 : 1536, session: 44 }).prepare();
    const encoded = source.packet(0);
    const frame = renderOpticalFrame(encoded, profile);
    const decoded = decodeOpticalFrame(frame.rgba, frame.width, frame.height, profile);
    assert.equal(decoded.ok, true, decoded.reason);
    assert.deepEqual(decoded.encodedPacket.slice(0, encoded.length), encoded);
    const packet = decodePacket(decoded.encodedPacket);
    assert.equal(packet.ok, true);
    assert.equal(packet.fileName, "frame.bin");
  });
}

test("glyph6 frame renderer and homography decoder round-trip a high-speed packet", async () => {
  const fec = PROFILES.glyph6.innerFec;
  const source = await new FileSender(bytes(100_000, 29), "glyph.bin", { blockSize: PROFILES.glyph6.blockSize, session: 44, innerFec: fec }).prepare();
  const encoded = source.packet(0);
  const frame = renderGlyphFrame(encoded, "glyph6", { width: 1728 });
  const decoded = decodeGlyphFrame(frame.rgba, frame.width, frame.height, "glyph6");
  assert.equal(decoded.ok, true, decoded.reason);
  assert.deepEqual(decoded.encodedPacket.slice(0, encoded.length), encoded);
  assert.equal(decodePacket(decoded.encodedPacket, { innerFec: fec }).ok, true);
});

test("glyph4 wide frame renderer and homography decoder round-trip a tolerant packet", async () => {
  const fec = PROFILES.glyph4.innerFec;
  const source = await new FileSender(bytes(100_000, 29), "glyph-wide.bin", { blockSize: PROFILES.glyph4.blockSize, session: 45, innerFec: fec }).prepare();
  const encoded = source.packet(0);
  const frame = renderGlyphFrame(encoded, "glyph4", { width: 1728 });
  const decoded = decodeGlyphFrame(frame.rgba, frame.width, frame.height, "glyph4");
  assert.equal(decoded.ok, true, decoded.reason);
  assert.deepEqual(decoded.encodedPacket.slice(0, encoded.length), encoded);
  assert.equal(decodePacket(decoded.encodedPacket, { innerFec: fec, erasures: decoded.erasures }).ok, true);
});
