import { FileReceiver, FileSender } from "../src/core/transfer.js";
import { renderGlyphFrame } from "../src/core/glyph-frame.js";
import { PROFILES, renderOpticalFrame } from "../src/core/optical-frame.js";
import { applyImpairments, decodeGlyphSimulatedFrame, decodeSimulatedFrame, makeImpairment } from "./optical-sim.mjs";

export const DEFAULT_IMPAIRMENT = Object.freeze({
  rotation: 0,
  scale: 1,
  perspective: 0,
  blurRadius: 0,
  exposure: 1,
  gamma: 1,
  whiteBalance: [1, 1, 1],
  noise: 0,
  quantize: 1,
  glare: false,
  shadow: false,
  obstruction: 0,
  rollingRows: 0
});

const profileUsesGlyphs = (profile) => profile === "glyph4" || profile === "glyph6";
const addReason = (reasons, reason) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
const sameWhiteBalance = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const isIdentity = (impairment) => impairment.rotation === 0 && impairment.scale === 1 && impairment.perspective === 0 && impairment.blurRadius === 0 && impairment.exposure === 1 && impairment.gamma === 1 && sameWhiteBalance(impairment.whiteBalance, [1, 1, 1]) && impairment.noise === 0 && impairment.quantize === 1 && !impairment.glare && !impairment.shadow && impairment.obstruction === 0 && impairment.rollingRows === 0;

export const run = async ({ profile = "robust", bytes = 8_000, seed = 7, frameLoss = 0.08, duplicate = 0.05, maxFrames = 500, frameRate = 30, width, impairment: impairmentOverrides = {} } = {}) => {
  const original = Uint8Array.from({ length: bytes }, (_, index) => (index * 17 + seed) & 0xff);
  const innerFec = PROFILES[profile].innerFec ?? true;
  const sender = await new FileSender(original, "benchmark.bin", { blockSize: PROFILES[profile].blockSize, session: seed, innerFec }).prepare();
  const receiver = new FileReceiver({ innerFec }); const started = performance.now(); let unique = 0; let rejected = 0; let droppedFrames = 0; let capturedFrames = 0; let previous = null; let lastDiagnostics = null; let lastSequence = -1;
  const rejectionReasons = {};
  const impairment = { ...DEFAULT_IMPAIRMENT };
  for (let sequence = 0; sequence < maxFrames && !receiver.file; sequence++) {
    lastSequence = sequence;
    if ((sequence * 1103515245 + seed) % 1000 < frameLoss * 1000) { droppedFrames++; continue; }
    capturedFrames++;
    const optical = profileUsesGlyphs(profile)
      ? renderGlyphFrame(sender.packet(sequence), profile, { width: width ?? 1728 })
      : renderOpticalFrame(sender.packet(sequence), profile, { width: width ?? (profile === "robust" ? 336 : 432) });
    const configured = makeImpairment(seed + sequence, { ...impairment, ...impairmentOverrides });
    const impaired = isIdentity(configured) ? optical : applyImpairments(optical, configured, previous);
    previous = optical;
    const decoded = profileUsesGlyphs(profile)
      ? decodeGlyphSimulatedFrame(impaired, { innerFec, profile })
      : decodeSimulatedFrame(impaired, profile);
    if (!decoded.ok) { rejected++; addReason(rejectionReasons, decoded.reason); lastDiagnostics = decoded.diagnostics ?? lastDiagnostics; continue; }
    lastDiagnostics = decoded.diagnostics ?? lastDiagnostics; const result = receiver.accept(decoded.encodedPacket, decoded.erasures);
    if (!result.ok) { rejected++; addReason(rejectionReasons, result.reason); continue; }
    if (!result.duplicate) unique++;
    if ((sequence * 2654435761 + seed) % 1000 < duplicate * 1000) receiver.accept(decoded.encodedPacket);
  }
  const verified = await receiver.verify(); const decoderCpuSeconds = (performance.now() - started) / 1000; const simulatedWallClockSeconds = Math.max(1 / frameRate, (lastSequence + 1) / frameRate);
  const rawOpticalBitrate = PROFILES[profile].cols * PROFILES[profile].rows * PROFILES[profile].bitsPerCell * frameRate;
  const recoveredPayloadBitrate = sender.blockSize * 8 * unique / Math.max(simulatedWallClockSeconds, 1e-9);
  const verifiedGoodputBytesPerSecond = verified.ok ? bytes / Math.max(simulatedWallClockSeconds, 1e-9) : 0;
  return { profile, seed, bytes, frameRate, frameLoss, duplicate, impairment: { ...impairment, ...impairmentOverrides }, verified: verified.ok, simulatedFrames: lastSequence + 1, capturedFrames, droppedFrames, frames: receiver.stats.receivedFrames, uniqueFrames: unique, duplicateFrames: receiver.stats.duplicateFrames, rejectedFrames: rejected, rejectionReasons, rank: receiver.decoder?.rank ?? 0, sourceCount: sender.sourceCount, elapsedSeconds: simulatedWallClockSeconds, decoderCpuSeconds, rawOpticalBitrate, rawOpticalBitrateBitsPerSecond: rawOpticalBitrate, recoveredPayloadBitrate, recoveredPayloadBitrateBitsPerSecond: recoveredPayloadBitrate, verifiedGoodputBytesPerSecond, verifiedGoodputBitrate: verifiedGoodputBytesPerSecond * 8, verifiedGoodputBitsPerSecond: verifiedGoodputBytesPerSecond * 8, lastDiagnostics };
};

const main = async () => {
  const cases = [];
  for (const profile of ["robust", "dense"]) for (const seed of [11, 29]) cases.push(await run({ profile, seed }));
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) await main();
