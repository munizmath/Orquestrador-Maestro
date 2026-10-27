"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { resolveExecutable } = require("./process-execution");

const NEXUS_MODES = new Set(["disabled", "observe", "execute"]);
const QUOTA_STATES = new Set(["LIVE", "CACHED", "ESTIMATED", "UNKNOWN", "UNSUPPORTED"]);
const SUPPORTED_SOURCE_VERSION = "0.5.0-beta.23";
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_RUNTIME_STATUS_QUERIES = 8;
const DEFAULT_TIMEOUT_MS = 5000;
const EXECUTION_LIMITATION = "The locally inspected Nexus CLI has no JSON dispatch contract that binds one PUE-authorized unit to a structured WorkReceipt. `nexus run <provider>` launches a provider directly and cannot prove PUE admission or return a unit-bound receipt.";

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
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "WINDIR",
    "PUE_TRUST_ROOT", "PUE_STATE_ROOT"
  ];
  return Object.fromEntries(allowed.filter((key) => typeof source[key] === "string").map((key) => [key, source[key]]));
}

function runJsonCommand({ executable, args, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, spawnProcess = spawn }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(resolveExecutable(executable), args, {
        cwd,
        env: { ...jsonCommandEnvironment(), PYTHONDONTWRITEBYTECODE: "1" },
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
    id: safeIdentifier(record.id, record.provider, record.provider_id),
    installed: typeof record.installed === "boolean" ? record.installed : null,
    version: safeIdentifier(record.version),
    state: record.installed === true ? "INSTALLED" : record.installed === false ? "NOT_INSTALLED" : "UNKNOWN",
    profiles: Number.isInteger(record.profiles) && record.profiles >= 0 ? record.profiles : null,
    capabilities: normalizeProviderCapabilities(record.capabilities)
  })).filter((record) => record.id);
}

function normalizeProfiles(value) {
  const byProvider = {};
  for (const record of recordsFrom(value)) {
    const provider = safeIdentifier(record.provider);
    if (!provider || !firstString(record.name)) continue;
    const account = record.account && typeof record.account === "object" && !Array.isArray(record.account) ? record.account : {};
    const health = ["HEALTHY", "DEGRADED", "UNAVAILABLE", "AUTH_REQUIRED", "RATE_LIMITED"]
      .includes(account.health) ? account.health : "UNKNOWN";
    const eligibility = record.disabled === true || account.authenticated === false || ["UNAVAILABLE", "AUTH_REQUIRED", "RATE_LIMITED"].includes(health)
      ? "INELIGIBLE"
      : record.disabled !== true && account.authenticated === true && health === "HEALTHY"
        ? "ELIGIBLE" : "UNKNOWN";
    const summary = byProvider[provider] || { configured: 0, eligible: 0, ineligible: 0, unknown: 0, defaults: 0 };
    summary.configured += 1;
    summary[eligibility.toLowerCase()] += 1;
    if (record.is_default === true) summary.defaults += 1;
    byProvider[provider] = summary;
  }
  return { state: "LIVE", eligibilityState: Object.keys(byProvider).length ? "ESTIMATED" : "UNKNOWN", byProvider };
}

function normalizeWorkspaces(value) {
  const records = recordsFrom(value);
  return {
    state: "LIVE",
    total: records.length,
    sessionCount: records.reduce((total, record) => total + (Array.isArray(record.sessions) ? record.sessions.length : 0), 0)
  };
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
    const rawSource = firstString(record.source, record.quota_source, quotaView?.source);
    const source = ["OFFICIAL_API", "CLI_OUTPUT", "LOCAL_FILES", "RESPONSE_HEADERS", "OBSERVATION", "NONE"]
      .includes(rawSource) ? rawSource : null;
    const status = firstString(record.status, quotaView?.status);
    const health = ["HEALTHY", "DEGRADED", "UNAVAILABLE", "AUTH_REQUIRED", "RATE_LIMITED", "UNKNOWN"]
      .find((candidate) => candidate === firstString(record.health)?.toUpperCase()) || "UNKNOWN";
    const sourceWindows = Array.isArray(record.windows) ? record.windows : (Array.isArray(quotaView?.windows) ? quotaView.windows : null);
    const windows = sourceWindows?.map(normalizeQuotaWindow) ?? null;
    return {
      provider: safeIdentifier(record.provider_id, record.provider, record.id) || "UNKNOWN",
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
    kind: safeIdentifier(window.kind, window.label) || "UNKNOWN",
    group: safeIdentifier(window.group),
    usedPercent: percent(window.used_percent ?? window.usedPercent),
    remainingPercent: percent(window.remaining_percent ?? window.remainingPercent ?? window.remaining),
    resetTime: resetTime && Number.isFinite(Date.parse(resetTime)) ? new Date(resetTime).toISOString() : null
  };
}

