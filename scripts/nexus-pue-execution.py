#!/usr/bin/env python3
"""Despacho de uma unidade Nexus sob Envelope, lease, Journal e gates PUE existentes."""

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import re
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

import importlib.util


def load_module(name: str, source: Path):
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


admission_module = load_module("nexus_pue_admission", Path(__file__).with_name("nexus-pue-admission.py"))
check = admission_module.check


def identity_key(root: Path, execution_id: str, task_id: str) -> str:
    identity = json.dumps([str(root.resolve()), execution_id, task_id], separators=(",", ":"))
    return "maestro-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()


class UnitBusy(Exception):
    pass


@contextlib.contextmanager
def project_lock(root: Path):
    # O lease remoto identifica a sessão Git, não cada processo local. Dois
    # processos da mesma sessão não podem liberar o lease um do outro.
    name = "maestro-nexus-" + hashlib.sha256(str(root.resolve()).encode("utf-8")).hexdigest() + ".lock"
    lock_path = Path(tempfile.gettempdir()) / name
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or not stat.S_ISREG(info.st_mode):
            raise ValueError("Unsafe local unit lock")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise UnitBusy("Another PUE/Nexus unit owns this project") from error
        yield
    finally:
        os.close(fd)


def modules(pue_root: Path) -> dict:
    base = pue_root / "policies" / "ci"
    return {
        name: load_module("nexus_execution_" + name, base / filename)
        for name, filename in {
            "preflight": "pue-preflight.py", "graph": "pue-work-graph.py",
            "journal": "pue-execution-journal.py", "lease": "pue-lease.py",
            "gate": "pue-gate.py",
        }.items()
    }


def append(mod: dict, root: Path, execution_id: str, task_id: str,
           type_: str, payload: dict, *, issuer_kind: str = "runtime", evidence_ref=None) -> dict:
    return mod["journal"].append_event(
        root, execution_id, type_=type_, issuer_kind=issuer_kind,
        issuer_id="maestro-nexus-adapter" if issuer_kind == "runtime" else "nexus",
        task_id=task_id, payload=payload, evidence_ref=evidence_ref,
    )


def verified_nexus_unit(unit: object, expected: dict) -> bool:
    if not isinstance(unit, dict):
        return False
    fields = {
        "idempotency_key": expected["idempotency_key"],
        "project_id": expected["project_id"],
        "change_id": expected["change_id"],
        "execution_id": expected["execution_id"],
        "task_id": expected["task_id"],
        "track_id": expected["track_id"],
        "envelope_digest": expected["envelope_digest"],
        "authorization_digest": expected["authorization_digest"],
    }
    return all(unit.get(name) == value for name, value in fields.items())


