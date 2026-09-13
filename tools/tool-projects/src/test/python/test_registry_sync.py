"""Real installed Graphify contract tests, entirely in temporary fixture directories."""
import json
import copy
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

BRIDGE = Path(__file__).resolve().parents[2] / "main/resources/graphify/registry_sync.py"


class SourceIdentityCacheContract(unittest.TestCase):
    def test_native_unresolved_link_normalization_retains_original_evidence(self):
        spec = importlib.util.spec_from_file_location("registry_bridge_test", BRIDGE)
        bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bridge)
        root = Path.cwd().resolve()
        external = {"source": "a", "target": "external", "source_file": "a.py"}
        internal = {"source": "a", "target": "b"}
        candidate = {"nodes": [{"id": "a"}, {"id": "b"}], "links": [internal, external]}
        normalized, unresolved = bridge.normalize_links(candidate, None, set(), root)
        self.assertEqual([internal], normalized["links"])
        self.assertEqual([external], unresolved)
        bridge.validate_graph(normalized, None, set(), root)
        baseline = {"forgeCoverage": {"unresolvedLinks": [external]}}
        _, retained = bridge.normalize_links(normalized, baseline, set(), root)
        self.assertEqual([external], retained)
        _, replaced = bridge.normalize_links(normalized, baseline, {root / "a.py"}, root)
        self.assertEqual([], replaced)

    def test_native_disambiguation_is_unchanged_and_cache_is_restored(self):
        from graphify.extractors import resolution
        spec = importlib.util.spec_from_file_location("registry_bridge_test", BRIDGE)
        bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bridge)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            nodes = [{"id": "same", "type": "function", "source_file": str(root / name)}
                     for name in ("a.py", "b.py", "a.py", "b.py")]
            edges = [{"source": "same", "target": "same", "source_file": str(root / "a.py")}]
            expected = copy.deepcopy((nodes, edges, []))
            resolution._disambiguate_colliding_node_ids(*expected, root)
            actual = copy.deepcopy((nodes, edges, []))
            original = resolution._source_key
            original_js = resolution._js_source_path
            with patch.object(resolution, "_source_key", wraps=original) as calls:
                with bridge.cached_graphify_source_keys():
                    resolution._disambiguate_colliding_node_ids(*actual, root)
                    for source in ("", "a.py", str(root / "a.py")):
                        self.assertEqual(original_js(source, root), resolution._js_source_path(source, root))
                self.assertIs(resolution._source_key, calls)
                self.assertLessEqual(calls.call_count, 2)
            self.assertEqual(expected, actual)
            with self.assertRaisesRegex(RuntimeError, "stop"):
                with bridge.cached_graphify_source_keys():
                    raise RuntimeError("stop")
            self.assertIs(original, resolution._source_key)
            self.assertIs(original_js, resolution._js_source_path)


class GraphifyIncrementalContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="forge-graph-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        (self.root / "lib.py").write_text("def answer():\n    return 1\n", encoding="utf-8")
        (self.root / "caller.py").write_text("from lib import answer\ndef call():\n    return answer()\n", encoding="utf-8")
        (self.root / "unrelated.py").write_text("def untouched():\n    return 42\n", encoding="utf-8")
        self.run_update("FULL")

    def run_update(self, mode, publish=True, succeeds=True):
        stage = Path(tempfile.mkdtemp(dir=self.base, prefix="candidate-"))
        result = subprocess.run([sys.executable, "-I", "-X", "utf8", str(BRIDGE), "--root", str(self.root),
                                 "--stage", str(stage), "--mode", mode], capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=90)
        if not succeeds:
            self.assertNotEqual(0, result.returncode)
            return result
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        report = json.loads((stage / "forge-sync-result.json").read_text(encoding="utf-8"))
        if publish:
            live = self.root / "graphify-out"
            live.mkdir(exist_ok=True)
            for name in ("graph.json", "manifest.json", ".graphify_build.json"):
                shutil.copy2(stage / name, live / name)
            if (stage / "cache").exists():
                shutil.copytree(stage / "cache", live / "cache", dirs_exist_ok=True)
        return report, stage

    def graph(self):
        return json.loads((self.root / "graphify-out/graph.json").read_text(encoding="utf-8"))

    def test_noop_does_not_rewrite_graph_and_scope_is_empty(self):
        before = (self.root / "graphify-out/graph.json").read_bytes()
        report, stage = self.run_update("SYNC", publish=False)
        self.assertTrue(report["noChanges"])
        self.assertEqual([], report["scope"])
        self.assertEqual(3, report["reused"])
        self.assertEqual(before, (stage / "graph.json").read_bytes())

    def test_build_output_is_excluded_and_large_source_is_processed(self):
        generated = self.root / "out/artifacts/generated.py"
        generated.parent.mkdir(parents=True)
        generated.write_text("def generated():\n    pass\n", encoding="utf-8")
        source = self.root / "large.js"
        source.write_text("/*" + "a" * 2_987_094 + "*/\nfunction largeLibrary() {}", encoding="utf-8")
        report, _ = self.run_update("FULL")
        sources = {node.get("source_file") for node in self.graph()["nodes"]}
        self.assertIn("large.js", sources)
        self.assertNotIn("out/artifacts/generated.py", sources)
        self.assertEqual(4, report["changed"])

    def test_zero_node_file_is_an_explicit_coverage_gap(self):
        (self.root / "empty.json").write_text("{}", encoding="utf-8")
        report, _ = self.run_update("FULL")
        self.assertIn("empty.json", report["missingSources"])
        self.assertIn("empty.json", self.graph()["forgeCoverage"]["missingSources"])
        self.assertTrue(self.graph()["forgeCoverage"]["warnings"])

    def test_edit_preserves_unrelated_nodes_and_refreshes_neighbor_scope(self):
        old = self.graph()
        untouched = {n["id"] for n in old["nodes"] if n.get("source_file") == "unrelated.py"}
        (self.root / "lib.py").write_text("def answer():\n    return 2\ndef extra():\n    return 3\n", encoding="utf-8")
        report, _ = self.run_update("SYNC")
        self.assertEqual(1, report["changed"])
        self.assertIn("lib.py", report["scope"])
        self.assertNotIn("unrelated.py", report["scope"])
        self.assertTrue(untouched.issubset({n["id"] for n in self.graph()["nodes"]}))
        # The native Python extractor must have established the cross-file dependency.
        self.assertIn("caller.py", report["scope"])

    def test_add_delete_and_rename_do_not_leave_obsolete_source_nodes(self):
        (self.root / "new.py").write_text("def added():\n    return 9\n", encoding="utf-8")
        report, _ = self.run_update("SYNC")
        self.assertEqual(1, report["changed"])
        (self.root / "new.py").rename(self.root / "renamed.py")
        report, _ = self.run_update("SYNC")
        self.assertEqual(1, report["deleted"])
        self.assertEqual(1, report["changed"])
        self.assertNotIn("new.py", {n.get("source_file") for n in self.graph()["nodes"]})
        (self.root / "renamed.py").unlink()
        report, _ = self.run_update("SYNC")
        self.assertEqual(1, report["deleted"])
        self.assertNotIn("renamed.py", {n.get("source_file") for n in self.graph()["nodes"]})

    def test_bad_manifest_does_not_change_live_graph(self):
        before = (self.root / "graphify-out/graph.json").read_bytes()
        (self.root / "graphify-out/manifest.json").write_text("broken", encoding="utf-8")
        self.run_update("SYNC", succeeds=False)
        self.assertEqual(before, (self.root / "graphify-out/graph.json").read_bytes())

    def test_content_change_with_preserved_mtime_is_detected(self):
        source = self.root / "lib.py"
        stamp = source.stat()
        source.write_text("def answer():\n    return 2\n", encoding="utf-8")
        os.utime(source, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
        report, _ = self.run_update("SYNC")
        self.assertEqual(1, report["changed"])
        self.assertFalse(report["noChanges"])


if __name__ == "__main__":
    unittest.main()
