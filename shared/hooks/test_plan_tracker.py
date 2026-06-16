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
                "---\nstatus: active\n---\n# Plan\n\n- DONE: first\n- DONE: second\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0, r.stdout)

    def test_active_plan_with_todo_exits_1(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nstatus: active\n---\n# Plan\n\n- TODO: pending task\n- DONE: done\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("pending task", r.stdout)
            self.assertIn("plan.md", r.stdout)

    def test_paused_plan_skips_todo_check(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nstatus: paused\n---\n# Plan\n\n- TODO: allow push anyway\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0, r.stdout)

    def test_completed_plan_skips_todo_check(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nstatus: completed\n---\n- TODO: this should be ignored\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 0)

    def test_lists_all_pending_todos(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan.md").write_text(
                "---\nstatus: active\n---\n"
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
                "---\nstatus: active\n---\n- TODO: nested task\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("nested task", r.stdout)

    def test_multiple_plans_each_checked(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "plan1.md").write_text(
                "---\nstatus: active\n---\n- TODO: plan1 task\n"
            )
            (Path(d) / "plan2.md").write_text(
                "---\nstatus: active\n---\n- TODO: plan2 task\n"
            )
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("plan1 task", r.stdout)
            self.assertIn("plan2 task", r.stdout)

    def test_unreadable_file_skipped(self):
        """Test that unreadable files don't crash the whole scan."""
        with tempfile.TemporaryDirectory() as d:
            # Create a valid plan with pending TODO
            plan_file = Path(d) / "plan.md"
            plan_file.write_text(
                "---\nstatus: active\n---\n- TODO: valid task\n"
            )
            
            # Create a binary file that can't be decoded as UTF-8
            binary_file = Path(d) / "binary.bin"
            binary_file.write_bytes(b"\xff\xfe\x00\x01\x89\x50")
            
            # Should still find the pending TODO and exit 1
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("valid task", r.stdout)

    def test_corrupted_utf8_file_skipped(self):
        """Test that corrupted UTF-8 files don't crash the whole scan."""
        with tempfile.TemporaryDirectory() as d:
            # Create a valid plan
            plan_file = Path(d) / "plan.md"
            plan_file.write_text(
                "---\nstatus: active\n---\n- TODO: valid task\n"
            )
            
            # Create a file with invalid UTF-8 sequences
            corrupted_file = Path(d) / "corrupted.md"
            corrupted_file.write_bytes(
                b"---\nstatus: active\n---\n- TODO: \xff\xfe task\n"
            )
            
            # Should still process the valid plan
            r = run_tracker(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("valid task", r.stdout)

    def test_permission_error_skipped(self):
        """Test that permission errors don't crash the whole scan."""
        with tempfile.TemporaryDirectory() as d:
            # Create a valid plan
            plan_file = Path(d) / "plan.md"
            plan_file.write_text(
                "---\nstatus: active\n---\n- TODO: valid task\n"
            )
            
            # Create an unreadable file (if not running as root)
            unreadable_file = Path(d) / "unreadable.md"
            unreadable_file.write_text("---\nstatus: active\n---\n- TODO: hidden\n")
            try:
                unreadable_file.chmod(0o000)
                
                # Should still process the valid plan
                r = run_tracker(d)
                self.assertEqual(r.returncode, 1)
                self.assertIn("valid task", r.stdout)
            finally:
                # Restore permissions for cleanup
                try:
                    unreadable_file.chmod(0o644)
                except:
                    pass

    def test_yaml_quoted_status(self):
        """Test that YAML quoted status values are parsed correctly."""
        test_cases = [
            ('status: "active"', True),   # Double quotes should work
            ("status: 'active'", True),   # Single quotes should work
            ('status: "completed"', False),  # Completed should not block
            ('status: "paused"', False),  # Paused should not block
        ]
        
        for status_line, should_block in test_cases:
            with tempfile.TemporaryDirectory() as d:
                plan_file = Path(d) / "plan.md"
                plan_file.write_text(
                    f"---\n{status_line}\n---\n- TODO: task\n"
                )
                
                r = run_tracker(d)
                if should_block:
                    self.assertEqual(
                        r.returncode, 1,
                        f"Failed for {status_line}: expected exit 1, got {r.returncode}"
                    )
                else:
                    self.assertEqual(
                        r.returncode, 0,
                        f"Failed for {status_line}: expected exit 0, got {r.returncode}"
                    )


if __name__ == "__main__":
    unittest.main()
