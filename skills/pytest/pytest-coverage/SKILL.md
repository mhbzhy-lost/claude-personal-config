---
name: pytest-coverage
description: Code coverage measurement for pytest via pytest-cov — terminal/HTML/XML reports, xdist support, coverage contexts
tech_stack: [backend]
language: python
capability: [unit-testing, ci-cd]
version: "pytest-cov 7.x"
collected_at: 2025-01-01
---

# pytest-cov (Coverage)

> Source: https://pytest-cov.readthedocs.io/en/latest/, https://github.com/pytest-dev/pytest-cov

## Purpose

Measure code coverage during pytest runs using the `coverage` package. Provides automatic data-file management, terminal/HTML/XML/JSON reporting, branch coverage, per-test contexts, full xdist (parallel) support, and failure thresholds — all through pytest CLI flags or standard coverage config files.

## When to Use

- Measuring line/branch coverage of your Python code during tests
- Enforcing coverage minimums in CI (`--cov-fail-under=80`)
- Generating HTML/XML reports for CI dashboards and code review
- Combining coverage across parallel (xdist) test workers
- Per-test coverage tracking with `--cov-context=test`
- Subprocess coverage (multiprocessing, subprocess)

## Basic Usage

```bash
pip install pytest-cov

# Basic: measure coverage on myproj, show terminal report
pytest --cov=myproj tests/

# With missing lines, HTML report, and branch coverage
pytest --cov=myproj --cov-report=term-missing --cov-report=html --cov-branch

# Fail if under 80%
pytest --cov=myproj --cov-fail-under=80
```

Output:
```
-------------------- coverage: ... ---------------------
Name                 Stmts   Miss  Cover
----------------------------------------
myproj/__init__          2      0   100%
myproj/myproj          257     13    94%
myproj/feature4286      94      7    92%
----------------------------------------
TOTAL                  353     20    94%
```

## Key APIs (Summary)

### CLI flags

| Flag | Purpose |
|------|---------|
| `--cov=PATH` | Measure coverage for this package/module (required) |
| `--cov-report=FORMAT` | `term`, `term-missing`, `html`, `xml`, `json`, `lcov`, `annotate` (repeatable) |
| `--cov-branch` | Enable branch coverage |
| `--cov-fail-under=N` | Exit with error if coverage < N% |
| `--cov-append` | Append to existing `.coverage` instead of erasing |
| `--cov-context=test` | Per-test coverage context (includes parametrize ids) |
| `--cov-config=PATH` | Path to `.coveragerc`/`pyproject.toml` |
| `--no-cov` | Disable coverage (override config) |
| `--no-cov-on-fail` | Skip writing `.coverage` data if any tests failed |

### Configuration files

All standard `coverage` options work in `.coveragerc`, `pyproject.toml`, `setup.cfg`, or `tox.ini`:

```toml
# pyproject.toml
[tool.coverage.run]
source = ["myproj"]
branch = true
omit = ["*/tests/*", "*/migrations/*"]
concurrency = ["multiprocessing"]   # for subprocess coverage

[tool.coverage.report]
fail_under = 80
show_missing = true
```

### Embed defaults in pytest config

```ini
# pytest.ini
[pytest]
addopts = --cov=myproj --cov-report=term-missing --cov-report=html
```

### Markers

- `@pytest.mark.no_cover` — exclude this test from coverage measurement
- `@pytest.mark.cov(...)` — per-test coverage configuration

### xdist (parallel testing)

```bash
pytest --cov=myproj -n 4          # each worker writes own .coverage, auto-combined
pytest --cov=myproj --cov-append -n 4  # workers append to shared data
```

All workers must have `pytest-cov` installed. Coverage data is automatically combined at the end.

### Subprocess coverage (v7+)

The `.pth`-file approach was removed in v7. Use coverage's native concurrency support:

```ini
[run]
concurrency = multiprocessing
```

## Caveats

- **xdist requires pytest-cov on every worker**: Each parallel worker environment must have the plugin installed.
- **Upgrading from ≤6.3**: `.pth`-file-based subprocess coverage was removed in v7. Migrate to `concurrency = multiprocessing` in coverage config.
- **`coverage run` vs `pytest --cov`**: `coverage run -m pytest` adds CWD to `sys.path`; `pytest --cov` does not. This can cause import resolution differences.
- **Performance overhead**: Coverage slows tests down. Use `--no-cov` in local dev, enable only in CI.
- **Data file conflicts**: Don't run multiple `pytest --cov` in the same directory without xdist. Use `COVERAGE_FILE` env var or separate output dirs if needed.
- **Stale `.pth` files**: Old `pytest-cov.pth` or `init_cov_core.pth` may remain in site-packages after uninstall — remove manually if coverage behaves unexpectedly.
- **Data file lifecycle**: `.coverage` is erased at start of each run (unless `--cov-append`) and left after testing for post-run tooling.

## Composition Hints

- **With pytest-mock / pytest-fastapi**: Coverage tracks all code paths hit by TestClient or mocked services — combine with `--cov-fail-under` in CI to enforce minimums.
- **With pytest-xdist**: Install `pytest-xdist` alongside `pytest-cov` for parallel coverage; results auto-combine.
- **With pytest-parametrize**: `--cov-context=test` tags each parametrized variant separately, enabling per-case coverage analysis.
- **CI integration**: Generate XML (`--cov-report=xml`) for services like Codecov/Coveralls, HTML (`--cov-report=html`) for artifact archives.
