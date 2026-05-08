---
execution_mode: executable_sandbox
name: maestro-cli
description: Open-source CLI for mobile and web UI testing with YAML flows — install, configure, and run tests on emulators, simulators, and physical devices.
tech_stack: [maestro]
language: [yaml, shell]
capability: [e2e-testing]
version: "Maestro CLI 2.5.1"
collected_at: 2025-07-01
---

# Maestro CLI

> Source: https://docs.maestro.dev/maestro-cli, https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli, https://github.com/mobile-dev-inc/Maestro

## Purpose

The Maestro CLI is an open-source, single-binary framework for end-to-end mobile and web UI testing. Tests are written as declarative YAML "Flows" and executed against Android emulators, iOS simulators, or physical devices. Built on the philosophy of "embracing instability," it provides automatic flakiness tolerance — waiting for the screen to settle before each action — eliminating the need for manual `sleep()` calls.

## When to Use

- Running local UI tests: `maestro test flow.yaml` against a connected emulator, simulator, or device
- Continuous development: `maestro test -c` monitors YAML files and re-runs on save
- Debugging selectors: `maestro hierarchy` prints the full view hierarchy to the terminal
- Device provisioning: `maestro start-device` launches emulator/simulator configs
- Recording test runs: `maestro record` produces an MP4 of the test session
- Scaling to Maestro Cloud for parallel execution across managed devices
- **NOT** for: unit testing, API/backend testing, non-UI integration tests

## Basic Usage

### Prerequisites

Java 17+ is mandatory. Verify with `java -version`. `JAVA_HOME` must point to the Java 17+ installation.

### Install

```bash
# All platforms (macOS, Linux, Windows/WSL)
curl -fsSL "https://get.maestro.mobile.dev" | bash

# macOS alternative: Homebrew
brew tap mobile-dev-inc/tap
brew install mobile-dev-inc/tap/maestro
```

The binary lands at `$HOME/.maestro/bin/maestro`. Ensure it is on `PATH`.

### Verify

```bash
maestro --help
```

### Run a flow

```yaml
# flow.yaml
appId: com.example.app
---
- launchApp
- tapOn: "Login"
- inputText: "user@example.com"
- tapOn: "Submit"
- assertVisible: "Welcome"
```

```bash
maestro test flow.yaml
```

### Continuous mode

```bash
maestro test -c flow.yaml   # re-runs on every file save
```

## Key APIs (Summary)

| Command | Purpose |
|---|---|
| `maestro test <flow.yaml>` | Execute a YAML flow against the connected device |
| `maestro test -c` | Continuous mode: watch files and re-run on change |
| `maestro start-device` | Create and launch an emulator/simulator configuration |
| `maestro hierarchy` | Print the current app's view hierarchy (for selector debugging) |
| `maestro record` | Record test session to MP4 |
| `maestro --host <IP>` | Point to a remote ADB host (required for WSL) |

## Caveats

- **Java 17+ is mandatory.** `JAVA_HOME` must be set correctly. Without it, Maestro will fail silently or with obscure errors.
- **WSL is not recommended.** It requires ADB bridging from WSL to the Windows host (`--host` flag, port forwarding). Prefer native macOS, Windows, or Linux.
- **macOS requires Xcode + Xcode Command Line Tools** installed.
- **A connected device/emulator is required** for `maestro test`. Ensure `adb devices` (Android) or the iOS simulator lists your target.
- **The curl installer places the binary at `$HOME/.maestro/bin/maestro`.** If you get "command not found," add it to `PATH`.
- **Maestro Cloud is paid** (7-day free trial). The CLI itself is Apache 2.0 open-source.

## Composition Hints

This skill covers CLI **installation and execution**. Pair it with:
- **maestro-flow-yaml-basics** — for YAML flow authoring syntax (`tapOn`, `assertVisible`, `inputText`, etc.)
- **maestro-assertions-conditions** — for advanced assertion patterns and conditional logic in flows
- **maestro-ci-integration** — for running Maestro in CI/CD pipelines
- **maestro-cloud-execution** — for scaling to Maestro Cloud parallel runs

When building a Docker sandbox for Maestro, install OpenJDK 17 JRE headless (`openjdk-17-jre-headless`) plus `curl` and `unzip`, then download the latest `maestro.zip` from GitHub releases into `/usr/local/bin/maestro`. Set `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`.