def nexus_events(executable: str, args: list[str], root: Path,
                 on_event, key: str, lease_module=None):
    proc = subprocess.Popen(
        [executable, "maestro-unit", *args, "--json"], cwd=root,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    stop = threading.Event()
    renew_failed = threading.Event()

    def request_cancel():
        try:
            subprocess.run([executable, "maestro-unit", "cancel", "--idempotency-key", key, "--json"],
                           cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=15)
        except (OSError, subprocess.TimeoutExpired):
            pass

    def interrupted(_signum, _frame):
        request_cancel()
        proc.terminate()
        raise KeyboardInterrupt

    previous_term = signal.signal(signal.SIGTERM, interrupted)
    previous_int = signal.signal(signal.SIGINT, interrupted)

    def renew_loop():
        while not stop.wait(240):
            # O backend canônico tem renew; o wrapper PUE expõe apenas acquire/release.
            touched = lease_module._run_backend(["touch"], root)
            result = lease_module._run_backend(["renew"], root) if touched.returncode == 0 else touched
            if result.returncode != 0 or lease_module.assert_held(root).state != "HELD":
                renew_failed.set()
                request_cancel()
                proc.terminate()
                return

    thread = None
    if lease_module is not None:
        thread = threading.Thread(target=renew_loop, daemon=True)
        thread.start()
    try:
        for line in proc.stdout:
            if len(line) > 1024 * 1024:
                proc.terminate()
                raise ValueError("Nexus event exceeds 1 MiB")
            event = json.loads(line)
            if not isinstance(event, dict):
                raise ValueError("Nexus event is not an object")
            on_event(event)
        code = proc.wait()
        return code, renew_failed.is_set()
    finally:
        signal.signal(signal.SIGTERM, previous_term)
        signal.signal(signal.SIGINT, previous_int)
        stop.set()
        if thread is not None:
            thread.join(timeout=2)
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


def request_from(admission: dict, root: Path, project_id: str,
                 provider: str, profile: str) -> dict:
    node = admission["_node"]
    task_id = admission["taskId"]
    return {
        "schema_version": 1,
        "project_id": project_id,
        "project_path": str(root),
        "change_id": admission["changeId"],
        "execution_id": admission["executionId"],
        "task_id": task_id,
        "track_id": admission["trackId"],
        "authorization_id": admission["authorizationId"],
        "authorization_digest": admission["authorizationDigest"],
        "envelope_digest": admission["envelopeDigest"],
        "spec_digest": admission["specDigest"],
        "policy_digest": admission["policyDigest"],
        "idempotency_key": identity_key(root, admission["executionId"], task_id),
        "goal": (
            f"Execute a unidade {task_id} conforme DEV/SPECS/ACTIVE.md e DEV/HANDOFF.md. "
            "Use apenas o escopo autorizado; preserve os gates do PUE."
        ),
        "scope": node["scope"],
        "acceptance_criteria": [
            "Relatar arquivos alterados, comandos e testes; a conclusão depende dos gates PUE."
        ],
        "verification_commands": ["git diff --check"],
        "provider": provider,
        "profile": profile,
        "allow_tool_auto_approval": False,
    }


def evidence_events(mod: dict, root: Path, req: dict, unit: dict) -> None:
    evidence = unit.get("evidence")
    if not isinstance(evidence, dict):
        return
    common = {"nexus_run_id": unit.get("run_id"), "receipt_id": evidence.get("receipt_id"),
              "receipt_digest": evidence.get("receipt_digest")}
    for changed in evidence.get("changed_files") or []:
        if isinstance(changed, str):
            append(mod, root, req["execution_id"], req["task_id"], "FILE_CHANGED",
                   {**common, "path": changed}, issuer_kind="executor")
    for digest in evidence.get("command_digests") or []:
        if isinstance(digest, str):
            append(mod, root, req["execution_id"], req["task_id"], "COMMAND_EXECUTED",
                   {**common, "command_digest": digest}, issuer_kind="executor")
    for result in evidence.get("tests") or []:
        if isinstance(result, dict):
            append(mod, root, req["execution_id"], req["task_id"], "TEST_OUTPUT_PRODUCED",
                   {**common, "command_digest": result.get("command_digest"),
                    "passed": result.get("passed"), "exit_code": result.get("exit_code")},
                   issuer_kind="executor")
    append(mod, root, req["execution_id"], req["task_id"], "EXECUTOR_MESSAGE",
           {**common, "status": unit.get("status"), "plan_id": unit.get("plan_id"),
            "plan_revision": unit.get("plan_revision"),
            "base_revision": evidence.get("base_revision"),
            "result_revision": evidence.get("result_revision")}, issuer_kind="executor")


def git(root: Path, *args: str) -> bytes:
    result = subprocess.run(["git", *args], cwd=root, capture_output=True, check=True)
    return result.stdout.strip()


def changed_paths(root: Path, base: str) -> set[str]:
    tracked = git(root, "diff", "--name-only", "-z", base).split(b"\0")
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0")
    return {os.fsdecode(name) for name in tracked + untracked if name}


def promote_verified_workspace(mod: dict, root: Path, req: dict, unit: dict) -> None:
    evidence = unit["evidence"]
    workspace_raw = unit.get("workspace")
    if not isinstance(workspace_raw, str) or not workspace_raw:
        raise ValueError("Nexus workspace missing")
    workspace = Path(workspace_raw).resolve(strict=True)
    if workspace == root or Path(os.fsdecode(git(workspace, "rev-parse", "--show-toplevel"))).resolve() != workspace:
        raise ValueError("Nexus did not use an isolated worktree")
    root_common = (root / os.fsdecode(git(root, "rev-parse", "--git-common-dir"))).resolve()
    workspace_common = (workspace / os.fsdecode(git(workspace, "rev-parse", "--git-common-dir"))).resolve()
    if root_common != workspace_common:
        raise ValueError("Nexus workspace belongs to another repository")
    branch = subprocess.run(["git", "symbolic-ref", "-q", "HEAD"], cwd=workspace, capture_output=True)
    if branch.returncode != 1:
        raise ValueError("Nexus workspace must have detached HEAD")
    base = evidence.get("base_revision")
    if not isinstance(base, str) or not re.fullmatch(r"[0-9a-f]{40,64}", base):
        raise ValueError("Nexus base revision missing")
    if os.fsdecode(git(root, "rev-parse", "HEAD")) != base:
        raise ValueError("PUE root revision changed during Nexus execution")
    actual = changed_paths(workspace, base)
    receipt_paths = evidence.get("changed_files")
    if not actual or not isinstance(receipt_paths, list) or actual != set(receipt_paths):
        raise ValueError("Nexus receipt file set differs from worktree")
    write_patterns = [item["path"] for item in req["scope"] if item["intent"] == "write"]
    for name in actual:
        if not mod["preflight"].tav.path_is_covered(name, write_patterns):
            raise ValueError("Nexus changed a file outside the authorized unit")
        target = root / name
        source = workspace / name
        if not target.resolve().is_relative_to(root) or not source.resolve().is_relative_to(workspace):
            raise ValueError("Nexus output path escapes its repository")
        if target.is_symlink() or source.is_symlink():
            raise ValueError("Symlink changes require intervention")
        if target.exists() and (not target.is_file() or stat.S_ISLNK(target.lstat().st_mode)):
            raise ValueError("Unsupported target type")
        if source.exists() and not source.is_file():
            raise ValueError("Unsupported source type")
        original = subprocess.run(["git", "show", f"{base}:{name}"], cwd=root, capture_output=True)
        current_bytes = target.read_bytes() if target.exists() else None
        base_bytes = original.stdout if original.returncode == 0 else None
        result_bytes = source.read_bytes() if source.exists() else None
        if current_bytes not in (base_bytes, result_bytes):
            raise ValueError("PUE root has concurrent changes in a Nexus output path")
    # Todas as precondições são verificadas antes da primeira escrita. Se houver
    # interrupção durante a cópia, o estado PUE permanece recuperável, sem redispatch.
    for name in sorted(actual):
        source, target = workspace / name, root / name
        if not source.exists():
            target.unlink(missing_ok=True)
            continue
        if target.exists() and target.read_bytes() == source.read_bytes():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".nexus-unit-", delete=False) as temp:
            temp_name = temp.name
        try:
            shutil.copy2(source, temp_name)
            os.replace(temp_name, target)
        finally:
            Path(temp_name).unlink(missing_ok=True)


