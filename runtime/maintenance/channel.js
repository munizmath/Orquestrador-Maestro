"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");

const CHANNEL_FILE = path.join(os.homedir(), ".orquestrador", "CHANNEL.json");

function readChannelConfig({ filePath = CHANNEL_FILE } = {}) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && ["dev", "stable"].includes(value.channel) ? value : { channel: "dev", source: "invalid" };
  } catch { return { channel: "dev", source: "default" }; }
}

function getChannelStatus({ rootDir = path.resolve(__dirname, "../.."), filePath = CHANNEL_FILE } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
  let git = null;
  try { git = resolveGitContext(resolvedRoot); } catch (error) { git = { error: error.message }; }
  let dirty = false;
  try { dirty = execFileSync("git", ["status", "--porcelain"], { cwd: resolvedRoot, encoding: "utf8" }).trim() !== ""; } catch { dirty = null; }
  const configured = readChannelConfig({ filePath });
  const symlinkedEntrypoint = entrypoint ? (() => { try { return fs.lstatSync(entrypoint).isSymbolicLink(); } catch { return false; } })() : false;
  const stableReady = dirty === false && symlinkedEntrypoint === false && Boolean(git?.headCommit);
  return {
    schemaVersion: 1,
    channel: configured.channel,
    channelFile: filePath,
    root: resolvedRoot,
    entrypoint,
    symlinkedEntrypoint,
    packageVersion: require(path.join(resolvedRoot, "package.json")).version,
    git: { branch: git?.branch || null, headCommit: git?.headCommit || null, dirty },
    stableReady,
    warning: configured.channel === "stable" && !stableReady ? "stable-channel-points-to-an-unverified-or-dirty-checkout" : null
  };
}

function setChannel(channel, { filePath = CHANNEL_FILE } = {}) {
  if (!["dev", "stable"].includes(channel)) throw new Error("channel must be dev or stable");
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, channel, updatedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch {}
  return readChannelConfig({ filePath });
}

module.exports = { CHANNEL_FILE, readChannelConfig, getChannelStatus, setChannel };
