---
name: appium-parallel-grid
description: Selenium Grid 4 relay with Appium for multi-device parallel execution and device farm management
tech_stack: [appium, mobile-native]
language: [java, bash]
capability: [e2e-testing, ci-cd]
version: "Appium 2.x with Selenium Grid 4"
collected_at: 2025-07-16
---

# Appium Parallel Grid

> Source: https://appium.io/docs/en/2.0/guides/grid/, https://appium.readthedocs.io/en/stable/en/advanced-concepts/parallel-tests/, https://github.com/AppiumTestDistribution/appium-device-farm

## Purpose
Run Appium tests in parallel across multiple devices using Selenium Grid 4 relay, single-server multi-session isolation, or the Appium Device Farm plugin — with correct port isolation and capability matching.

## When to Use
- **Selenium Grid 4 Relay** — multi-Appium-server grid with centralized hub; preferred for new setups
- **Single-Server Parallel** — multiple devices on one machine, no extra Java infrastructure
- **Appium Device Farm** — managed device farm with dashboard, remote access, CI/CD integration
- **Grid 3 Fallback** — existing Grid 3 infrastructure

## Basic Usage

### Architecture (Grid 4)
```
2+ Appium servers → 2+ Grid nodes → 1 Grid hub → single endpoint :4444
```

### Quick Start (Grid 4)
```bash
# 1. Appium servers with unique ports
appium --config appium1.yml   # port 4723
appium --config appium2.yml   # port 4733

# 2. Grid nodes (one per Appium server)
java -jar selenium.jar node --config node1.toml
java -jar selenium.jar node --config node2.toml

# 3. Grid hub
java -jar selenium.jar hub

# 4. All traffic → http://localhost:4444
```

### Single-Server Parallel (no Grid)
Just start Appium on any port and pass unique isolation capabilities per session:

**Android:**
```
udid=<device1>, systemPort=8200, chromeDriverPort=9515
udid=<device2>, systemPort=8201, chromeDriverPort=9516
```

**iOS:**
```
udid=<device1>, wdaLocalPort=8100
udid=<device2>, wdaLocalPort=8101
```

## Key APIs (Summary)

### Grid 4 Node Config (TOML)
```toml
[server]
port = 5555
[node]
detect-drivers = false
[relay]
url = "http://localhost:4723"
status-endpoint = "/status"
configs = [
  "1",                          # maxSessions
  "{\"platformName\": \"iOS\", \"appium:automationName\": \"XCUITest\", ...}"
]
```
- `configs` array: pairs of `[maxSessions, capabilityJSON]` — exact string match required
- `detect-drivers = false` is mandatory for relay mode

### Appium YAML Config (Grid 4)
```yaml
server:
  port: 4723
  use-drivers: [xcuitest]
  default-capabilities:
    wdaLocalPort: 8100
    mjpegServerPort: 9100
```
Key: every Appium server needs unique `port`, `wdaLocalPort`, `mjpegServerPort`.

### Grid 3 Node Config (JSON)
```json
{
  "capabilities": [{"browserName": "iPhone5", "version": "7.1", "maxInstances": 1, "platform": "MAC"}],
  "configuration": {
    "url": "http://<host>:<port>/wd/hub",
    "maxSession": 1, "register": true,
    "hubPort": 4444, "hubHost": "<grid_ip>"
  }
}
```
Start: `appium server --nodeconfig nodeconfig.json --base-path=/wd/hub`

### Parallel Isolation Capabilities (per platform)

| Platform | Capability | Default | Purpose |
|----------|-----------|---------|---------|
| Android | `udid` | — | Unique device ID |
| Android | `systemPort` | 8200 | uiautomator2 port |
| Android | `chromeDriverPort` | — | Chromedriver port |
| iOS Real | `udid` | — | Unique device ID |
| iOS Real | `wdaLocalPort` | 8100 | WebDriverAgent port |
| iOS Real | `webkitDebugProxyPort` | 27753 | Safari debug proxy |
| iOS Sim | `udid` | — | Simulator UDID |
| iOS Sim | `wdaLocalPort` | 8100 | WebDriverAgent port |

## Caveats
- **Port conflicts are the #1 failure mode.** Every parallel session MUST have unique ports for every service. Overlapping `wdaLocalPort`, `systemPort`, `chromeDriverPort`, or `webkitDebugProxyPort` causes silent crashes.
- **Parallel Safari/WebView on iOS is broken** — Apple bug (Appium #9209). Do not attempt.
- **Grid 3 uses external IPs only** — `localhost`/`127.0.0.1` in `host`/`url` prevents cross-machine Grid connections.
- **Capability matching is exact string matching** — client capabilities must precisely match the node `configs` JSON string.
- **Device Farm v10.0.0+** introduces breaking auth changes and DB schema migration.
- **5+ processes for Grid 4** — use process managers (systemd, supervisord) in production.

## Composition Hints
- Combine with **appium-server-setup** for driver installation and capability configuration per server
- Use **appium-cross-platform-strategy** POM patterns to route platform-specific tests to correct Grid nodes via capability matching
- In CI/CD, wrap with health-check polling on `/status` before dispatching tests
- Device Farm dashboard at `http://<host>:<port>/device-farm` provides real-time session monitoring
- For tvOS, upload `wda-resign_tvos.ipa` and use `"appium:platformName": "tvOS"`
