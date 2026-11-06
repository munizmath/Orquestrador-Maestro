"use strict";

const crypto = require("node:crypto");

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Process-local capacity scheduler. It accounts for real shared pools and
 * gives new eligible projects a fair share before an existing project grows
 * beyond its requested preferred capacity. Persistent project control and
 * fencing live in RunStore; capacity is deliberately a runtime concern.
 */
class ElasticScheduler {
  constructor({ maxAgents = 4, pools = {} } = {}) {
    this.maxAgents = positiveInteger(maxAgents, "maxAgents");
    this.pools = new Map();
    this.allocations = new Map();
    this.projects = new Map();
    for (const [id, capacity] of Object.entries(pools || {})) this.setPool(id, capacity);
  }

  setPool(id, capacity) {
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("pool id must be a non-empty string");
    this.pools.set(id, { id, capacity: positiveInteger(capacity, `pool ${id} capacity`) });
    return this.snapshot();
  }

  requestCapacity({ projectId, readyLanes = 0, minAgents = 1, preferredAgents = minAgents, maxAgents = preferredAgents, allowSerialFallback = true, poolIds = [] } = {}) {
    if (typeof projectId !== "string" || projectId.trim() === "") throw new TypeError("projectId must be a non-empty string");
    for (const [name, value] of [["readyLanes", readyLanes], ["minAgents", minAgents], ["preferredAgents", preferredAgents], ["maxAgents", maxAgents]]) {
      if (!Number.isInteger(value) || value < 0 || (name !== "readyLanes" && value < 1)) throw new TypeError(`${name} must be a valid integer`);
    }
    if (minAgents > preferredAgents || preferredAgents > maxAgents) throw new TypeError("capacity requires minAgents <= preferredAgents <= maxAgents");
    if (!Array.isArray(poolIds) || poolIds.some((id) => typeof id !== "string" || id.trim() === "")) throw new TypeError("poolIds must be an array of non-empty strings");
    for (const poolId of poolIds) if (!this.pools.has(poolId)) throw new Error(`unknown capacity pool: ${poolId}`);

    this.projects.set(projectId, { projectId, lastRequestedAt: Date.now() });
    const usedAgents = [...this.allocations.values()].reduce((sum, allocation) => sum + allocation.agentCount, 0);
    const freeAgents = Math.max(0, this.maxAgents - usedAgents);
    const usedByPool = new Map();
    for (const allocation of this.allocations.values()) {
      for (const poolId of allocation.poolIds) usedByPool.set(poolId, (usedByPool.get(poolId) || 0) + allocation.agentCount);
    }
    const freePoolAgents = poolIds.length === 0
      ? Infinity
      : Math.min(...poolIds.map((poolId) => Math.max(0, this.pools.get(poolId).capacity - (usedByPool.get(poolId) || 0))));

    const otherProjects = new Set([...this.allocations.values()].map((allocation) => allocation.projectId));
    otherProjects.add(projectId);
    const fairShare = otherProjects.size > 1 ? Math.max(1, Math.ceil(freeAgents / otherProjects.size)) : freeAgents;
    const agentCount = Math.min(readyLanes, preferredAgents, maxAgents, freeAgents, freePoolAgents, fairShare);
    if (agentCount < minAgents && !(allowSerialFallback && agentCount > 0)) {
      return Object.freeze({ status: "waiting", projectId, agentCount: 0, minAgents, preferredAgents, maxAgents, reason: freeAgents === 0 || freePoolAgents === 0 ? "capacity_unavailable" : "minimum_not_available", poolIds: [...poolIds] });
    }
    if (agentCount === 0) {
      return Object.freeze({ status: "waiting", projectId, agentCount: 0, minAgents, preferredAgents, maxAgents, reason: "no_ready_lane_or_capacity", poolIds: [...poolIds] });
    }
    const allocation = {
      allocationId: `allocation-${crypto.randomUUID()}`,
      projectId,
      agentCount,
      requested: { minAgents, preferredAgents, maxAgents },
      poolIds: [...poolIds],
      degraded: agentCount < preferredAgents,
      grantedAt: new Date().toISOString()
    };
    this.allocations.set(allocation.allocationId, allocation);
    return Object.freeze({ status: "granted", ...clone(allocation) });
  }

