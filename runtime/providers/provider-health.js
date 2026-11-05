"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_HEALTH_FILE = path.join(os.homedir(), ".orquestrador", "PROVIDER_HEALTH.json");
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

function loadProviderHealth({ filePath = DEFAULT_HEALTH_FILE } = {}) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || value.version !== 1 || !value.providers || typeof value.providers !== "object") throw new Error("invalid health file");
    return { filePath, value };
  } catch {
    return { filePath, value: { version: 1, updatedAt: null, providers: {} } };
  }
}

function saveProviderHealth(value, { filePath = DEFAULT_HEALTH_FILE } = {}) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), providers: value.providers || {} }, null, 2) + "\n";
  const temporary = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
  return { filePath, value: JSON.parse(payload) };
}

function recordProviderHealth(providerId, observation, options = {}) {
  const loaded = loadProviderHealth(options);
  const id = String(providerId || "").trim().toLowerCase();
  if (!id) throw new TypeError("providerId is required");
  const safe = {
    providerId: id,
    observedAt: new Date().toISOString(),
    state: String(observation?.state || observation?.status || "UNKNOWN").slice(0, 64),
    installed: observation?.installed === true,
    executionAvailable: observation?.executionAvailable === true,
    capabilities: observation?.capabilities && typeof observation.capabilities === "object" ? Object.fromEntries(Object.entries(observation.capabilities).slice(0, 32).map(([key, value]) => [key, Boolean(value)])) : {},
    reason: typeof observation?.reason === "string" ? observation.reason.slice(0, 300) : null
  };
  loaded.value.providers[id] = safe;
  return saveProviderHealth(loaded.value, options).value.providers[id];
}

function listProviderHealth({ maxAgeMs = DEFAULT_MAX_AGE_MS, ...options } = {}) {
  const loaded = loadProviderHealth(options);
  const now = Date.now();
  return Object.values(loaded.value.providers).sort((left, right) => left.providerId.localeCompare(right.providerId)).map((entry) => ({
    ...entry,
    stale: !Number.isFinite(Date.parse(entry.observedAt)) || now - Date.parse(entry.observedAt) > maxAgeMs
  }));
}

function pruneProviderHealth({ maxAgeMs = 24 * 60 * 60 * 1000, ...options } = {}) {
  const loaded = loadProviderHealth(options);
  const cutoff = Date.now() - maxAgeMs;
  const removed = [];
  for (const [id, entry] of Object.entries(loaded.value.providers)) {
    if (!Number.isFinite(Date.parse(entry.observedAt)) || Date.parse(entry.observedAt) < cutoff) {
      removed.push(id);
      delete loaded.value.providers[id];
    }
  }
  if (removed.length > 0) saveProviderHealth(loaded.value, options);
  return { removed, remaining: Object.keys(loaded.value.providers).length };
}

function selectHealthyProviders({ providerIds, maxAgents = 20, maxAgeMs = DEFAULT_MAX_AGE_MS, ...options } = {}) {
  const allowed = Array.isArray(providerIds) && providerIds.length > 0 ? new Set(providerIds.map((value) => String(value).toLowerCase())) : null;
  return listProviderHealth({ maxAgeMs, ...options })
    .filter((entry) => (!allowed || allowed.has(entry.providerId)) && entry.stale === false && entry.installed === true && entry.executionAvailable === true && /ready|healthy|available/iu.test(entry.state))
    .slice(0, Math.max(0, Math.min(20, maxAgents)));
}

module.exports = { DEFAULT_HEALTH_FILE, DEFAULT_MAX_AGE_MS, loadProviderHealth, saveProviderHealth, recordProviderHealth, listProviderHealth, selectHealthyProviders, pruneProviderHealth };
