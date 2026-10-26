"use strict";

const { spawn } = require("node:child_process");
const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { resolveExecutable } = require("./process-execution");

const NEXUS_MODES = new Set(["disabled", "observe", "execute"]);
const QUOTA_STATES = new Set(["LIVE", "CACHED", "ESTIMATED", "UNKNOWN", "UNSUPPORTED"]);
const SUPPORTED_SOURCE_VERSION = "0.5.0-beta.23";
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const EXECUTION_LIMITATION = "The locally reviewed Nexus CLI 0.5.0-beta.23 has no JSON dispatch contract that binds one PUE-authorized unit to a structured WorkReceipt. `nexus run <provider>` launches a provider directly and cannot prove PUE admission or return a unit-bound receipt.";

function nexusMode(value = process.env.MAESTRO_NEXUS_MODE) {
  if (value === undefined || value === "") return "disabled";
  return NEXUS_MODES.has(value) ? value : "invalid";
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseVersion(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const value = output.version || output.nexus_version;
  if (typeof value !== "string") return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value.trim());
  if (!match) return null;
  return { raw: value, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function isSupportedVersion(version) {
  // Pin to the locally reviewed Nexus source contract. Do not infer compatible
  // commands from a public release or an unreviewed version line.
  return Boolean(version && version.raw.replace(/^v/u, "") === SUPPORTED_SOURCE_VERSION);
}

function jsonCommandEnvironment(source = process.env) {
  const allowed = [
    "PATH", "HOME", "USER", "LOGNAME", "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "WINDIR"
  ];
  return Object.fromEntries(allowed.filter((key) => typeof source[key] === "string").map((key) => [key, source[key]]));
}

function runJsonCommand({ executable, args, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, spawnProcess = spawn }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(resolveExecutable(executable), args, {
        cwd,
        env: jsonCommandEnvironment(),
        shell: false,
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      reject(makeError("NEXUS_NOT_AVAILABLE", "Nexus CLI could not be started."));
      return;
    }

    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    let timer;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(makeError("NEXUS_COMMAND_TIMEOUT", "Nexus CLI query timed out."));
    }, timeoutMs);

    child.on("error", () => finish(makeError("NEXUS_NOT_AVAILABLE", "Nexus CLI is not available.")));
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        finish(makeError("NEXUS_OUTPUT_TOO_LARGE", "Nexus CLI JSON output exceeded the observation limit."));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(makeError("NEXUS_COMMAND_FAILED", `Nexus CLI query failed (exit ${code ?? signal ?? "unknown"}).`));
        return;
      }
      try {
        finish(null, JSON.parse(stdout));
      } catch {
        finish(makeError("NEXUS_JSON_INVALID", "Nexus CLI returned invalid JSON."));
      }
    });
  });
}

function recordsFrom(value) {
  if (Array.isArray(value)) return value.filter((record) => record && typeof record === "object" && !Array.isArray(record));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([id, record]) => record && typeof record === "object" && !Array.isArray(record)
    ? { id, ...record }
    : null).filter(Boolean);
}

function scalarStatus(value) {
  if (typeof value !== "string") return "UNKNOWN";
  const status = value.trim().toUpperCase();
  return QUOTA_STATES.has(status) ? status : "UNKNOWN";
}

function normalizeProviders(value) {
  return recordsFrom(value).map((record) => ({
    id: firstString(record.id, record.provider, record.provider_id),
    installed: typeof record.installed === "boolean" ? record.installed : null,
    version: firstString(record.version) || null,
    state: record.installed === true ? "INSTALLED" : record.installed === false ? "NOT_INSTALLED" : "UNKNOWN",
    profiles: Number.isInteger(record.profiles) && record.profiles >= 0 ? record.profiles : null,
    capabilities: normalizeProviderCapabilities(record.capabilities)
  })).filter((record) => record.id);
}

