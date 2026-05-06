---
name: api-discovery-mobile-mitmproxy
description: Capture mobile app API traffic using mitmproxy with HTTPS decryption, certificate trust setup for iOS/Android, and certificate pinning bypass.
tech_stack: [mobile-native, web]
language: [python]
capability: [encryption]
version: "mitmproxy stable"
collected_at: 2025-07-16
---

# Mobile MITM Proxy API Capture

> Source: https://docs.mitmproxy.org/stable/, https://raw.githubusercontent.com/mitmproxy/mitmproxy/main/docs/src/content/concepts/certificates.md

## Purpose

Capture and decrypt HTTPS API traffic from mobile apps (iOS/Android) using mitmproxy as an intercepting proxy. When internal system API documentation is missing or incomplete, this technique reveals the actual API calls mobile apps make — endpoints, parameters, headers, auth tokens, and response schemas — enabling API inventory, reverse engineering, and security assessment.

## When to Use

- Mobile apps talk to internal APIs that have no public documentation
- You need the real request/response payloads (not just path enumeration)
- Web-based network capture misses mobile-only endpoints (native SDK calls, push token registration, device-specific APIs)
- Certificate pinning blocks other interception approaches — use the bypass tools documented here
- You want to record and replay API conversations for testing or documentation

## Basic Usage

### 1. Install mitmproxy

```bash
pip install mitmproxy
# or
brew install mitmproxy
```

### 2. Start the proxy

```bash
# For bulk recording — use mitmdump
mitmdump -w traffic.out

# For interactive inspection (small samples only)
mitmproxy

# For web UI (beta)
mitmweb
```

Default proxy listens on `0.0.0.0:8080`.

### 3. Configure the mobile device

Set the device's WiFi proxy to `<your-machine-ip>:8080`, then visit `http://mitm.it/` in the device browser and install the CA certificate for the platform.

### 4. iOS Certificate Trust (critical second step)

After installing the profile, go to **Settings → General → About → Certificate Trust Settings** and toggle ON "Enable full trust for root certificates" for the mitmproxy certificate. Missing this step is the #1 setup failure.

### 5. Android CA Trust

- **Android 6 and below:** Install the `.cer` file via Settings → Security → Install from storage
- **Android 7+:** Apps targeting API 24+ ignore user-installed CAs. Use a rooted device to install the CA as a system CA, or modify the target APK's `network_security_config.xml` to trust user CAs
- Alternatively use the Android emulator with a writable system partition

### 6. Record and filter traffic

```bash
# Save all traffic
mitmdump -w session.out

# Filter POST requests only from saved session
mitmdump -nr session.out -w posts_only.out "~m post"

# Filter by domain
mitmdump -nr session.out -w api_traffic.out "~d api.internal.com"

# Run a Python script to transform traffic on the fly
mitmdump -s extract_endpoints.py
```

### 7. Export for endpoint inventory

Use mitmdump's Python scripting to extract `method + path + params` from captured flows and output JSON for the endpoint inventory pipeline:

```python
# extract_endpoints.py
from mitmproxy import http

def response(flow: http.HTTPFlow):
    print(f"{flow.request.method} {flow.request.pretty_url}")
```

## Key APIs (Summary)

### Core CLI for Recording

| Command | Purpose |
|---------|---------|
| `mitmdump -w outfile` | Save all traffic to file |
| `mitmdump -nr infile -w outfile "~m post"` | Filter saved traffic (POST only) |
| `mitmdump -nC outfile` | Replay all requests from saved session |
| `mitmdump -s script.py` | Run Python script on live/recorded traffic |
| `mitmdump -ns script.py -r srcfile -w dstfile` | Scripted transformation of saved traffic |

### Filter Expressions

| Filter | Matches |
|--------|---------|
| `~m post` | POST requests only |
| `~m get` | GET requests only |
| `~d example.com` | Domain |
| `~s 200` | Response status 200 |

### Certificate Bypass Tools

| Tool | Platform | Method |
|------|----------|--------|
| `apk-mitm` | Android | Patch APK to remove pinning |
| `objection` | iOS + Android | Frida runtime unpinning |
| `ssl-kill-switch2` | iOS + macOS | Blackbox pinning disable |
| `android-unpinner` | Android | Frida injection via APK mod |

### CA Certificate Files

| File | Use |
|------|-----|
| `~/.mitmproxy/mitmproxy-ca-cert.pem` | Distribute to macOS, Linux, iOS |
| `~/.mitmproxy/mitmproxy-ca-cert.p12` | Windows |
| `~/.mitmproxy/mitmproxy-ca-cert.cer` | Android |

### mTLS Support

```bash
# Client cert for upstream server
mitmdump --set client_certs=DIRECTORY -w out  # lookup by hostname: example.org.pem

# Require client cert from connecting clients (MQTT/IoT)
mitmdump --set request_client_cert=True --set client_certs=client-cert.pem
```

## Caveats

- **iOS full trust is a two-step process:** Profile installation AND Settings → About → Certificate Trust Settings → Enable. Without the second step, HTTPS traffic silently fails to decrypt.
- **Android 7+ user CA restriction:** Most modern Android apps will not trust user-installed CAs. You MUST either root the device, patch the APK, or use the emulator with writable system.
- **Certificate pinning breaks interception:** Apps using cert pinning will refuse connections through mitmproxy. Patch the app (apk-mitm, objection) or exclude the domain with `ignore_hosts`.
- **mitmproxy vs mitmdump for bulk capture:** mitmproxy (console) and mitmweb keep ALL flows in memory — they will crash or become unusable with large traffic volumes. Always use `mitmdump -w` for bulk recording.
- **Unique CA per install:** Each mitmproxy installation generates a unique CA. You cannot share a CA across machines without manually copying `~/.mitmproxy/mitmproxy-ca.pem` (which includes the private key).
- **Transparent proxy is macOS/Linux only:** Not available on Windows. On these platforms, configure the device proxy explicitly.
- **mitmweb is still beta:** Missing features compared to mitmproxy console. Use mitmproxy for advanced interactive workflows.

## Composition Hints

- **Feeds into:** `api-discovery-endpoint-inventory` — extract `method + path + params` from captured flows and feed into inventory normalization
- **Complementary:** `api-discovery-network-tab-capture` — browser-based capture misses mobile-only endpoints; mitmproxy fills this gap
- **Comparison workflow:** Run both browser capture and mobile proxy capture on the same internal system, then diff the inventories to find mobile-only API surfaces
- **Certificate pinning escalation:** If apk-mitm fails (obfuscated pinning), escalate to Frida-based `objection` or `ssl-kill-switch2` for runtime bypass