  releaseCapacity(allocationId) {
    if (typeof allocationId !== "string" || allocationId.trim() === "") throw new TypeError("allocationId must be a non-empty string");
    return this.allocations.delete(allocationId);
  }

  snapshot() {
    const usedAgents = [...this.allocations.values()].reduce((sum, allocation) => sum + allocation.agentCount, 0);
    return Object.freeze({
      maxAgents: this.maxAgents,
      usedAgents,
      availableAgents: Math.max(0, this.maxAgents - usedAgents),
      pools: Object.fromEntries([...this.pools.entries()].map(([id, pool]) => [id, { ...pool, usedAgents: [...this.allocations.values()].filter((allocation) => allocation.poolIds.includes(id)).reduce((sum, allocation) => sum + allocation.agentCount, 0) }])),
      allocations: clone([...this.allocations.values()])
    });
  }
}

/**
 * Cross-process scheduler backed by the same locked RunStore used for leases.
 * The allocation decision and its persisted reservation happen inside one
 * store transaction, so separate Maestro processes cannot oversubscribe the
 * global pool based on stale in-memory snapshots.
 */
class SharedElasticScheduler {
  constructor({ store, maxAgents = 20, pools = {}, allocationTtlMs = 60_000, clock = () => new Date() } = {}) {
    if (!store || typeof store.transactAutopilotAllocations !== "function") throw new TypeError("a RunStore with autopilot allocation transactions is required");
    this.store = store;
    this.maxAgents = positiveInteger(maxAgents, "maxAgents");
    this.allocationTtlMs = positiveInteger(allocationTtlMs, "allocationTtlMs");
    this.clock = clock;
    this.pools = new Map();
    for (const [id, capacity] of Object.entries(pools || {})) this.setPool(id, capacity);
  }

  setPool(id, capacity) {
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("pool id must be a non-empty string");
    this.pools.set(id, { id, capacity: positiveInteger(capacity, `pool ${id} capacity`) });
    return this;
  }

  _now() {
    const value = this.clock();
    return value instanceof Date ? value : new Date(value);
  }

  _validateRequest({ projectId, readyLanes = 0, minAgents = 1, preferredAgents = minAgents, maxAgents = preferredAgents, poolIds = [] } = {}) {
    if (typeof projectId !== "string" || projectId.trim() === "") throw new TypeError("projectId must be a non-empty string");
    for (const [name, value] of [["readyLanes", readyLanes], ["minAgents", minAgents], ["preferredAgents", preferredAgents], ["maxAgents", maxAgents]]) {
      if (!Number.isInteger(value) || value < 0 || (name !== "readyLanes" && value < 1)) throw new TypeError(`${name} must be a valid integer`);
    }
    if (minAgents > preferredAgents || preferredAgents > maxAgents) throw new TypeError("capacity requires minAgents <= preferredAgents <= maxAgents");
    if (!Array.isArray(poolIds) || poolIds.some((id) => typeof id !== "string" || id.trim() === "")) throw new TypeError("poolIds must be an array of non-empty strings");
    for (const poolId of poolIds) if (!this.pools.has(poolId)) throw new Error(`unknown capacity pool: ${poolId}`);
    return { projectId, readyLanes, minAgents, preferredAgents, maxAgents, poolIds: [...poolIds] };
  }

