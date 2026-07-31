import { FileReceiver, FileSender } from "../src/core/transfer.js";
import { PROFILES, renderOpticalFrame } from "../src/core/optical-frame.js";
import { applyImpairments, decodeSimulatedFrame, makeImpairment } from "./optical-sim.mjs";

const run = async ({ profile = "robust", bytes = 8_000, seed = 7, frameLoss = 0.08, duplicate = 0.05, maxFrames = 500 } = {}) => {
  const original = Uint8Array.from({ length: bytes }, (_, index) => (index * 17 + seed) & 0xff);
  const sender = await new FileSender(original, "benchmark.bin", { blockSize: PROFILES[profile].blockSize, session: seed }).prepare();
  const receiver = new FileReceiver(); const started = performance.now(); let unique = 0; let rejected = 0; let duplicates = 0; let previous = null; let lastDiagnostics = null;
  for (let sequence = 0; sequence < maxFrames && !receiver.file; sequence++) {
    if ((sequence * 1103515245 + seed) % 1000 < frameLoss * 1000) continue;
    const optical = renderOpticalFrame(sender.packet(sequence), profile, { width: profile === "robust" ? 336 : 432 });
    const impaired = applyImpairments(optical, makeImpairment(seed + sequence, { rotation: 0, scale: 1, perspective: 0, blurRadius: 0, exposure: 1, gamma: 1, whiteBalance: [1, 1, 1], noise: 0, quantize: 1, glare: false, shadow: false, obstruction: 0, rollingRows: 0 }), previous);
    previous = optical;
    const decoded = decodeSimulatedFrame(impaired, profile);
    if (!decoded.ok) { rejected++; continue; }
    lastDiagnostics = decoded.diagnostics; const result = receiver.accept(decoded.encodedPacket);
    if (result.duplicate) duplicates++; else unique++;
    if ((sequence * 2654435761 + seed) % 1000 < duplicate * 1000) receiver.accept(decoded.encodedPacket);
  }
  const verified = await receiver.verify(); const elapsed = (performance.now() - started) / 1000; const frameRate = 30;
  return { profile, seed, bytes, verified: verified.ok, frames: receiver.stats.receivedFrames, uniqueFrames: unique, duplicateFrames: receiver.stats.duplicateFrames + duplicates, rejectedFrames: rejected, rank: receiver.decoder?.rank ?? 0, sourceCount: sender.sourceCount, elapsedSeconds: elapsed, rawOpticalBitrate: PROFILES[profile].cols * PROFILES[profile].rows * PROFILES[profile].bitsPerCell * frameRate, recoveredPayloadRate: sender.blockSize * 8 * unique / Math.max(elapsed, 1e-9), verifiedGoodput: verified.ok ? bytes / Math.max(elapsed, 1e-9) : 0, lastDiagnostics };
};

const main = async () => {
  const cases = [];
  for (const profile of ["robust", "dense"]) for (const seed of [11, 29]) cases.push(await run({ profile, seed }));
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) await main();

export { run };
