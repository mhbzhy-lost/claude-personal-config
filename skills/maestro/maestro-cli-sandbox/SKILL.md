---
execution_mode: executable_sandbox
name: maestro-cli-sandbox
description: Run the Maestro mobile UI testing CLI in a Docker sandbox with OpenJDK 17 JRE headless and the maestro binary at /usr/local/bin/maestro.
tech_stack: [maestro]
language: [shell]
capability: [ci-cd, container, e2e-testing]
version: "Maestro CLI 2.5.1"
collected_at: 2025-07-17
---

# Maestro CLI (Docker Sandbox)

> Source: https://github.com/mobile-dev-inc/maestro, https://docs.maestro.dev/maestro-cli, https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli, https://raw.githubusercontent.com/mobile-dev-inc/maestro/main/CHANGELOG.md

## Purpose

Run the Maestro CLI binary in an isolated Docker sandbox. The sandbox provides OpenJDK 17 JRE headless and the `maestro` binary — no device connectivity is assumed. This skill covers installation, CLI invocation patterns, and the subset of commands that work without a local device (version checks, cloud uploads, syntax validation, help output).

## When to Use

- Verifying `maestro --version` or `maestro --help` in CI/CD pipelines.
- Uploading flows to Maestro Cloud (`maestro cloud`) from a headless environment.
- Validating flow syntax (`maestro check-syntax` / `maestro test --dry-run` patterns).
- Listing cloud devices (`maestro list-cloud-devices`) for device matrix selection.
- Running the MCP server (`maestro mcp`) in a container.
- Any scenario where you need the Maestro CLI without a full macOS/Windows developer setup.

**Do NOT use this skill for**: local device testing (`maestro test` against an emulator), flow recording (`maestro record`), or `maestro start-device` — those require a connected device or emulator.

## Basic Usage

### Installation (Docker Sandbox)

```bash
apt-get update && apt-get install -y openjdk-17-jre-headless curl unzip
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

The binary lands at `$HOME/.maestro/bin/maestro`. Ensure `JAVA_HOME` is set and the binary is on `PATH`.

To pin a specific version:
```bash
export MAESTRO_VERSION=2.5.1
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

### Verification

```bash
maestro --version    # e.g. "2.5.1"
maestro --help       # full help output with subcommands
```

### Cloud Upload (primary sandbox workflow)

```bash
maestro cloud \
  --app-file=app.apk \
  --flows=flows/ \
  --api-key=$MAESTRO_API_KEY \
  --device-os=android-34 \
  --device-model=pixel_7 \
  --name="CI run $(git rev-parse --short HEAD)"
```

Named parameters (`--app-file`, `--flows`, etc.) can appear in any order and are strongly recommended for CI/CD scripts.

### List Cloud Devices

```bash
maestro list-cloud-devices --platform=android
maestro list-cloud-devices --platform=ios
```

### Syntax Check

```bash
maestro test --format=NOOP flow.yaml   # validates without running
```

## Key APIs (Summary)

### Global Flags
| Flag | Purpose |
|------|---------|
| `-v`, `--version` | Print installed version |
| `-h`, `--help` | Full help or subcommand help |
| `-p`, `--platform` | `ios`, `android`, or `web` |
| `--verbose` | Verbose logging |
| `--device=<udid>` | Target a specific device by UDID |

### Essential Subcommands
| Command | Sandbox-safe? | Purpose |
|---------|:---:|---|
| `maestro --version` | ✓ | Version check |
| `maestro --help` | ✓ | Help output |
| `maestro cloud` | ✓ | Upload flows + app to Maestro Cloud |
| `maestro list-cloud-devices` | ✓ | Enumerate available cloud devices |
| `maestro login` / `logout` | ✓ | Maestro Cloud auth |
| `maestro mcp` | ✓ | Start MCP server |
| `maestro download-samples` | ✓ | Fetch sample flows and apps |
| `maestro test` | ✗ | Requires local device |
| `maestro record` | ✗ | Requires local device |
| `maestro start-device` | ✗ | Requires local emulator/simulator |
| `maestro list-devices` | ✗ | Requires local device |

### `maestro cloud` Critical Options
| Option | Purpose |
|--------|---------|
| `--app-file=<path>` | App binary (.apk / .ipa / .app) |
| `--app-binary-id=<id>` | Reuse a previously uploaded binary |
| `--flows=<path>` | Flow file or directory |
| `--device-os=<os>` | e.g. `iOS-18-2`, `android-34` |
| `--device-model=<model>` | e.g. `iPhone-17-Pro`, `pixel_7` |
| `--api-key=<key>` | API key for Maestro Cloud |
| `--async` | Upload and exit; don't wait for results |
| `--name=<name>` | Human-readable upload name |
| `--mapping=<path>` | dSYM (iOS) / Proguard mapping (Android) |
| `--include-tags` / `--exclude-tags` | Filter flows by tag |
| `-e`, `--env=<K=V>` | Inject environment variables into flows |
| `--format=<fmt>` | `JUNIT`, `HTML`, `NOOP` |

## Caveats

- **Java 17+ mandatory**: Maestro 2.0.0 dropped support for older Java versions. The sandbox MUST have `openjdk-17-jre-headless` (or JDK equivalent) and `JAVA_HOME` set.
- **No local device support in sandbox**: `maestro test`, `maestro record`, `maestro start-device`, and `maestro list-devices` require a connected emulator/simulator. These will fail in a headless container.
- **GraalJS replaces Rhino** (since 2.0.0): JavaScript expressions in flows use GraalJS. Some Rhino-specific patterns differ — test JS-heavy flows against the target version.
- **WSL is not recommended** by the Maestro team. Use native macOS, Windows, or Linux.
- **Cloud upload size**: Workspace zips exceeding 20 MB trigger a CLI warning and may slow cloud queue times.
- **`--config` file detection** (since 2.5.0): Workspace config files are now detected by YAML content (top-level keys), not filename. Files like `platform_settings.yaml` won't be mis-parsed as flows.
- **Deprecated flags**: `--ios-version`, `--android-api-level`, `--os-version` are deprecated in favor of `--device-os` and `--device-model`.

## Composition Hints

This skill is the **entry point** for all Maestro CLI interactions. Compose with:

- **maestro-flow-yaml-basics** — for writing and structuring YAML flow files that `maestro test` or `maestro cloud` will execute.
- **maestro-assertions-conditions** — for `assertVisible`, `assertNotVisible`, conditional logic, and JavaScript expressions within flows.
- **maestro-cloud-execution** — for Maestro Cloud parallel execution patterns, sharding, and result interpretation.
- **maestro-ci-integration** — for GitHub Actions, GitLab CI, and other CI provider configurations that invoke `maestro cloud`.

In CI/CD, the typical pipeline: this skill provides the binary → `maestro-ci-integration` configures the job → `maestro cloud` uploads flows authored with `maestro-flow-yaml-basics` and `maestro-assertions-conditions` → `maestro-cloud-execution` interprets results.
