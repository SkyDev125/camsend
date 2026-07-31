import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/core/", import.meta.url));
const target = fileURLToPath(new URL("../web/generated/core/", import.meta.url));
await mkdir(target, { recursive: true });
for (const name of ["bytes.js", "crc32.js", "fountain.js", "hamming.js", "math.js", "optical-frame.js", "prng.js", "protocol.js", "transfer.js"]) await cp(join(source, name), join(target, name));
console.log(`Copied shared codec core to ${target}`);