function normalizeProviderCapabilities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = ["login", "logout", "usage", "conversations", "resume", "cross_account_resume", "hot_account_switch", "isolated_runtime", "project_binding"];
  const normalized = Object.fromEntries(fields.filter((field) => typeof value[field] === "boolean").map((field) => [field, value[field]]));
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeQuota(value) {
  return recordsFrom(value).map((record) => {
    const quotaView = record.quota_view && typeof record.quota_view === "object" ? record.quota_view : null;
    const source = firstString(record.source, record.quota_source, quotaView?.source) || null;
    const status = firstString(record.status, quotaView?.status);
    const health = ["HEALTHY", "DEGRADED", "UNAVAILABLE", "AUTH_REQUIRED", "RATE_LIMITED", "UNKNOWN"]
      .find((candidate) => candidate === firstString(record.health)?.toUpperCase()) || "UNKNOWN";
    const sourceWindows = Array.isArray(record.windows) ? record.windows : (Array.isArray(quotaView?.windows) ? quotaView.windows : null);
    const windows = sourceWindows?.map(normalizeQuotaWindow) ?? null;
    return {
      provider: firstString(record.provider_id, record.provider, record.id) || "UNKNOWN",
      state: scalarStatus(status),
      source,
      health,
      windows,
      cost: { state: "UNKNOWN", amount: null, currency: null }
    };
  });
}

function normalizeQuotaWindow(value) {
  const window = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const percent = (candidate) => Number.isFinite(candidate) && candidate >= 0 && candidate <= 100 ? candidate : null;
  const resetTime = firstString(window.reset_time, window.resetTime);
  return {
    kind: firstString(window.kind, window.label) || "UNKNOWN",
    group: firstString(window.group) || null,
    usedPercent: percent(window.used_percent ?? window.usedPercent),
    remainingPercent: percent(window.remaining_percent ?? window.remainingPercent ?? window.remaining),
    resetTime: resetTime && Number.isFinite(Date.parse(resetTime)) ? new Date(resetTime).toISOString() : null
  };
}

function normalizeSessions(value) {
  const records = recordsFrom(value);
  const byProvider = {};
  for (const record of records) {
    const provider = firstString(record.provider, record.provider_id, record.providerId) || "UNKNOWN";
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  }
  return { state: "LIVE", total: records.length, byProvider };
}

