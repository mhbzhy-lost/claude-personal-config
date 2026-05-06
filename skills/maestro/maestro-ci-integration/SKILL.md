---
name: maestro-ci-integration
description: Integrate Maestro mobile UI tests into CI/CD pipelines via GitHub Actions or generic CLI for any CI platform (Jenkins, GitLab CI, Azure DevOps, etc.)
tech_stack: [maestro, mobile-native]
language: [bash]
capability: [ci-cd, e2e-testing]
version: "Maestro unversioned"
collected_at: 2025-07-17
---

# Maestro CI/CD Integration

> Source: https://docs.maestro.dev/maestro-cloud/ci-cd-integration/generic-ci-platform, https://docs.maestro.dev/maestro-cloud/ci-cd-integration/github-actions, https://docs.maestro.dev/maestro-cli, https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options

## Purpose

Run Maestro mobile UI tests automatically in CI/CD pipelines. Two integration paths exist: the official GitHub Action (`mobile-dev-inc/action-maestro-cloud`) for turnkey GitHub integration, and the generic `maestro cloud` CLI command that works with any CI provider. Both upload an app binary + Flow YAML directory to Maestro Cloud and return exit codes plus a console report URL.

## When to Use

- **GitHub Actions**: Simplest path — native action inputs, built-in secrets, PR-triggered runs, and optional PR merge gating.
- **Any other CI** (Jenkins, GitLab CI, Azure DevOps, Bitrise, Bitbucket Pipelines, CircleCI): Install the CLI via curl and run `maestro cloud` as a shell step.
- **Local pre-CI validation**: `maestro test` against emulators/simulators before pushing.
- **Flow development**: `maestro test -c` (continuous mode) watches YAML files and reruns on save.

## Basic Usage

### GitHub Actions (recommended for GitHub repos)

