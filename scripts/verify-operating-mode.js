"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPreflight } = require("../runtime/maintenance/preflight");
const { buildContextPack } = require("../runtime/maintenance/context-pack");
const { getChannelStatus } = require("../runtime/maintenance/channel");

const root = path.resolve(__dirname, "..");
const preflight = buildPreflight({ workspacePath: root, providers: ["codex"] });
const pack = buildContextPack({ workspacePath: root, maxFiles: 20 });
const channel = getChannelStatus({ rootDir: root, filePath: path.join(root, ".tmp-operating-channel.json") });

assert.equal(preflight.status, "READY", `operating-mode preflight failed: ${preflight.failures.join(", ")}`);
assert.equal(pack.policy.includeContent, false);
assert.equal(pack.files.some((file) => Object.hasOwn(file, "content")), false);
assert.equal(typeof channel.packageVersion, "string");
assert.equal(fs.existsSync(path.join(root, "runtime", "receipts", "run-receipt.js")), true);
console.log(JSON.stringify({ status: "READY", preflight: preflight.status, packedFiles: pack.files.length, channel: channel.channel }, null, 2));