  async requestCapacity(request = {}) {
    const normalized = this._validateRequest(request);
    return this.store.transactAutopilotAllocations(async (allocations) => {
      const now = this._now();
      for (const allocation of allocations) {
        if (allocation.status === "active" && Date.parse(allocation.expiresAt) <= now.getTime()) {
          allocation.status = "expired";
          allocation.expiredAt = now.toISOString();
        }
      }
      const active = allocations.filter((allocation) => allocation.status === "active" && Date.parse(allocation.expiresAt) > now.getTime());
      const usedAgents = active.reduce((sum, allocation) => sum + allocation.agentCount, 0);
      const freeAgents = Math.max(0, this.maxAgents - usedAgents);
      const usedByPool = new Map();
      for (const allocation of active) {
        for (const poolId of allocation.poolIds) usedByPool.set(poolId, (usedByPool.get(poolId) || 0) + allocation.agentCount);
      }
      const freePoolAgents = normalized.poolIds.length === 0
        ? Infinity
        : Math.min(...normalized.poolIds.map((poolId) => Math.max(0, this.pools.get(poolId).capacity - (usedByPool.get(poolId) || 0))));
      const projects = new Set(active.map((allocation) => allocation.projectId));
      projects.add(normalized.projectId);
      const fairShare = projects.size > 1 ? Math.max(1, Math.ceil(freeAgents / projects.size)) : freeAgents;
      const agentCount = Math.min(normalized.readyLanes, normalized.preferredAgents, normalized.maxAgents, freeAgents, freePoolAgents, fairShare);
      if (agentCount < normalized.minAgents && !(request.allowSerialFallback !== false && agentCount > 0)) {
        return {
          allocations,
          value: Object.freeze({ status: "waiting", projectId: normalized.projectId, agentCount: 0, ...normalized, reason: freeAgents === 0 || freePoolAgents === 0 ? "capacity_unavailable" : "minimum_not_available", poolIds: [...normalized.poolIds] })
        };
      }
      if (agentCount === 0) {
        return {
          allocations,
          value: Object.freeze({ status: "waiting", projectId: normalized.projectId, agentCount: 0, ...normalized, reason: "no_ready_lane_or_capacity", poolIds: [...normalized.poolIds] })
        };
      }
      const allocation = {
        id: `allocation-${crypto.randomUUID()}`,
        allocationId: null,
        projectId: normalized.projectId,
        agentCount,
        requested: { minAgents: normalized.minAgents, preferredAgents: normalized.preferredAgents, maxAgents: normalized.maxAgents },
        poolIds: [...normalized.poolIds],
        degraded: agentCount < normalized.preferredAgents,
        status: "active",
        grantedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.allocationTtlMs).toISOString()
      };
      allocation.allocationId = allocation.id;
      allocations.push(allocation);
      return { allocations, value: Object.freeze({ ...clone(allocation), status: "granted" }) };
    });
  }

  async releaseCapacity(allocationId) {
    if (typeof allocationId !== "string" || allocationId.trim() === "") throw new TypeError("allocationId must be a non-empty string");
    return this.store.transactAutopilotAllocations(async (allocations) => {
      const allocation = allocations.find((candidate) => candidate.allocationId === allocationId || candidate.id === allocationId);
      if (!allocation) return { allocations, value: false };
      if (allocation.status === "active") {
        allocation.status = "released";
        allocation.releasedAt = this._now().toISOString();
      }
      return { allocations, value: true };
    });
  }

  async snapshot() {
    const allocations = await this.store.listAutopilotAllocations({});
    const now = this._now().getTime();
    const active = allocations.filter((allocation) => allocation.status === "active" && Date.parse(allocation.expiresAt) > now);
    const usedAgents = active.reduce((sum, allocation) => sum + allocation.agentCount, 0);
    return Object.freeze({
      maxAgents: this.maxAgents,
      usedAgents,
      availableAgents: Math.max(0, this.maxAgents - usedAgents),
      pools: Object.fromEntries([...this.pools.entries()].map(([id, pool]) => [id, {
        ...pool,
        usedAgents: active.filter((allocation) => allocation.poolIds.includes(id)).reduce((sum, allocation) => sum + allocation.agentCount, 0)
      }])),
      allocations: clone(allocations)
    });
  }
}

module.exports = { ElasticScheduler, SharedElasticScheduler };
