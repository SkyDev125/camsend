import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../simulator/benchmark.mjs";
import { IMPAIRMENT_CASES, runImpairmentMatrix } from "../simulator/impairment-matrix.mjs";

test("deterministic simulator baseline reconstructs a robust transfer", async () => {
  const result = await run({ profile: "robust", seed: 29, bytes: 8000 });
  assert.equal(result.verified, true);
  assert.equal(result.rank, result.sourceCount);
  assert.equal(result.rejectedFrames, 0);
  assert.equal(result.elapsedSeconds, 29 / 30);
  assert.ok(result.decoderCpuSeconds > 0);
});

test("deterministic simulator baseline reconstructs a dense transfer", async () => {
  const result = await run({ profile: "dense", seed: 11, bytes: 8000 });
  assert.equal(result.verified, true);
  assert.equal(result.rank, result.sourceCount);
  assert.equal(result.elapsedSeconds, 9 / 30);
});

test("simulator retains pre-packet rejection reasons", async () => {
  const result = await run({ profile: "robust", bytes: 1200, seed: 17, frameLoss: 0, duplicate: 0, maxFrames: 4, impairment: { exposure: 0 } });
  assert.equal(result.verified, false);
  assert.equal(result.rejectedFrames, 4);
  assert.equal(result.rejectionReasons.markers, 4);
  assert.equal(result.lastDiagnostics.markerCount, 0);
  assert.equal(result.droppedFrames, 0);
  assert.equal(result.capturedFrames, result.simulatedFrames);
});

test("impairment matrix is reproducible and does not retain payload data", async () => {
  const options = { profiles: ["robust", "dense"], cases: IMPAIRMENT_CASES.slice(0, 2), bytes: 1200, seed: 11, frameLoss: 0, duplicate: 0, maxFrames: 20, width: 432 };
  const first = await runImpairmentMatrix(options);
  const second = await runImpairmentMatrix(options);
  const withoutCpuTiming = (report) => report.cases.map(({ decoderCpuSeconds, ...result }) => result);
  assert.deepEqual(withoutCpuTiming(first), withoutCpuTiming(second));
  assert.equal(first.schema, 1);
  assert.equal(first.kind, "camsend-impairment-matrix");
  assert.equal(first.summary.totalCases, 4);
  assert.doesNotMatch(JSON.stringify(first), /encodedPacket|fileName|fileHash|rgba/);
});
