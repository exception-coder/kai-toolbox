"""Real installed Graphify contract tests, entirely in temporary fixture directories."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

BRIDGE = Path(__file__).resolve().parents[2] / "main/resources/graphify/registry_sync.py"


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
        result = subprocess.run([sys.executable, "-I", str(BRIDGE), "--root", str(self.root),
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
