#!/usr/bin/env python3
"""Consulta a admissão PUE canônica para uma unidade destinada ao Nexus.

Este processo só chama os módulos existentes do PUE. Não emite uma aprovação,
não grava Envelope e não transiciona o Work Graph. O despacho deve revalidar
e materializar o Envelope pelo PUE imediatamente antes de executar.
"""

import argparse
import importlib.util
import json
from pathlib import Path


def load_module(name: str, source: Path):
    if not source.is_file():
        raise FileNotFoundError(source)
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def within_scope(candidate: str, allowed: list[str]) -> bool:
    value = candidate.replace("\\", "/").rstrip("/")
    if not value or value.startswith("/") or ".." in value.split("/"):
        return False
    return any(value == base.rstrip("/") or value.startswith(base.rstrip("/") + "/")
               for base in allowed if isinstance(base, str) and base)


def check(project_root: Path, pue_root: Path, execution_id: str, task_id: str) -> dict:
    base = pue_root / "policies" / "ci"
    if not (project_root / "policy" / "pue-policy.yaml").is_file():
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_POLICY_MISSING"}
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
    if envelope.get("execution_id") != execution_id:
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_EXECUTION_MISMATCH"}
    if envelope.get("schema_version") != 4:
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_TRACK_MANDATE_REQUIRED"}
    verified = preflight.eev.verify_envelope(envelope, root=project_root)
    if verified.get("effective_status") != "AUTHORIZED":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_ENVELOPE_INVALID"}
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
        or not within_scope(item["path"], envelope["scope"]["allowed"])
        for item in scope
    ):
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_OUTSIDE_SCOPE"}
    unit_capabilities = node.get("declared_capabilities")
    allowed_capabilities = envelope.get("request", {}).get("capabilities", [])
    if not isinstance(unit_capabilities, list) or not set(unit_capabilities).issubset(set(allowed_capabilities)):
        return {"status": "BLOCKED_DECISION", "reasonCode": "PUE_UNIT_OUTSIDE_CAPABILITIES"}
    authorization = envelope.get("authorization", {})
    return {
        "status": "READY",
        "executionId": execution_id,
        "taskId": task_id,
        "envelopeDigest": envelope["envelope_digest"],
        "authorizationId": authorization.get("authorization_id"),
        "authorizationDigest": authorization.get("authorization_digest"),
        "trackId": envelope.get("request", {}).get("track_id"),
        "unitState": node["state"],
        "envelopeState": verified["effective_status"],
        "dispatch": "UNSUPPORTED",
    }


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
