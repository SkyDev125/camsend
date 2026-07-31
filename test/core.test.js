import test from "node:test";
import assert from "node:assert/strict";
import { decodePacket, encodePacket, PACKET_KIND } from "../src/core/protocol.js";
import { decodeHammingByte, encodeHammingNibble, hammingDecode, hammingEncode } from "../src/core/hamming.js";
import { FileReceiver, FileSender } from "../src/core/transfer.js";
import { decodeOpticalFrame, renderOpticalFrame } from "../src/core/optical-frame.js";

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