function normalizeRuntimes(value) {
  const records = recordsFrom(value);
  return {
    state: "LIVE",
    activeCount: records.length,
    items: records.map((record) => ({
      id: firstString(record.runtime_id, record.runtimeId, record.id) || null,
      provider: firstString(record.provider_id, record.provider, record.providerId) || "UNKNOWN",
      profile: firstString(record.profile_id, record.profile, record.profileId) || null,
      state: firstString(record.state) || "UNKNOWN",
      controlLevel: firstString(record.control_level, record.controlLevel) || "UNKNOWN"
    }))
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim() || null;
}

class NexusAdapter extends ProviderAdapter {
  constructor({ executable = "nexus", mode, timeoutMs = DEFAULT_TIMEOUT_MS, spawnProcess = spawn } = {}) {
    super("nexus");
    this.executable = executable;
    this.mode = nexusMode(mode);
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
    this.lastDetection = null;
  }

  async detect(request = {}) {
    if (this.mode === "disabled") {
      return { id: this.id, installed: false, executionAvailable: false, enabled: false, mode: this.mode, error: "Nexus integration is disabled." };
    }
    if (this.mode === "invalid") {
      return { id: this.id, installed: false, executionAvailable: false, enabled: false, mode: this.mode, error: "MAESTRO_NEXUS_MODE must be disabled, observe, or execute." };
    }
    if (this.mode === "execute") {
      this.lastDetection = { installed: null, compatible: false, executionAvailable: false, errorCode: "NEXUS_EXECUTION_UNSUPPORTED" };
      return {
        id: this.id,
        installed: null,
        executionAvailable: false,
        enabled: true,
        mode: this.mode,
        compatible: false,
        error: EXECUTION_LIMITATION
      };
    }

    const cwd = typeof request.workspacePath === "string" ? request.workspacePath : undefined;
    let versionOutput;
    try {
      versionOutput = await this.query(["version", "--json"], cwd);
    } catch (error) {
      this.lastDetection = { installed: false, compatible: false, errorCode: error.code || "NEXUS_NOT_AVAILABLE" };
      return { id: this.id, installed: false, executionAvailable: false, enabled: true, mode: this.mode, error: error.message };
    }

    const version = parseVersion(versionOutput);
    if (!version) {
      this.lastDetection = { installed: true, compatible: false, errorCode: "NEXUS_VERSION_UNKNOWN" };
      return {
        id: this.id, installed: true, executionAvailable: false, enabled: true, mode: this.mode,
        compatible: false, error: "Nexus version JSON did not contain a supported version field."
      };
    }
    if (!isSupportedVersion(version)) {
      this.lastDetection = { installed: true, compatible: false, version: version.raw, errorCode: "NEXUS_VERSION_UNSUPPORTED" };
      return {
        id: this.id, installed: true, executionAvailable: false, enabled: true, mode: this.mode, version: version.raw,
        compatible: false, error: `Only the locally reviewed Nexus ${SUPPORTED_SOURCE_VERSION} CLI contract is supported.`
      };
    }

    const [catalogResult] = await Promise.allSettled([this.query(["providers", "--json"], cwd)]);
    const catalog = catalogResult.status === "fulfilled" ? normalizeProviders(catalogResult.value) : null;
    this.lastDetection = {
      installed: true,
      compatible: true,
      version: version.raw,
      providers: catalog,
      providerCatalogState: catalog ? "LIVE" : "UNKNOWN",
      providerHealthState: "UNSUPPORTED"
    };

    return {
      id: this.id,
      installed: true,
      executionAvailable: false,
      enabled: true,
      mode: this.mode,
      version: version.raw,
      compatible: true,
      nexus: {
        mode: this.mode,
        observation: "SUPPORTED",
        providers: this.lastDetection.providerCatalogState,
        providerHealth: this.lastDetection.providerHealthState,
        execution: "UNSUPPORTED",
        executionLimitation: EXECUTION_LIMITATION
      }
    };
  }

  async capabilities() {
    // The reviewed CLI has no structured single-unit dispatch contract that
    // Maestro can safely call through its provider executor interface.
    return capabilities({
      headless: false,
      structuredEvents: false,
      streaming: false,
      sessionResume: false,
      sandboxControl: false,
      modelSelection: false,
      toolApproval: false,
      mcp: false
    });
  }

  supportsReadOnlyReview() { return false; }

  async observe(request = {}) {
    if (this.mode === "disabled") {
      return { mode: this.mode, state: "UNSUPPORTED", reason: "Nexus integration is disabled." };
    }
    const detection = await this.detect(request);
    if (!detection.installed || !detection.compatible) {
      return {
        mode: this.mode,
        state: detection.installed ? "UNSUPPORTED" : "UNKNOWN",
        version: detection.version || null,
        error: detection.error || null,
        execution: "UNSUPPORTED",
        executionLimitation: EXECUTION_LIMITATION
      };
    }

    const cwd = typeof request.workspacePath === "string" ? request.workspacePath : undefined;
    const commands = await Promise.allSettled([
      this.query(["sessions", "--json"], cwd),
      this.query(["usage", "--json"], cwd),
      this.query(["ps", "--json"], cwd)
    ]);
    const sessions = commands[0].status === "fulfilled" ? normalizeSessions(commands[0].value) : { state: "UNKNOWN", total: null, byProvider: {} };
    const quota = commands[1].status === "fulfilled" ? normalizeQuota(commands[1].value) : [];
    const runtimes = commands[2].status === "fulfilled" ? normalizeRuntimes(commands[2].value) : { state: "UNKNOWN", activeCount: null, items: [] };
    const quotaStates = new Set(quota.map((record) => record.state));
    const quotaState = quotaStates.size === 1 ? quota[0].state : "UNKNOWN";
    const hasUnknown = commands.some((result) => result.status === "rejected") || this.lastDetection.providerCatalogState !== "LIVE";

    return {
      mode: this.mode,
      state: hasUnknown ? "PARTIAL" : "LIVE",
      version: detection.version,
      providers: this.lastDetection.providers || [],
      providerHealth: this.lastDetection.providerHealthState,
      sessions,
      quota,
      quotaState,
      runtimes,
      cost: { state: "UNKNOWN", amount: null, currency: null },
      execution: "UNSUPPORTED",
      executionLimitation: EXECUTION_LIMITATION
    };
  }

  async execute() {
    if (this.mode !== "execute") {
      throw makeError("NEXUS_MODE_BLOCKS_EXECUTION", `Nexus execution is unavailable in mode '${this.mode}'.`);
    }
    throw makeError("NEXUS_EXECUTION_UNSUPPORTED", EXECUTION_LIMITATION);
  }

  query(args, cwd) {
    return runJsonCommand({
      executable: this.executable,
      args,
      cwd,
      timeoutMs: this.timeoutMs,
      spawnProcess: this.spawnProcess
    });
  }
}

module.exports = {
  NexusAdapter,
  EXECUTION_LIMITATION,
  isSupportedVersion,
  nexusMode,
  normalizeProviders,
  normalizeQuota,
  normalizeQuotaWindow,
  normalizeRuntimes,
  normalizeSessions,
  parseVersion
};