function normalizeSessions(value) {
  const records = recordsFrom(value);
  const byProvider = {};
  for (const record of records) {
    const provider = safeIdentifier(record.provider, record.provider_id, record.providerId) || "UNKNOWN";
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
      id: safeIdentifier(record.runtime_id, record.runtimeId, record.id),
      provider: safeIdentifier(record.provider_id, record.provider, record.providerId) || "UNKNOWN",
      state: knownRuntimeState(firstString(record.state)),
      controlLevel: ["CONTROL_API", "EVENTS", "TERMINAL", "PROCESS", "UNKNOWN"].includes(firstString(record.control_level, record.controlLevel)?.toUpperCase())
        ? firstString(record.control_level, record.controlLevel).toUpperCase() : "UNKNOWN"
    }))
  };
}

function knownRuntimeState(value) {
  const state = value?.toUpperCase();
  return ["STARTING", "RUNNING", "WAITING", "APPROVAL", "DETACHED", "HANDOFF", "STOPPING", "STOPPED", "FAILED", "STALE", "UNKNOWN"].includes(state) ? state : "UNKNOWN";
}

function normalizeRuntimeStatus(value, expectedId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = safeIdentifier(value.runtime_id, value.runtimeId);
  if (id !== expectedId) return null;
  return {
    id,
    state: knownRuntimeState(firstString(value.state)),
    provider: safeIdentifier(value.provider_id, value.providerId) || "UNKNOWN",
    controlLevel: ["CONTROL_API", "EVENTS", "TERMINAL", "PROCESS", "UNKNOWN"].includes(firstString(value.control_level, value.controlLevel)?.toUpperCase())
      ? firstString(value.control_level, value.controlLevel).toUpperCase() : "UNKNOWN",
    droppedOutputChunks: Number.isInteger(value.dropped_output_chunks) && value.dropped_output_chunks >= 0 ? value.dropped_output_chunks : null
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim() || null;
}

function safeIdentifier(...values) {
  const value = firstString(...values);
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value) ? value : null;
}

class NexusAdapter extends ProviderAdapter {
  constructor({ executable = process.env.MAESTRO_NEXUS_EXECUTABLE || "nexus", mode,
    allowDevObservation = process.env.MAESTRO_NEXUS_ALLOW_DEV_OBSERVATION === "1",
    timeoutMs = DEFAULT_TIMEOUT_MS, spawnProcess = spawn } = {}) {
    super("nexus");
    this.executable = executable;
    this.mode = nexusMode(mode);
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
    this.allowDevObservation = allowDevObservation === true;
    this.lastDetection = null;
  }