**1. Add secrets** — Repo → Settings → Secrets and variables → Actions:
- `MAESTRO_API_KEY` — from [Maestro Dashboard](https://console.maestro.dev)
- `MAESTRO_PROJECT_ID` — from project settings

**2. Workflow file** (`.github/workflows/maestro.yml`):

```yaml
name: Maestro Cloud Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  maestro-cloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          java-version: 11
          distribution: 'temurin'
      - run: ./gradlew assembleDebug
      - uses: mobile-dev-inc/action-maestro-cloud@v1
        with:
          api-key: ${{ secrets.MAESTRO_API_KEY }}
          project-id: ${{ secrets.MAESTRO_PROJECT_ID }}
          app-file: app/build/outputs/apk/debug/app-debug.apk
```

### Generic CI (any platform)

```shell
# Install CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run cloud tests
maestro cloud \
  --api-key "$MAESTRO_API_KEY" \
  --project-id "$MAESTRO_PROJECT_ID" \
  --app-file app/build/outputs/apk/debug/app-debug.apk \
  --flows "./e2e"
```

**Exit codes:** `0` = all passed, `1` = at least one Flow failed. Standard CI behavior.

### GitLab CI example

```yaml
maestro-tests:
  stage: test
  image: ubuntu:latest
  before_script:
    - curl -Ls "https://get.maestro.mobile.dev" | bash
  script:
    - maestro cloud
      --api-key "$MAESTRO_API_KEY"
      --project-id "$MAESTRO_PROJECT_ID"
      --app-file "app/build/outputs/apk/debug/app-debug.apk"
      --flows "./e2e"
      --device-os android-34
      --include-tags smoke
      --format JUNIT
      --output report.xml
  artifacts:
    when: always
    paths:
      - report.xml
```

## Key APIs (Summary)

### GitHub Action inputs

| Input | Required | Description |
|-------|----------|-------------|
| `api-key` | Yes | Maestro Cloud API key |
| `project-id` | Yes | Project ID from dashboard |
| `app-file` | Yes* | Path to APK/AAB/.app ZIP (*unless `app-binary-id` used) |
| `app-binary-id` | No | Reuse previously uploaded binary to skip re-upload |
| `async` | No | If `true`, exits immediately after upload (default: `false`) |
| `env` | No | Environment variables passed to Flows |
| `include-tags` | No | Comma-separated tags — only matching flows run |
| `exclude-tags` | No | Comma-separated tags — matching flows are skipped |
| `workspace` | No | Flow directory path (default: `.maestro`) |
| `timeout` | No | Max minutes to wait for completion (default: `30`) |
| `device-os` | No | OS version e.g. `android-34`, `iOS-26-2` |
| `device-model` | No | Device model e.g. `pixel_6`, `iPhone-17-Pro` |
| `device-locale` | No | Locale e.g. `de_DE` |
| `mapping-file` | No | ProGuard map (Android) or dSYM (iOS) for symbolication |

### `maestro cloud` CLI flags (most-used)

| Flag | Purpose |
|------|---------|
| `--api-key` | API key (required) |
| `--project-id` | Project ID (required) |
| `--app-file` | App binary path (required unless `--app-binary-id`) |
| `--app-binary-id` | Reuse cached binary |
| `--flows` | Flow directory path (required) |
| `--device-os` | Target OS version |
| `--device-model` | Target device model |
| `--include-tags` / `--exclude-tags` | Tag-based flow filtering |
| `--async` | Fire-and-forget upload |
| `--format` | Report format: `JUNIT`, `HTML`, `NOOP` |
| `--output` | Report output path (default: `report.xml`) |
| `--name` | Human-readable upload name |
| `-e`, `--env` | Environment variables: `--env KEY=VALUE` |

### Local CLI essentials

```shell
maestro test flow.yaml              # Run single flow
maestro test ./e2e                   # Run all flows in directory
maestro test -c ./e2e                # Continuous mode (watch & rerun)
maestro test --include-tags=smoke ./e2e  # Tag filter
maestro test --format JUNIT --output report.xml ./e2e  # Report output
maestro start-device --platform ios --device-model iPhone-17-Pro --device-os iOS-26-2
maestro hierarchy                    # Print view hierarchy for selector debugging
```

## Caveats

- **Deprecated flags**: `android-api-level` and `ios-version` are deprecated. Always use `--device-os` instead (e.g., `android-34`, `iOS-26-2`). Old flags still work but emit warnings.
- **Named parameters only in CI**: Positional parameters require strict ordering — use `--app-file` and `--flows` exclusively in scripts.
- **Async mode loses results**: `--async` exits immediately; the pipeline won't know if tests passed. Only use when you don't need to block on results.
- **Timeout tuning**: Android driver startup defaults to 15s, iOS to 120s. Large apps may need `export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000` (value in ms).
- **Build format**: Android APKs must be ARMv8. iOS must be `*.app` directory or zipped `.app` — not `.ipa`.
- **Flow directory structure**: Only YAML files directly in the flows directory execute as top-level tests. Files in subdirectories are subflows (run only when invoked by a top-level flow via `runFlow`).
- **Headless mode is web-only**: The `--headless` flag on `maestro test` does not apply to Android/iOS.
- **API key security**: Never commit API keys. Always use CI secrets management.
- **Cloud plan**: Both GitHub Actions integration and `maestro cloud` require a Maestro Cloud Plan.

## Composition Hints

- **Combine with `maestro-cloud-execution`**: The CI integration calls `maestro cloud` — configure device matrices, locales, and parallel execution in the cloud execution layer.
- **Combine with `maestro-flow-yaml-basics`**: CI runs the flows you author — ensure flows use proper selectors, `launchApp` with `clearState`, and subflow modularity.
- **Combine with `maestro-assertions-conditions`**: Flows with `assertVisible`/`assertNotVisible` and conditional branching give CI meaningful pass/fail signals.
- **App binary caching**: When only flows change (not the app), use `--app-binary-id` / `app-binary-id` to skip re-uploading the app — dramatically faster CI runs.
- **Tag strategy**: Use `include-tags` for smoke tests on PRs, and run full suites on main branch merges. Use `exclude-tags` to skip flaky or slow flows in CI.
- **Report artifacts**: Always set `--format JUNIT --output report.xml` in generic CI and collect the XML as a build artifact for test result visualization.
