// Runner: mint both checkpoint packages into tests/workstream/fixtures/.
//   - explainify-package.json : the REAL engine-produced Explainify package
//   - portable-package.json   : a different-ids portability fixture
// The Explainify bundle is read from tests/workstream/fixtures/explainify-bundle.json — the raw
// verbatim evidence bundle, kept as build-time fixture input (NOT product runtime).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mintRealPackage, mintPortablePackage } from "./mint-package.mjs";
import { stableStringify } from "../comprehension/util.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

async function main() {
  const outDir = path.join(root, "tests/workstream/fixtures");
  const bundle = JSON.parse(await readFile(path.join(outDir, "explainify-bundle.json"), "utf8"));
  const real = mintRealPackage(bundle);
  const portable = mintPortablePackage();
  await writeFile(path.join(outDir, "explainify-package.json"), `${stableStringify(real)}\n`, "utf8");
  await writeFile(path.join(outDir, "portable-package.json"), `${stableStringify(portable)}\n`, "utf8");
  console.log(JSON.stringify({
    real: { workstreamId: real.workstreamId, checkpointId: real.checkpointId, sources: real.rawSources.length },
    portable: { workstreamId: portable.workstreamId, checkpointId: portable.checkpointId, sources: portable.rawSources.length },
  }, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exitCode = 1;
});
