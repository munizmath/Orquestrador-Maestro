#!/usr/bin/env python3
"""Consulta a admissão PUE canônica para uma unidade destinada ao Nexus.

Não emite aprovação, não grava Envelope nem transiciona o Work Graph. A leitura
canônica do grafo pode reconciliar sua projeção a partir do Journal. O despacho
deve revalidar e materializar o Envelope pelo PUE imediatamente antes de executar.
"""

import argparse
import importlib.util
import json
import re
from pathlib import Path

import yaml


def load_module(name: str, source: Path):
    if not source.is_file():
        raise FileNotFoundError(source)
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_scope_path(candidate: str) -> bool:
    if not candidate or "\\" in candidate or candidate.startswith("/") or re.match(r"^[A-Za-z]:", candidate):
        return False
    return all(part not in ("", ".", "..") for part in candidate.split("/"))


def valid_digest(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", value) is not None


def decommissioned_envelope(project_root: Path) -> bool:
    """Do not authorize new work through a superseded project Envelope regime."""
    decision_path = (project_root / "docs" / "architecture" / "decisions"
                     / "ADR-0021-descontinuacao-envelope-de-execucao.md")
    if not decision_path.is_file():
        return False
    decision = decision_path.read_text(encoding="utf-8")
    return (re.search(r"\*\*Status:\*\*\s*aceita\b", decision, re.IGNORECASE) is not None
            and re.search(r"\*\*Supersedes:\*\*\s*ADR-0020\b", decision, re.IGNORECASE) is not None)


def worktree_permission(project_root: Path, pue_root: Path) -> dict | None:
    """The current Nexus unit runner requires a Git worktree for write isolation."""
    schema_path = pue_root / "schemas" / "project.schema.json"
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        worktree_schema = schema["properties"]["git"]["properties"]["worktrees"]
    except (OSError, ValueError, KeyError, TypeError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_POLICY_UNPROVEN"}
    if not isinstance(worktree_schema, dict):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_POLICY_UNPROVEN"}
    if worktree_schema.get("const") == "forbidden":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_ISOLATION_FORBIDDEN"}
    values = worktree_schema.get("enum", [worktree_schema.get("const")])
    if not isinstance(values, list) or "allowed" not in values:
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_POLICY_UNPROVEN"}
    manifest_path = project_root / "governance" / "project.yaml"
    try:
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, yaml.YAMLError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_POLICY_UNPROVEN"}
    if not isinstance(manifest, dict) or not isinstance(manifest.get("git"), dict):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_POLICY_UNPROVEN"}
    if manifest["git"].get("worktrees") != "allowed":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WORKTREE_ISOLATION_FORBIDDEN"}
    return None


def check(project_root: Path, pue_root: Path, execution_id: str, task_id: str,
          include_contract: bool = False) -> dict:
    base = pue_root / "policies" / "ci"
    if not (project_root / "policy" / "pue-policy.yaml").is_file():
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_POLICY_MISSING"}
    try:
        if decommissioned_envelope(project_root):
            return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_ENVELOPE_REGIME_SUPERSEDED"}
    except (OSError, UnicodeError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_AUTHORIZATION_REGIME_UNPROVEN"}
    isolation_block = worktree_permission(project_root, pue_root)
    if isolation_block is not None:
        return isolation_block
    try:
        preflight = load_module("nexus_pue_preflight", base / "pue-preflight.py")
        graph_module = load_module("nexus_pue_work_graph", base / "pue-work-graph.py")
        decision = preflight.decide(
            execution_id=execution_id, created_by="maestro-nexus-adapter", root=project_root
        )
    except (OSError, ValueError, ImportError, AttributeError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_CONTRACT_UNAVAILABLE"}

    if decision.get("status") != "AUTHORIZED" or not isinstance(decision.get("envelope"), dict):
        status = decision.get("status")
        return {"status": status if status in ("BLOCKED_POLICY", "BLOCKED_DECISION") else "BLOCKED_POLICY",
                "reasonCode": "PUE_PREFLIGHT_REJECTED"}

    envelope = decision["envelope"]
    if decision.get("change_id") != execution_id or envelope.get("execution_id") != execution_id:
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_EXECUTION_MISMATCH"}
    if envelope.get("schema_version") != 4:
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_TRACK_MANDATE_REQUIRED"}
    verified = preflight.eev.verify_envelope(envelope, root=project_root)
    if verified.get("effective_status") != "AUTHORIZED":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_ENVELOPE_INVALID"}
    authorization = envelope.get("authorization", {})
    request = envelope.get("request", {})
    spec = envelope.get("spec", {})
    policy = envelope.get("policy", {})
    baseline = envelope.get("baseline", {})
    if (authorization.get("type") != "track"
            or not isinstance(authorization.get("authorization_id"), str)
            or not authorization["authorization_id"]
            or not valid_digest(authorization.get("authorization_digest"))
            or not isinstance(request.get("track_id"), str)
            or not request["track_id"]
            or not valid_digest(envelope.get("envelope_digest"))
            or not valid_digest(spec.get("digest"))
            or not valid_digest(policy.get("digest"))
            or not isinstance(baseline.get("git_sha"), str)
            or not re.fullmatch(r"[0-9a-f]{40,64}", baseline["git_sha"])):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_IDENTITY_INCOMPLETE"}
    try:
        artifact = preflight.eev.resolve_repo_artifact(project_root, authorization["artifact"])
        mandate = preflight.tav.load_authorization(artifact)
        if (mandate["authorization_id"] != authorization["authorization_id"]
                or mandate["authorization_digest"] != authorization["authorization_digest"]
                or mandate["track"]["id"] != request["track_id"]):
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_MANDATE_MISMATCH"}
        mandate_scope = mandate["mandate"]["scope"]
        mandate_allowed = mandate_scope["allowed"]
        mandate_forbidden = mandate_scope["forbidden"]
        envelope_allowed = envelope["scope"]["allowed"]
        if not all(isinstance(paths, list) for paths in
                   (mandate_allowed, mandate_forbidden, envelope_allowed)):
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_SCOPE_INVALID"}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_MANDATE_UNAVAILABLE"}
    try:
        graph = graph_module.read_graph(project_root, execution_id)
    except (OSError, ValueError, graph_module.WorkGraphError):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_GRAPH_UNAVAILABLE"}
    if graph.get("execution_id") != execution_id:
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_GRAPH_MISMATCH"}
    node = graph.get("nodes", {}).get(task_id)
    if not isinstance(node, dict):
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_NOT_FOUND"}
    if node.get("task_id") != task_id:
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_UNIT_MISMATCH"}
    if node.get("state") != "READY":
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_NOT_READY"}
    scope = node.get("scope")
    if not isinstance(scope, list) or not scope or any(
        not isinstance(item, dict) or item.get("intent") not in ("read", "write")
        or not isinstance(item.get("path"), str)
        or not safe_scope_path(item["path"])
        or not preflight.tav.path_is_covered(item["path"], envelope_allowed)
        or not preflight.tav.path_is_covered(item["path"], mandate_allowed)
        or preflight.tav.path_is_covered(item["path"], mandate_forbidden)
        for item in scope
    ):
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_OUTSIDE_SCOPE"}
    unit_capabilities = node.get("declared_capabilities")
    allowed_capabilities = envelope.get("request", {}).get("capabilities", [])
    if not isinstance(unit_capabilities, list) or not set(unit_capabilities).issubset(set(allowed_capabilities)):
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_OUTSIDE_CAPABILITIES"}
    result = {
        "status": "READY",
        "changeId": decision["change_id"],
        "executionId": execution_id,
        "taskId": task_id,
        "envelopeDigest": envelope["envelope_digest"],
        "authorizationId": authorization["authorization_id"],
        "authorizationDigest": authorization["authorization_digest"],
        "trackId": request["track_id"],
        "specDigest": spec["digest"],
        "policyDigest": policy["digest"],
        "baselineGitSha": baseline["git_sha"],
        "unitState": node["state"],
        "envelopeState": verified["effective_status"],
        "dispatch": "NOT_DISPATCHED",
    }
    if include_contract:
        result["_envelope"] = envelope
        result["_node"] = node
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--pue-root", required=True)
    parser.add_argument("--execution-id", required=True)
    parser.add_argument("--task-id", required=True)
    args = parser.parse_args()
    try:
        result = check(Path(args.project_root).resolve(), Path(args.pue_root).resolve(), args.execution_id, args.task_id)
    except Exception:
        result = {"status": "BLOCKED_POLICY", "reasonCode": "PUE_CHECK_FAILED"}
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