def release_completed_workspace(mod: dict, root: Path, req: dict, unit: dict,
                                nexus_executable: str) -> dict:
    try:
        event = nexus_single(nexus_executable, "release", req["idempotency_key"], root)
        if not verified_nexus_unit(event.get("unit"), req):
            raise ValueError("Nexus release identity mismatch")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        append(mod, root, req["execution_id"], req["task_id"], "EXECUTOR_MESSAGE",
               {"workspace_cleanup": "PENDING", "idempotency_key": req["idempotency_key"]})
        return {"status": "COMPLETED_CLEANUP_PENDING", "unit": unit}
    append(mod, root, req["execution_id"], req["task_id"], "EXECUTOR_MESSAGE",
           {"workspace_cleanup": "RELEASED", "idempotency_key": req["idempotency_key"]})
    return {"status": "COMPLETED", "unit": unit}


def finish(mod: dict, root: Path, req: dict, unit: dict, renewal_failed: bool,
           nexus_executable: str) -> dict:
    execution_id, task_id = req["execution_id"], req["task_id"]
    if not verified_nexus_unit(unit, req):
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_RECEIPT_MISMATCH"}
    evidence_events(mod, root, req, unit)
    if renewal_failed or mod["lease"].assert_held(root).state != "HELD":
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "PUE_LEASE_LOST", "unit": unit}
    graph = mod["graph"].read_graph(root, execution_id)
    state = graph["nodes"][task_id]["state"]
    if unit.get("status") != "COMPLETED_VERIFIED" or unit.get("intervention_required") is True \
            or not isinstance(unit.get("evidence"), dict) \
            or unit["evidence"].get("status") != "VERIFIED":
        if state == "RUNNING":
            mod["graph"].transition(root, execution_id, task_id, "PAUSED", actor_ref="nexus")
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_NOT_VERIFIED", "unit": unit}
    if state == "RUNNING":
        mod["graph"].transition(root, execution_id, task_id, "VERIFYING", actor_ref="nexus")
    elif state != "VERIFYING":
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "PUE_UNIT_STATE_MISMATCH", "unit": unit}
    try:
        promote_verified_workspace(mod, root, req, unit)
    except (OSError, ValueError, subprocess.CalledProcessError):
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_WORKSPACE_PROMOTION_BLOCKED", "unit": unit}
    gates = mod["gate"].run_gates(root)
    if gates.get("final") != "PASS":
        append(mod, root, execution_id, task_id, "EXECUTOR_MESSAGE",
               {"pue_gates": "BLOCKED", "reason": gates.get("reason")}, issuer_kind="executor")
        return {"status": "PUE_GATES_BLOCKED", "unit": unit, "gates": gates}
    gate_event = append(mod, root, execution_id, task_id, "GATE_PASSED",
                        {"nexus_receipt_digest": unit["evidence"].get("receipt_digest"),
                         "change_set_digest": gates.get("change_set_digest"),
                         "worktree_digest": gates.get("worktree_digest")})
    mod["graph"].transition(root, execution_id, task_id, "COMPLETED",
                            actor_ref="maestro-nexus-adapter", cause_ref=gate_event["event_id"])
    result = release_completed_workspace(mod, root, req, unit, nexus_executable)
    result["gates"] = gates
    return result


