// Manual end-to-end driver: spawns the stdio MCP server, performs the real MCP
// handshake (initialize → tools/list → tools/call explainify.explain_session),
// and prints the results. Proves a client can discover and call the tool over
// stdio, which is acceptance-gate condition #1. Not part of the unit suite (it
// spawns a process); run directly:
//   node tools/session/__tests__/mcp-e2e.mjs <session-id> <repo-root>

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "mcp-server.mjs");
const sessionId = process.argv[2] || "mcp-e2e";
const root = process.argv[3] || process.cwd();

const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "e2e", version: "0" },
});
console.log("initialize:", init.result?.serverInfo);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
console.log("tools:", tools.result.tools.map((t) => t.name));

const call = await rpc("tools/call", {
  name: "explainify.explain_session",
  arguments: { question: "What did this session do?", session: { id: sessionId }, repository: { root } },
});
const structured = call.result?.structuredContent;
console.log("call.isError:", Boolean(call.result?.isError));
console.log("result:", JSON.stringify(structured, null, 2));

child.kill();
process.exit(call.result?.isError ? 1 : 0);
