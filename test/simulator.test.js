import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../simulator/benchmark.mjs";

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