def dispatch(args) -> dict:
    root, pue_root = Path(args.project_root).resolve(), Path(args.pue_root).resolve()
    admission = check(root, pue_root, args.execution_id, args.task_id, include_contract=True)
    if admission.get("status") != "READY":
        return admission
    if not any(item["intent"] == "write" for item in admission["_node"]["scope"]):
        return {"status": "BLOCKED_DECISION", "reasonCode": "NEXUS_WRITE_SCOPE_REQUIRED"}
    req = request_from(admission, root, args.nexus_project_id, args.provider, args.profile)
    mod = modules(pue_root)
    if any(mod["preflight"].tav.path_is_covered(name, [item["path"] for item in req["scope"]
                                                 if item["intent"] == "write"])
           for name in changed_paths(root, admission["baselineGitSha"])):
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_WRITE_SCOPE_ALREADY_DIRTY"}
    lease = mod["lease"].acquire(root)
    if lease.state != "ACQUIRED":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_ACQUIRED"}
    try:
        if mod["lease"].assert_held(root).state != "HELD":
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_HELD"}
        # Revalidar depois do lease; a leitura inicial não concede direito de execução.
        second = check(root, pue_root, args.execution_id, args.task_id, include_contract=True)
        stable_fields = ("authorizationId", "authorizationDigest", "trackId", "specDigest",
                         "policyDigest", "baselineGitSha")
        if second.get("status") != "READY" or any(
            second.get(field) != admission[field] for field in stable_fields
        ) or second.get("_node", {}).get("scope") != admission["_node"]["scope"]:
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_ADMISSION_CHANGED"}
        mod["preflight"].write_envelope(admission["_envelope"], root)
        mod["graph"].transition(root, args.execution_id, args.task_id, "CLAIMED", actor_ref="nexus")
        lease_event = append(mod, root, args.execution_id, args.task_id, "LEASE_ACQUIRED",
                             {"envelope_digest": req["envelope_digest"]})
        auth_event = append(mod, root, args.execution_id, args.task_id, "WORK_AUTHORIZED",
                            {"envelope_digest": req["envelope_digest"],
                             "authorization_digest": req["authorization_digest"],
                             "idempotency_key": req["idempotency_key"]})
        mod["graph"].transition(root, args.execution_id, args.task_id, "AUTHORIZED",
                                actor_ref="nexus", cause_ref=auth_event["event_id"])
        request_file = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                                    prefix="maestro-nexus-", delete=False)
        try:
            os.chmod(request_file.name, 0o600)
            json.dump(req, request_file, ensure_ascii=False)
            request_file.close()
            accepted = None
            final = None

            def handle(event):
                nonlocal accepted, final
                unit = event.get("unit")
                if not verified_nexus_unit(unit, req):
                    raise ValueError("Nexus receipt identity mismatch")
                if event.get("event") == "accepted":
                    accepted = unit
                    mod["graph"].transition(root, args.execution_id, args.task_id, "RUNNING",
                                            actor_ref="nexus", cause_ref=auth_event["event_id"])
                    append(mod, root, args.execution_id, args.task_id, "EXECUTOR_MESSAGE",
                           {"nexus_run_id": unit.get("run_id"), "nexus_plan_id": unit.get("plan_id"),
                            "plan_revision": unit.get("plan_revision"),
                            "idempotency_key": req["idempotency_key"]}, issuer_kind="executor")
                elif event.get("event") == "final":
                    final = unit
                else:
                    raise ValueError("Unexpected Nexus dispatch event")

            code, renewal_failed = nexus_events(args.nexus_executable,
                                                ["dispatch", "--request", request_file.name],
                                                root, handle, req["idempotency_key"], mod["lease"])
            if accepted is None or final is None:
                return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_RESULT_UNKNOWN",
                        "idempotencyKey": req["idempotency_key"]}
            result = finish(mod, root, req, final, renewal_failed, args.nexus_executable)
            result["idempotencyKey"] = req["idempotency_key"]
            result["nexusExitCode"] = code
            return result
        finally:
            request_file.close()
            Path(request_file.name).unlink(missing_ok=True)
    finally:
        mod["lease"].release(root)


