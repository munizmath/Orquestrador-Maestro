#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const payload = JSON.parse(result.stdout);
const files = (payload[0] && payload[0].files ? payload[0].files : []).map((file) => file.path);
const forbidden = files.filter((file) =>
  /(^|\/)(\.local|\.omx|DEV|logs|backups|node_modules|dist|build|coverage|\.cache)(\/|$)/.test(file) ||
  /(:Zone\.Identifier|\.crdownload|\.log$|\.bak($|-)|\.tmp$)/i.test(file)
);

if (forbidden.length > 0) {
  console.error("Package check failed. Forbidden files would be packed:");
  for (const file of forbidden) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(`Package check passed. Files: ${files.length}`);
