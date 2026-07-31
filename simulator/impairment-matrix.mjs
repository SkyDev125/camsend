import { DEFAULT_IMPAIRMENT, run } from "./benchmark.mjs";

export const IMPAIRMENT_CASES = Object.freeze([
  Object.freeze({ name: "clean", impairment: Object.freeze({}) }),
  Object.freeze({
    name: "mild-geometry-and-exposure",
    impairment: Object.freeze({ rotation: 0.018, scale: 0.96, perspective: 0.018, exposure: 0.95, gamma: 1.05, whiteBalance: [1.03, 0.98, 1.01], noise: 2, quantize: 2 })
  }),
  Object.freeze({
    name: "blur-and-defocus",
    impairment: Object.freeze({ rotation: 0.012, perspective: 0.012, blurRadius: 2, exposure: 0.88, gamma: 1.12, whiteBalance: [1.08, 0.94, 0.9], noise: 3, quantize: 2 })
  }),
  Object.freeze({
    name: "glare-shadow-and-moire",
    impairment: Object.freeze({ exposure: 1.04, gamma: 0.92, whiteBalance: [1.05, 0.96, 1.02], noise: 4, quantize: 4, glare: true, shadow: true })
  }),
  Object.freeze({
    name: "rolling-shutter",
    impairment: Object.freeze({ rotation: 0.014, perspective: 0.014, exposure: 0.94, gamma: 1.06, noise: 2, rollingRows: 0.35 })
  }),
  Object.freeze({
    name: "partial-obstruction",
    impairment: Object.freeze({ rotation: 0.01, perspective: 0.01, exposure: 0.96, noise: 2, obstruction: 0.18 })
  })
]);

const mergeReasons = (target, reasons) => {
  for (const [reason, count] of Object.entries(reasons)) target[reason] = (target[reason] ?? 0) + count;
  return target;
};

export const runImpairmentMatrix = async ({
  profiles = ["robust", "dense", "glyph4", "glyph6"],
  cases = IMPAIRMENT_CASES,
  bytes = 3_000,
  seed = 29,
  frameLoss = 0.08,
  duplicate = 0.05,
  maxFrames = 8,
  frameRate = 30,
  width = 1296
} = {}) => {
  const results = [];
  for (const fixture of cases) for (const profile of profiles) {
    const result = await run({ profile, bytes, seed, frameLoss, duplicate, maxFrames, frameRate, width, impairment: fixture.impairment });
    const { bytes: fileSize, ...publicResult } = result;
    results.push({ fixture: fixture.name, fileSize, ...publicResult });
  }
  const rejectionReasons = results.reduce((all, result) => mergeReasons(all, result.rejectionReasons), {});
  const verified = results.filter((result) => result.verified).length;
  return {
    schema: 1,
    kind: "camsend-impairment-matrix",
    parameters: { profiles, fileSize: bytes, seed, frameLoss, duplicate, maxFrames, frameRate, width: width ?? null },
    fixtures: cases.map(({ name, impairment }) => ({ name, impairment: { ...DEFAULT_IMPAIRMENT, ...impairment, whiteBalance: [...(impairment.whiteBalance ?? DEFAULT_IMPAIRMENT.whiteBalance)] } })),
    cases: results,
    summary: { totalCases: results.length, verifiedCases: verified, failedCases: results.length - verified, rejectionReasons }
  };
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) console.log(JSON.stringify(await runImpairmentMatrix(), null, 2));
