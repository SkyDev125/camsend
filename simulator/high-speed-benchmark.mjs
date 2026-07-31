import { FileReceiver, FileSender } from "../src/core/transfer.js";
import { renderGlyphFrame } from "../src/core/glyph-frame.js";
import { PROFILES } from "../src/core/optical-frame.js";
import { applyImpairments, decodeGlyphSimulatedFrame, makeImpairment } from "./optical-sim.mjs";

export const runHighSpeed = async ({ profile = "glyph6", bytes = 100_000, seed = 29, frameLoss = 0.08, duplicate = 0.05, maxFrames = 100, width = 1728, frameRate = 30, blockSize, impairment = {}, innerFec } = {}) => {
  const configuredBlockSize = blockSize ?? PROFILES[profile].blockSize; const configuredInnerFec = innerFec ?? PROFILES[profile].innerFec;
  const original = Uint8Array.from({ length: bytes }, (_, index) => (index * 17 + seed) & 0xff);
  const sender = await new FileSender(original, "high-speed.bin", { blockSize: configuredBlockSize, session: seed, innerFec: configuredInnerFec }).prepare();
  const receiver = new FileReceiver({ innerFec: configuredInnerFec }); const started = performance.now(); let unique = 0; let rejected = 0; let droppedFrames = 0; let capturedFrames = 0; let previous = null; let lastSequence = -1; const rejectionReasons = {}; let lastDiagnostics = null;
  const clean = { rotation: 0, scale: 1, perspective: 0, blurRadius: 0, exposure: 1, gamma: 1, whiteBalance: [1, 1, 1], noise: 0, quantize: 1, glare: false, shadow: false, obstruction: 0, rollingRows: 0 };
  for (let sequence = 0; sequence < maxFrames && !receiver.file; sequence++) {
    lastSequence = sequence;
    if ((sequence * 1103515245 + seed) % 1000 < frameLoss * 1000) { droppedFrames++; continue; }
    capturedFrames++;
    const optical = renderGlyphFrame(sender.packet(sequence), profile, { width });
    const configured = makeImpairment(seed + sequence, { ...clean, ...impairment });
    const identity = configured.rotation === 0 && configured.scale === 1 && configured.perspective === 0 && configured.blurRadius === 0 && configured.exposure === 1 && configured.gamma === 1 && configured.whiteBalance.every((value) => value === 1) && configured.noise === 0 && configured.quantize === 1 && !configured.glare && !configured.shadow && configured.obstruction === 0 && configured.rollingRows === 0;
    const impaired = identity ? optical : applyImpairments(optical, configured, previous); previous = optical;
    const decoded = decodeGlyphSimulatedFrame(impaired, { innerFec: configuredInnerFec, profile });
    if (!decoded.ok) { rejected++; rejectionReasons[decoded.reason] = (rejectionReasons[decoded.reason] ?? 0) + 1; lastDiagnostics = decoded.diagnostics ?? lastDiagnostics; continue; }
    lastDiagnostics = decoded.diagnostics ?? lastDiagnostics;
    const result = receiver.accept(decoded.encodedPacket, decoded.erasures);
    if (!result.ok) { rejected++; rejectionReasons[result.reason] = (rejectionReasons[result.reason] ?? 0) + 1; continue; }
    if (!result.duplicate) unique++;
    if ((sequence * 2654435761 + seed) % 1000 < duplicate * 1000) receiver.accept(decoded.encodedPacket);
  }
  const verified = await receiver.verify(); const elapsedSeconds = Math.max(1 / frameRate, (lastSequence + 1) / frameRate); const decoderCpuSeconds = (performance.now() - started) / 1000;
  const verifiedGoodputBytesPerSecond = verified.ok ? bytes / elapsedSeconds : 0;
  const recoveredPayloadBytesPerSecond = configuredBlockSize * unique / elapsedSeconds;
  return { profile: `${profile}-rs16`, seed, bytes, frameRate, verified: verified.ok, simulatedFrames: lastSequence + 1, capturedFrames, droppedFrames, frames: receiver.stats.receivedFrames, uniqueFrames: unique, duplicateFrames: receiver.stats.duplicateFrames, rejectedFrames: rejected, rejectionReasons, rank: receiver.decoder?.rank ?? 0, sourceCount: sender.sourceCount, elapsedSeconds, decoderCpuSeconds, rawOpticalBitrateBitsPerSecond: PROFILES[profile].cols * PROFILES[profile].rows * PROFILES[profile].bitsPerCell * frameRate, nominalEncodedPayloadBitrateBitsPerSecond: configuredBlockSize * 8 * frameRate, recoveredPayloadBytesPerSecond, recoveredPayloadBitrateBitsPerSecond: recoveredPayloadBytesPerSecond * 8, verifiedGoodputBytesPerSecond, verifiedGoodputBitrateBitsPerSecond: verifiedGoodputBytesPerSecond * 8, lastDiagnostics };
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) console.log(JSON.stringify(await runHighSpeed(), null, 2));