def existing_request(args, mod: dict, allow_completed: bool = False) -> dict:
    root = Path(args.project_root).resolve()
    execution_id, task_id = args.execution_id, args.task_id
    key = identity_key(root, execution_id, task_id)
    envelope_path = root / "DEV/GOVERNANCE/EXECUTION.json"
    envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    if mod["preflight"].eev.compute_envelope_digest(envelope) != envelope.get("envelope_digest"):
        raise ValueError("PUE Envelope integrity failed")
    if envelope.get("execution_id") != execution_id:
        raise ValueError("PUE Envelope execution mismatch")
    events = mod["journal"].read_events(root, execution_id).events
    authorized = any(event.get("type") == "WORK_AUTHORIZED" and event.get("task_id") == task_id
                     and event.get("payload", {}).get("idempotency_key") == key
                     and event.get("payload", {}).get("envelope_digest") == envelope.get("envelope_digest")
                     and event.get("payload", {}).get("authorization_digest") == envelope.get("authorization", {}).get("authorization_digest")
                     for event in events)
    if not authorized:
        raise ValueError("PUE Journal has no matching unit authorization")
    node = mod["graph"].read_graph(root, execution_id)["nodes"][task_id]
    allowed_states = ("AUTHORIZED", "RUNNING", "PAUSED", "VERIFYING")
    if allow_completed:
        allowed_states += ("COMPLETED",)
    if node["state"] not in allowed_states:
        raise ValueError("PUE unit is not recoverable")
    return {
        "project_id": args.nexus_project_id, "change_id": execution_id,
        "execution_id": execution_id, "task_id": task_id,
        "track_id": envelope["request"]["track_id"],
        "envelope_digest": envelope["envelope_digest"],
        "authorization_digest": envelope["authorization"]["authorization_digest"],
        "idempotency_key": key, "scope": node["scope"],
    }


