---
execution_mode: executable_sandbox
name: mitmdump
description: Command-line HTTP traffic dump tool — non-interactive mitmproxy for recording, replaying, and scripted transformation of HTTP/HTTPS flows.
tech_stack: [http]
language: [python]
capability: [integration-testing, observability, reverse-proxy]
version: "mitmproxy unversioned"
collected_at: 2025-01-01
---

# mitmdump

> Source: https://docs.mitmproxy.org/stable/

## Purpose

mitmdump is the command-line, non-interactive front-end for mitmproxy — think **tcpdump for HTTP**. It lets you capture, filter, replay, and programmatically modify HTTP/1, HTTP/2, HTTP/3, and WebSocket traffic without a UI. Unlike the interactive `mitmproxy` and `mitmweb` tools, mitmdump is designed for headless/automated workflows: CI/CD pipelines, scripted traffic analysis, and server-side interception.

All three tools (mitmproxy, mitmweb, mitmdump) share the same core proxy engine and configuration system. Skills for scripting (`--scripts`) and options apply across all of them, but mitmdump is the only one suited for non-interactive automation.

## When to Use

- **Recording traffic to disk**: `mitmdump -w outfile` captures all flows for later analysis.
- **Offline filtering & analysis**: `mitmdump -nr infile -w outfile "~m post"` reads saved flows, applies filter expressions, writes matching subset.
- **Client replay**: `mitmdump -nC srcfile` replays previously recorded requests against live servers.
- **Server replay (mock mode)**: `mitmdump --server-replay saved.flow` replays recorded responses without hitting real servers — useful for offline testing.
- **Scripted transformation**: `mitmdump -s script.py` applies Python addon scripts to live or recorded traffic.
- **High-volume environments**: Unlike mitmproxy/mitmweb, mitmdump streams flows by default rather than accumulating them in memory.

## Basic Usage

### Record traffic
```bash
mitmdump -w capture.flow           # record all flows
mitmdump -w capture.flow "~u example.com"   # record only matching flows
```

### Read and filter recorded traffic
```bash
# -n = no proxy server (offline), -r = read file
mitmdump -nr capture.flow                           # dump all flows
mitmdump -nr capture.flow "~m post"                 # only POSTs
mitmdump -nr capture.flow "~c 500"                  # only 500 responses
mitmdump -nr capture.flow -w filtered.flow "~u api" # filter + save
```

### Client replay (replay requests from file)
```bash
mitmdump -nC requests.flow                           # replay, see responses
mitmdump -nC requests.flow -w results.flow           # replay + capture results
```

### Server replay (replay saved responses, no real server)
```bash
mitmdump --server-replay responses.flow              # mock from file
mitmdump --server-replay responses.flow --set connection_strategy=lazy  # offline-safe
```

### Run a Python addon script
```bash
mitmdump -s my_addon.py                              # intercept live traffic with script
mitmdump -ns my_addon.py -r input.flow -w output.flow # transform offline
```

### Control output verbosity
```bash
mitmdump --set flow_detail=0    # quiet (no per-flow output)
mitmdump --set flow_detail=2    # full URL + status + headers
mitmdump --set flow_detail=3    # + truncated body content
mitmdump --set flow_detail=4    # + full body, nothing truncated
```

## Key APIs (Summary)

### Essential command-line flags

| Flag | Purpose |
|------|---------|
| `-w FILE` | Write flows to file |
| `-r FILE` | Read flows from file |
| `-n` | No proxy server (offline operation) |
| `-C FILE` | Client replay from file |
| `-s SCRIPT` | Execute Python addon script |
| `--set NAME=VALUE` | Set any option by name |
| `--server-replay FILE` | Replay server responses from file |

### Critical mitmdump-specific options (`--set`)

| Option | Default | Purpose |
|--------|---------|---------|
| `flow_detail` | `1` | Output verbosity: 0 (quiet) → 4 (full body). |
| `dumper_filter` | `None` | Limit dumped flows (e.g. `"~m post"`). |
| `dumper_default_contentview` | `auto` | How to display bodies: `json`, `hex`, `raw`, etc. |
| `keepserving` | `False` | Keep running after replay/read completes. |
| `termlog_verbosity` | `info` | Log level: `error`, `warn`, `info`, `alert`, `debug`. |

### Key shared options

| Option | Purpose |
|--------|---------|
| `connection_strategy` | `lazy` (defer connections, enables offline replay) vs `eager` (detect server-side protocols). |
| `ssl_insecure` | Skip upstream TLS verification. **Only for controlled environments.** |
| `server_replay_extra` | What to do for unmatched replay requests: `forward`, `kill`, or an HTTP status code (204, 400, 404, 500). |
| `scripts` | Python addon scripts to execute. |
| `mode` | Proxy mode: `regular`, `transparent`, `reverse:SPEC`, `upstream:SPEC`, `socks5`. |
| `save_stream_file` | Stream flows to file with strftime-formatted paths. |
| `stream_large_bodies` | Stream (don't buffer) bodies above threshold (e.g. `3m`). |

### Filter expressions (used with `-w`, `dumper_filter`, etc.)

| Pattern | Matches |
|---------|---------|
| `~u REGEX` | Request URL |
| `~m METHOD` | HTTP method (GET, POST, etc.) |
| `~c CODE` | Response status code |
| `~d DOMAIN` | Request domain |
| `~hq HEADER` | Request header present |
| `~hs HEADER` | Response header present |
| `~b REGEX` | Request body |
| `~bq REGEX` | Response body |
| `!` prefix | Negate (e.g. `"!~m GET"`) |
| `&` / `\|` | AND / OR (e.g. `"~m post & ~u api"`) |

## Caveats

- **`-n` is essential for offline work**: Without it mitmdump starts a proxy and listens for new connections even when reading from a file.
- **`flow_detail=0` silences everything**: Useful for pure recording/replay but verify you don't need output before using it in debugging.
- **`ssl_insecure` is dangerous**: It disables upstream TLS verification, making mitmproxy itself vulnerable to MITM. Only use in isolated test environments.
- **`connection_strategy` matters for replay**: Use `lazy` for offline server replay; use `eager` when you need accurate TLS ALPN negotiation or server-side protocol greeting detection.
- **Streamed bodies can't be modified**: `stream_large_bodies` drops body data. Use `store_streamed_bodies` if you need to inspect/modify streamed content (at memory cost).
- **Binary packages have frozen dependencies**: Docker and standalone binaries don't allow in-place dependency updates. Update regularly for security patches.
- **Default memory behavior differs from mitmproxy/mitmweb**: mitmdump doesn't accumulate all flows in memory — but enabling `hardump` changes this.
- **Options vary by version**: Always use `mitmdump --options` for the exact list in your installed version.

## Composition Hints

- **With mitmproxy addon scripts**: mitmdump is the primary vehicle for running Python addons in non-interactive mode. Use `mitmdump -s` for testing addons, then the same scripts work in `mitmproxy` and `mitmweb`.
- **With jq / JSON tools**: Pipe `flow_detail=3` or `4` output through `jq` to extract specific fields from JSON bodies.
- **As a mock server in CI**: `mitmdump --server-replay fixtures.flow --set connection_strategy=lazy --set server_replay_extra=kill` provides deterministic HTTP mocking without network access.
- **With Docker**: Official images (`mitmproxy/mitmproxy`) include all three tools; override the entrypoint to use `mitmdump`.
- **With curl/httpie**: Route traffic through mitmdump as a proxy (`--proxy localhost:8080`) to inspect/record API calls during development.
