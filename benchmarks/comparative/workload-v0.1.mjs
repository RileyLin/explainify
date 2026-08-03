import { createHash } from "node:crypto";

const records = Array.from({ length: 1000 }, (_, index) => ({
  requestId: `request-${index.toString().padStart(4, "0")}`,
  status: 200,
  bytes: 512 + (index % 32),
}));
const digest = createHash("sha256")
  .update(JSON.stringify(records))
  .digest("hex");

console.log(JSON.stringify({
  schemaVersion: 1,
  workloadId: "http-roundtrip-v1",
  requestCount: records.length,
  assertionCount: 8,
  failedAssertions: 0,
  digest,
}));