  async detect(request = {}) {
    if (this.mode === "disabled") {
      return { id: this.id, installed: false, executionAvailable: false, enabled: false, mode: this.mode, error: "Nexus integration is disabled." };
    }
    if (this.mode === "invalid") {
      return { id: this.id, installed: false, executionAvailable: false, enabled: false, mode: this.mode, error: "MAESTRO_NEXUS_MODE must be disabled, observe, or execute." };
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
    const devObservation = this.allowDevObservation && versionOutput?.version === "dev";
    if (!version && !devObservation) {
      this.lastDetection = { installed: true, compatible: false, errorCode: "NEXUS_VERSION_UNKNOWN" };
      return {
        id: this.id, installed: true, executionAvailable: false, enabled: true, mode: this.mode,
        compatible: false, version: firstString(versionOutput?.version),
        error: "Nexus version JSON did not contain a supported version field."
      };
    }
    if (!devObservation && !isSupportedVersion(version)) {
      this.lastDetection = { installed: true, compatible: false, version: version.raw, errorCode: "NEXUS_VERSION_UNSUPPORTED" };
      return {
        id: this.id, installed: true, executionAvailable: false, enabled: true, mode: this.mode, version: version.raw,
        compatible: false, error: `Only the locally reviewed Nexus ${SUPPORTED_SOURCE_VERSION} CLI contract is supported.`
      };
    }

    const [catalogResult] = await Promise.allSettled([this.query(["providers", "--json"], cwd)]);
    const catalogShapeValid = catalogResult.status === "fulfilled"
      && catalogResult.value && typeof catalogResult.value === "object";
    const catalog = catalogShapeValid ? normalizeProviders(catalogResult.value) : null;
    if (devObservation && (!catalog || catalog.length === 0)) {
      this.lastDetection = { installed: true, compatible: false, version: "dev", errorCode: "NEXUS_DEV_PROBE_FAILED" };
      return { id: this.id, installed: true, executionAvailable: false, enabled: true, mode: this.mode,
        compatible: false, version: "dev", error: "Unversioned Nexus failed the read-only JSON capability probe." };
    }
    const detectedVersion = devObservation ? "dev" : version.raw;
    this.lastDetection = {
      installed: true,
      compatible: true,
      version: detectedVersion,
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
      version: detectedVersion,
      compatible: true,
      nexus: {
        mode: this.mode,
        contract: devObservation ? "PROBED_DEV_READ_ONLY" : "PINNED_SOURCE_VERSION",
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
      this.query(["ps", "--json"], cwd),
      this.query(["profiles", "--json"], cwd),
      this.query(["workspaces", "--json"], cwd)
    ]);
    const sessions = commands[0].status === "fulfilled" ? normalizeSessions(commands[0].value) : { state: "UNKNOWN", total: null, byProvider: {} };
    const quota = commands[1].status === "fulfilled" ? normalizeQuota(commands[1].value) : [];
    const runtimes = commands[2].status === "fulfilled" ? normalizeRuntimes(commands[2].value) : { state: "UNKNOWN", activeCount: null, items: [] };
    const profiles = commands[3].status === "fulfilled" ? normalizeProfiles(commands[3].value) : { state: "UNKNOWN", eligibilityState: "UNKNOWN", byProvider: {} };
    const workspaces = commands[4].status === "fulfilled" ? normalizeWorkspaces(commands[4].value) : { state: "UNKNOWN", total: null, sessionCount: null };
    const statusTargets = runtimes.items.filter((runtime) => runtime.id).slice(0, MAX_RUNTIME_STATUS_QUERIES);
    const statusResults = await Promise.allSettled(statusTargets
      .map((runtime) => this.query(["control", "status", runtime.id, "--json"], cwd)));
    const runtimeStatus = statusResults.map((result, index) => result.status === "fulfilled"
      ? normalizeRuntimeStatus(result.value, statusTargets[index].id) : null).filter(Boolean);
    const quotaStates = new Set(quota.map((record) => record.state));
    const quotaState = quotaStates.size === 1 ? quota[0].state : "UNKNOWN";
    const hasUnknown = commands.some((result) => result.status === "rejected")
      || statusResults.some((result) => result.status === "rejected")
      || runtimeStatus.length !== statusTargets.length
      || runtimes.items.length > statusTargets.length
      || this.lastDetection.providerCatalogState !== "LIVE";

    return {
      mode: this.mode,
      state: hasUnknown ? "PARTIAL" : "LIVE",
      version: detection.version,
      providers: this.lastDetection.providers || [],
      providerHealth: profiles.eligibilityState,
      profiles,
      sessions,
      workspaces,
      quota,
      quotaState,
      runtimes,
      runtimeStatus,
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

  async checkAdmission({ workspacePath, pueRoot = process.env.MAESTRO_PUE_ROOT, executionId, taskId } = {}) {
    if (this.mode === "disabled" || this.mode === "invalid") {
      throw makeError("NEXUS_MODE_BLOCKS_ADMISSION", `Nexus admission is unavailable in mode '${this.mode}'.`);
    }
    if (![workspacePath, pueRoot, executionId, taskId].every((value) => typeof value === "string" && value.trim())) {
      throw makeError("NEXUS_ADMISSION_INPUT_REQUIRED", "workspacePath, pueRoot, executionId, and taskId are required.");
    }
    const result = await runJsonCommand({
      executable: "python3",
      args: [path.resolve(__dirname, "../../scripts/nexus-pue-admission.py"),
        "--project-root", path.resolve(workspacePath), "--pue-root", path.resolve(pueRoot),
        "--execution-id", executionId, "--task-id", taskId],
      cwd: path.resolve(workspacePath),
      timeoutMs: Math.max(this.timeoutMs, 15000),
      spawnProcess: this.spawnProcess
    });
    if (!result || !["READY", "BLOCKED_POLICY", "BLOCKED_DECISION"].includes(result.status)
      || (result.status === "READY" && (result.executionId !== executionId || result.taskId !== taskId
        || result.unitState !== "READY" || result.envelopeState !== "AUTHORIZED"
        || result.dispatch !== "UNSUPPORTED" || !/^sha256:[0-9a-f]{64}$/u.test(result.envelopeDigest)))) {
      throw makeError("NEXUS_ADMISSION_INVALID", "PUE admission returned an invalid result.");
    }
    return result;
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
