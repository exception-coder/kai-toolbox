"""Forge orchestration around the installed Graphify structural updater.

All Graphify output goes to a staging directory; the Java owner publishes it.
No LLM, graph algorithm replacement or executable from project metadata is used.
"""
import argparse
import contextlib
import hashlib
import importlib.metadata
import inspect
import json
import os
from pathlib import Path
import shutil
import tempfile

SUPPORTED_VERSION = "0.9.16"
MAX_GRAPH_BYTES = 128 * 1024 * 1024
MAX_SOURCES = 50000
MAX_CHANGED = 2000


def read_json(path):
    if path.is_symlink() or path.stat().st_size > MAX_GRAPH_BYTES:
        raise ValueError("Graphify artifact is a link or exceeds 128 MiB")
    return json.loads(path.read_text(encoding="utf-8"))


def source_path(value, root):
    if not value:
        return None
    path = Path(value.replace("\\", "/"))
    path = (root / path).resolve() if not path.is_absolute() else path.resolve()
    if not path.is_relative_to(root):
        return None
    return path


def seed_stage(root, stage, incremental):
    live = root / "graphify-out"
    baseline = None
    if incremental:
        try:
            baseline = read_json(live / "graph.json")
            manifest = read_json(live / "manifest.json")
        except (OSError, ValueError) as error:
            raise ValueError("图谱或清单缺失、损坏，请执行完整初始化") from error
        if not isinstance(baseline.get("nodes"), list) or not baseline["nodes"]:
            raise ValueError("图谱基线为空，请执行完整初始化")
        if not isinstance(manifest, dict) or not manifest:
            raise ValueError("缺少有效图谱清单，请执行完整初始化")
        shutil.copy2(live / "graph.json", stage / "graph.json")
        # Reuse native content comparison, including edits with preserved mtimes.
        for entry in manifest.values():
            if isinstance(entry, dict):
                entry["mtime"] = -1
        (stage / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    config = live / ".graphify_build.json"
    if config.is_file() and not config.is_symlink():
        shutil.copy2(config, stage / config.name)
    # AST entries are content-addressed. Do not reuse a stat fast-path index.
    total = count = 0
    cache = live / "cache" / "ast"
    if cache.is_dir() and not cache.is_symlink():
        for path in cache.rglob("*.json"):
            if path.is_symlink() or not path.resolve().is_relative_to(cache.resolve()):
                continue
            total += path.stat().st_size
            count += 1
            if total > 256 * 1024 * 1024 or count > 10000:
                break
            target = stage / "cache" / "ast" / path.relative_to(cache)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    return baseline


def graph_sources(graph, root):
    return {node["id"]: source_path(node.get("source_file"), root)
            for node in graph.get("nodes", [])}


def source_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def affected_sources(graph, changed, root):
    sources = graph_sources(graph, root)
    affected = set()
    for edge in graph.get("links", graph.get("edges", [])):
        left, right = sources.get(edge.get("source")), sources.get(edge.get("target"))
        if left in changed or right in changed:
            affected.update(path for path in (left, right) if path and path not in changed)
    return affected


def validate_graph(candidate, baseline, scope, root):
    nodes = candidate.get("nodes")
    edges = candidate.get("links", candidate.get("edges"))
    if not isinstance(nodes, list) or not nodes or not isinstance(edges, list):
        raise ValueError("Graphify output has no valid nodes/edges")
    ids = {node["id"] for node in nodes}
    if len(ids) != len(nodes):
        raise ValueError("Graphify output contains duplicate node IDs")
    if any(edge.get("source") not in ids or edge.get("target") not in ids for edge in edges):
        raise ValueError("Graphify output contains dangling relationships")
    if baseline:
        old_sources = graph_sources(baseline, root)
        preserved = {node_id for node_id, path in old_sources.items() if path not in scope}
        if not preserved.issubset(ids):
            raise ValueError("Graphify dropped nodes outside the affected scope; original graph retained")
        def edge_key(edge):
            return edge.get("source"), edge.get("target"), edge.get("relation")
        new_edges = {edge_key(edge) for edge in edges}
        for edge in baseline.get("links", baseline.get("edges", [])):
            if old_sources.get(edge.get("source")) not in scope and old_sources.get(edge.get("target")) not in scope:
                if edge_key(edge) not in new_edges:
                    raise ValueError("Graphify dropped a relationship outside the affected scope")


def run(root, stage, mode):
    version = importlib.metadata.version("graphifyy")
    if version != SUPPORTED_VERSION:
        raise RuntimeError(f"Graphify {version} 尚未验证；当前增量适配支持 {SUPPORTED_VERSION}")
    os.environ["GRAPHIFY_OUT"] = str(stage)
    os.environ["GRAPHIFY_MAX_WORKERS"] = "1"
    from graphify.detect import detect_incremental, save_manifest
    from graphify.extract import _get_extractor
    from graphify.watch import _rebuild_code, _read_build_excludes
    if "changed_paths" not in inspect.signature(_rebuild_code).parameters:
        raise RuntimeError("Graphify 缺少 changed_paths 增量接口")
    incremental = mode == "SYNC"
    baseline = seed_stage(root, stage, incremental)
    excludes = _read_build_excludes(stage) or []
    excludes += [".codex-work", ".codex-remote-attachments", ".kai-chat-attachments", ".forge", "outputs"]
    # Native detection/rebuild use the same exclusions.
    from graphify.watch import _write_build_config
    _write_build_config(stage, excludes=excludes)
    detection = detect_incremental(root, manifest_path=str(stage / "manifest.json"),
                                   kind="ast", follow_symlinks=False, extra_excludes=excludes)
    all_files = {source_path(value, root) for values in detection["files"].values() for value in values}
    all_files.discard(None)
    if len(all_files) > MAX_SOURCES:
        raise RuntimeError("扫描超过 50000 文件上限，未修改图谱")
    structural = {path for path in all_files if _get_extractor(path) is not None}
    changed = {source_path(value, root) for values in detection.get("new_files", {}).values() for value in values} & structural
    deleted = {source_path(value, root) for value in detection.get("deleted_files", [])}
    deleted.discard(None)
    # Files outside current detection can reflect exclusions as well as deletions.
    deleted = {path for path in deleted if not path.exists() or path not in structural}
    affected = affected_sources(baseline, changed | deleted, root) & structural if baseline else set()
    scope = changed | deleted | affected
    if incremental and len(scope) > MAX_CHANGED:
        raise RuntimeError(f"本次需处理 {len(scope)} 个文件，超过单次 2000 文件上限；未修改图谱")
    before = {str(path): source_hash(path) for path in structural}
    if scope or not incremental:
        # Native extraction can report a skipped file without failing the rebuild.
        # Do not publish that partial result as fresh structural evidence.
        with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as diagnostics:
            with contextlib.redirect_stderr(diagnostics):
                ok = _rebuild_code(root, changed_paths=sorted(scope) if incremental else None,
                                   no_cluster=True, acquire_lock=False, force=False)
            diagnostics.seek(0)
            for line in diagnostics:
                if "warning" in line.lower() or "failed" in line.lower():
                    raise RuntimeError("Graphify 提取不完整，原图谱保留：" + line.strip()[:1000])
        if not ok:
            raise RuntimeError("Graphify 增量提取或安全校验失败，原图谱保留")
    if before != {str(path): source_hash(path) for path in structural if path.is_file()}:
        raise RuntimeError("提取期间源码发生变化，未发布图谱")
    candidate = read_json(stage / "graph.json")
    validate_graph(candidate, baseline, scope, root)
    if baseline and not (not scope and incremental):
        for key in ("directed", "multigraph"):
            if key in baseline:
                candidate[key] = baseline[key]
        (stage / "graph.json").write_text(json.dumps(candidate, ensure_ascii=False), encoding="utf-8")
    # Stamp only structural sources; semantic freshness is not advanced by AST work.
    save_manifest({"code": [str(path) for path in structural]},
                  manifest_path=str(stage / "manifest.json"), kind="ast", root=root)
    summary = {"mode": mode, "version": version, "changed": len(changed), "deleted": len(deleted),
               "affected": len(affected), "reused": len(structural - changed - affected),
               "nodes": len(candidate["nodes"]), "noChanges": not scope and incremental,
               "scope": sorted(str(path.relative_to(root)) for path in scope)}
    (stage / "forge-sync-result.json").write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "scope"}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--mode", choices=["FULL", "SYNC"], required=True)
    args = parser.parse_args()
    run(Path(args.root).resolve(), Path(args.stage).resolve(), args.mode)
