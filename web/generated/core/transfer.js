import { FountainDecoder, FountainEncoder } from "./fountain.js";
import { decodePacket, encodePacket, PACKET_KIND } from "./protocol.js";
import { sha256Hex } from "./bytes.js";

const randomSession = () => (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff)) >>> 0;

export class FileSender {
  constructor(bytes, fileName, { blockSize = 512, session = randomSession(), flags = 0, innerFec = true } = {}) {
    this.bytes = bytes;
    this.fileName = fileName;
    this.flags = flags;
    this.innerFec = innerFec;
    this.session = session >>> 0;
    this.fountain = new FountainEncoder(bytes, { blockSize, session: this.session });
    this.fileSize = bytes.length;
    this.sha256 = null;
  }

  async prepare() { this.sha256 = await sha256Hex(this.bytes); return this; }

  packet(sequence) {
    if (!this.sha256) throw new Error("Call await sender.prepare() before generating packets");
    const source = this.fountain.packet(sequence);
    return encodePacket({
      kind: PACKET_KIND[source.kind],
      session: this.session,
      sequence,
      sourceCount: this.fountain.sourceCount,
      blockSize: this.fountain.blockSize,
      sourceIndex: source.sourceIndex,
      fileSize: this.fileSize,
      fileName: this.fileName,
      fileHashHex: this.sha256,
      flags: this.flags,
      body: source.body,
      innerFec: this.innerFec
    });
  }

  get sourceCount() { return this.fountain.sourceCount; }
  get blockSize() { return this.fountain.blockSize; }
}

export class FileReceiver {
  constructor({ innerFec = true } = {}) {
    this.session = null;
    this.decoder = null;
    this.meta = null;
    this.seenSequences = new Set();
    this.stats = { receivedFrames: 0, duplicateFrames: 0, correctedSymbols: 0, correctedNibbles: 0, rejectedPackets: 0, rejectionReasons: {} };
    this.file = null;
    this.innerFec = innerFec;
  }

  accept(encodedPacket, erasures = []) {
    this.stats.receivedFrames++;
    const packet = decodePacket(encodedPacket, { innerFec: this.innerFec, erasures });
    if (!packet.ok) {
      this.stats.rejectedPackets++;
      this.stats.rejectionReasons[packet.reason] = (this.stats.rejectionReasons[packet.reason] ?? 0) + 1;
      return { ok: false, reason: packet.reason, stats: this.stats };
    }
    this.stats.correctedSymbols += packet.corrected;
    this.stats.correctedNibbles += packet.corrected;
    if (this.session === null) {
      this.session = packet.session;
      this.meta = packet;
      this.decoder = new FountainDecoder(packet.sourceCount, packet.blockSize);
    }
    if (packet.session !== this.session || packet.sourceCount !== this.meta.sourceCount || packet.blockSize !== this.meta.blockSize) return { ok: false, reason: "session-mismatch", stats: this.stats };
    if (this.seenSequences.has(packet.sequence)) {
      this.stats.duplicateFrames++;
      return { ok: true, duplicate: true, progress: this.progress, stats: this.stats };
    }
    this.seenSequences.add(packet.sequence);
    const result = packet.kind === PACKET_KIND.systematic
      ? this.decoder.addSystematic(packet.sourceIndex, packet.body)
      : this.decoder.addRepair(packet.session, packet.sequence, packet.body);
    if (result.complete) {
      const padded = this.decoder.recover();
      this.file = padded?.subarray(0, this.meta.fileSize) ?? null;
    }
    return { ok: true, duplicate: false, progress: this.progress, complete: Boolean(this.file), stats: this.stats };
  }

  async verify() {
    if (!this.file || !this.meta) return { ok: false, reason: "incomplete" };
    const hash = await sha256Hex(this.file);
    return { ok: hash === this.meta.fileHash, hash, expected: this.meta.fileHash, bytes: this.file };
  }

  get progress() { return this.decoder ? this.decoder.rank / this.decoder.sourceCount : 0; }
}
