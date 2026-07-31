import { copyBytes, xorInto } from "./bytes.js";
import { repairIndices } from "./prng.js";

const wordCount = (count) => Math.ceil(count / 32);
const makeBits = (count) => new Uint32Array(wordCount(count));
const setBit = (bits, index) => { bits[index >>> 5] |= 1 << (index & 31); };
const hasBit = (bits, index) => Boolean(bits[index >>> 5] & (1 << (index & 31)));
const xorBits = (left, right) => { for (let i = 0; i < left.length; i++) left[i] ^= right[i]; };
const firstBit = (bits, count) => { for (let i = 0; i < count; i++) if (hasBit(bits, i)) return i; return -1; };

export class FountainEncoder {
  constructor(bytes, { blockSize = 512, session = 1 } = {}) {
    this.bytes = bytes;
    this.blockSize = blockSize;
    this.session = session >>> 0;
    this.sourceCount = Math.max(1, Math.ceil(bytes.length / blockSize));
    this.blocks = Array.from({ length: this.sourceCount }, (_, index) => {
      const block = new Uint8Array(blockSize);
      block.set(bytes.subarray(index * blockSize, (index + 1) * blockSize));
      return block;
    });
  }

  packet(sequence) {
    const seq = sequence >>> 0;
    if (seq < this.sourceCount) return { kind: "systematic", sourceIndex: seq, body: copyBytes(this.blocks[seq]), indices: [seq] };
    const indices = repairIndices(this.session, seq, this.sourceCount);
    const body = new Uint8Array(this.blockSize);
    for (const index of indices) xorInto(body, this.blocks[index]);
    return { kind: "repair", sourceIndex: 0xffffffff, body, indices };
  }
}

export class FountainDecoder {
  constructor(sourceCount, blockSize) {
    this.sourceCount = sourceCount;
    this.blockSize = blockSize;
    this.basis = new Map();
    this.rank = 0;
    this.received = 0;
    this.duplicates = 0;
  }

  addEquation(indices, body) {
    this.received++;
    const bits = makeBits(this.sourceCount);
    for (const index of indices) if (index >= 0 && index < this.sourceCount) bits[index >>> 5] ^= 1 << (index & 31);
    const data = copyBytes(body);
    for (let pivot = 0; pivot < this.sourceCount; pivot++) {
      if (!hasBit(bits, pivot)) continue;
      const existing = this.basis.get(pivot);
      if (existing) {
        xorBits(bits, existing.bits);
        xorInto(data, existing.data);
      } else {
        this.basis.set(pivot, { bits, data });
        this.rank++;
        return { added: true, rank: this.rank, complete: this.rank === this.sourceCount };
      }
    }
    this.duplicates++;
    return { added: false, rank: this.rank, complete: this.rank === this.sourceCount };
  }

  addSystematic(index, body) { return this.addEquation([index], body); }

  addRepair(session, sequence, body) { return this.addEquation(repairIndices(session, sequence, this.sourceCount), body); }

  recover() {
    if (this.rank < this.sourceCount) return null;
    const rows = [...this.basis.values()].sort((a, b) => firstBit(b.bits, this.sourceCount) - firstBit(a.bits, this.sourceCount));
    const solved = Array(this.sourceCount);
    for (const row of rows) {
      const pivot = firstBit(row.bits, this.sourceCount);
      const value = copyBytes(row.data);
      for (let index = pivot + 1; index < this.sourceCount; index++) if (hasBit(row.bits, index)) xorInto(value, solved[index]);
      solved[pivot] = value;
    }
    const output = new Uint8Array(this.sourceCount * this.blockSize);
    solved.forEach((block, index) => output.set(block, index * this.blockSize));
    return output;
  }
}
