import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent / "plan-tracker.py"


def run_tracker(root: str):
    return subprocess.run(
        [sys.executable, str(SCRIPT), root],
        capture_output=True,
        text=True,
    )


class PlanTrackerTests(unittest.TestCase):
    def test_no_plan_files_exits_0(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "readme.md").write_text("# Not a plan\n")
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), "")

    def test_plan_without_frontmatter_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "notes.md").write_text("- TODO: some task\n")
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0)

    def test_active_plan_with_all_done_exits_0(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nplan: active\n---\n# Plan\n\n- DONE: first\n- DONE: second\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0, r.stdout)

    def test_active_plan_with_todo_exits_1(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nplan: active\n---\n# Plan\n\n- TODO: pending task\n- DONE: done\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("pending task", r.stdout)
            self.assertIn("plan.md", r.stdout)

    def test_paused_plan_skips_todo_check(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nplan: paused\n---\n# Plan\n\n- TODO: allow push anyway\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0, r.stdout)

    def test_completed_plan_skips_todo_check(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nplan: completed\n---\n- TODO: this should be ignored\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0)

    def test_lists_all_pending_todos(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nplan: active\n---\n"
                "- TODO: task A\n- DONE: task B\n- TODO: task C\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("task A", r.stdout)
            self.assertIn("task C", r.stdout)
            self.assertNotIn("task B", r.stdout)

    def test_scan_subdirectories(self):
        with tempfile.TemporaryDirectory() as d:
            sub = Path(d) / "docs" / "plans"
            sub.mkdir(parents=True)
            (sub / "plan.md").write_text(
                "---\nplan: active\n---\n- TODO: nested task\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("nested task", r.stdout)

    def test_multiple_plans_each_checked(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan1.md").write_text(
                "---\nplan: active\n---\n- TODO: plan1 task\n"
            )
            (Path(d) / "plan2.md").write_text(
                "---\nplan: active\n---\n- TODO: plan2 task\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("plan1 task", r.stdout)
            self.assertIn("plan2 task", r.stdout)


if __name__ == "__main__":
    unittest.main()