def nexus_single(executable: str, operation: str, key: str, root: Path) -> dict:
    proc = subprocess.run(
        [executable, "maestro-unit", operation, "--idempotency-key", key, "--json"],
        cwd=root, stdin=subprocess.DEVNULL, capture_output=True, timeout=15,
    )
    if proc.returncode != 0 or len(proc.stdout) > 1024 * 1024:
        raise ValueError("Nexus status command failed")
    event = json.loads(proc.stdout)
    expected_event = {"status": "status", "cancel": "cancel_requested", "release": "released"}.get(operation)
    if event.get("event") != expected_event:
        raise ValueError("Nexus status event is invalid")
    return event


def control(args) -> dict:
    root, pue_root = Path(args.project_root).resolve(), Path(args.pue_root).resolve()
    mod = modules(pue_root)
    req = existing_request(args, mod, allow_completed=args.operation == "cleanup")
    status = nexus_single(args.nexus_executable, "status", req["idempotency_key"], root)
    unit = status.get("unit")
    if not verified_nexus_unit(unit, req):
        return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_STATUS_IDENTITY_MISMATCH"}
    if args.operation == "cleanup":
        graph = mod["graph"].read_graph(root, req["execution_id"])
        events = mod["journal"].read_events(root, req["execution_id"]).events
        if graph["nodes"][req["task_id"]]["state"] != "COMPLETED" or not any(
            event.get("type") == "GATE_PASSED" and event.get("task_id") == req["task_id"]
            for event in events
        ):
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_GATES_NOT_COMPLETE"}
        lease = mod["lease"].acquire(root)
        if lease.state != "ACQUIRED":
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_ACQUIRED"}
        try:
            if mod["lease"].assert_held(root).state != "HELD":
                return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_HELD"}
            return release_completed_workspace(mod, root, req, unit, args.nexus_executable)
        finally:
            mod["lease"].release(root)
    if args.operation == "status":
        return {"status": "OBSERVED", "unit": unit,
                "pueUnitState": mod["graph"].read_graph(root, req["execution_id"])["nodes"][req["task_id"]]["state"]}
    lease = mod["lease"].acquire(root)
    if lease.state != "ACQUIRED":
        return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_ACQUIRED"}
    try:
        if mod["lease"].assert_held(root).state != "HELD":
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_LEASE_NOT_HELD"}
        if args.operation == "cancel":
            cancellation = nexus_single(args.nexus_executable, "cancel", req["idempotency_key"], root)
            canceled = cancellation.get("unit")
            if not verified_nexus_unit(canceled, req):
                return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_CANCEL_IDENTITY_MISMATCH"}
            append(mod, root, req["execution_id"], req["task_id"], "EXECUTOR_MESSAGE",
                   {"status": canceled.get("status"), "cancel_requested": True,
                    "idempotency_key": req["idempotency_key"]}, issuer_kind="executor")
            state = mod["graph"].read_graph(root, req["execution_id"])["nodes"][req["task_id"]]["state"]
            if state == "RUNNING":
                mod["graph"].transition(root, req["execution_id"], req["task_id"], "PAUSED", actor_ref="nexus")
            return {"status": "CANCEL_REQUESTED", "unit": canceled}
        # A política vigente é reavaliada antes de uma retomada que possa chamar
        # o provedor. Mudança material ou estado externo ambíguo exige intervenção.
        saved = json.loads((root / "DEV/GOVERNANCE/EXECUTION.json").read_text(encoding="utf-8"))
        fresh = mod["preflight"].decide(execution_id=req["execution_id"],
                                         created_by="maestro-nexus-adapter", root=root)
        current = fresh.get("envelope") or {}
        if fresh.get("status") != "AUTHORIZED" or any(
            current.get(field, {}).get("digest") != saved.get(field, {}).get("digest")
            for field in ("spec", "policy")
        ) or current.get("authorization", {}).get("authorization_digest") != req["authorization_digest"] \
                or current.get("authorization", {}).get("authorization_id") != saved.get("authorization", {}).get("authorization_id") \
                or current.get("request", {}).get("track_id") != req["track_id"] \
                or current.get("baseline", {}).get("git_sha") != saved.get("baseline", {}).get("git_sha"):
            return {"status": "BLOCKED_POLICY", "reasonCode": "PUE_CONTEXT_RECONCILIATION_REQUIRED"}
        if unit.get("intervention_required") is True or unit.get("status") in (
            "UNKNOWN_EXTERNAL_OUTCOME", "UNKNOWN_NEEDS_INTERVENTION", "CANCEL_PENDING_INTERVENTION",
        ):
            return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_EXTERNAL_OUTCOME_UNKNOWN", "unit": unit}
        if unit.get("status") == "COMPLETED_VERIFIED":
            state = mod["graph"].read_graph(root, req["execution_id"])["nodes"][req["task_id"]]["state"]
            if state == "PAUSED":
                mod["graph"].transition(root, req["execution_id"], req["task_id"], "RUNNING", actor_ref="nexus")
            return finish(mod, root, req, unit, False, args.nexus_executable)
        if unit.get("cancel_requested") is True:
            return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_CANCEL_PENDING", "unit": unit}
        final = None

        def handle(event):
            nonlocal final
            if not verified_nexus_unit(event.get("unit"), req):
                raise ValueError("Nexus recovery identity mismatch")
            if event.get("event") == "final":
                final = event["unit"]
            elif event.get("event") != "recovery_started":
                raise ValueError("Unexpected Nexus recovery event")

        code, renewal_failed = nexus_events(args.nexus_executable,
                                            ["recover", "--idempotency-key", req["idempotency_key"]],
                                            root, handle, req["idempotency_key"], mod["lease"])
        if final is None:
            return {"status": "INTERVENTION_REQUIRED", "reasonCode": "NEXUS_RECOVERY_UNCERTAIN"}
        state = mod["graph"].read_graph(root, req["execution_id"])["nodes"][req["task_id"]]["state"]
        if state == "PAUSED":
            mod["graph"].transition(root, req["execution_id"], req["task_id"], "RUNNING", actor_ref="nexus")
        result = finish(mod, root, req, final, renewal_failed, args.nexus_executable)
        result["nexusExitCode"] = code
        return result
    finally:
        mod["lease"].release(root)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["dispatch", "status", "cancel", "recover", "cleanup"])
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--pue-root", required=True)
    parser.add_argument("--execution-id", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--nexus-project-id", required=True)
    parser.add_argument("--nexus-executable", required=True)
    parser.add_argument("--provider", default="")
    parser.add_argument("--profile", default="")
    args = parser.parse_args()
    try:
        if args.operation == "dispatch" and not args.provider:
            result = {"status": "BLOCKED_POLICY", "reasonCode": "NEXUS_PROVIDER_REQUIRED"}
        else:
            if args.operation == "status":
                result = control(args)
            else:
                with project_lock(Path(args.project_root)):
                    result = dispatch(args) if args.operation == "dispatch" else control(args)
    except UnitBusy:
        result = {"status": "BLOCKED_POLICY", "reasonCode": "PUE_UNIT_ALREADY_ACTIVE"}
    except Exception:
        # O estado pode ter sido alterado antes da falha; nunca tentar um segundo despacho.
        result = {"status": "INTERVENTION_REQUIRED", "reasonCode": "PUE_NEXUS_DISPATCH_UNCERTAIN",
                  "idempotencyKey": identity_key(Path(args.project_root), args.execution_id, args.task_id)}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
