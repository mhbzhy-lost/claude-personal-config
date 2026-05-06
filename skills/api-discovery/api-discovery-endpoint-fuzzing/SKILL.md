---
name: api-discovery-endpoint-fuzzing
description: Discover hidden API endpoints, parameters, and virtual hosts using ffuf and wfuzz with wordlist-based path enumeration and parameter fuzzing.
tech_stack: [web]
language: [go, python]
capability: [http-client]
version: "ffuf v2.1.0 / wfuzz 3.1.1"
collected_at: 2025-07-16
---

# API Endpoint Fuzzing

> Source: https://github.com/ffuf/ffuf, https://github.com/xmendez/wfuzz, https://wfuzz.readthedocs.io

## Purpose

Discover undocumented API endpoints, hidden parameters, and virtual hosts by brute-forcing URL paths, headers, and POST data with wordlists. When an internal system has no public API documentation and no discoverable Swagger/GraphQL schemas, fuzzing is the primary method to map the API surface by probing for known path patterns and parameter names.

## When to Use

- No API documentation exists (no Swagger, no GraphQL introspection endpoint)
- After running schema-based discovery, to find endpoints the schema didn't expose
- To find hidden admin panels (`/admin`, `/console`, `/actuator`, `/debug`)
- To discover versioned API paths (`/v1/`, `/v2/`, `/api/v3/`)
- To fuzz parameter names on known endpoints for undocumented query/body params
- Virtual host discovery when multiple services share an IP
- Recursive directory mapping to build a complete API tree

## Basic Usage

### Primary tool: ffuf (fast, Go-based)

**Directory discovery:**
```bash
ffuf -w /path/to/wordlist -u https://target/FUZZ
```

**Filter out noise by response size (most common technique):**
```bash
ffuf -w wordlist.txt -u https://target/FUZZ -fs 4242
```

**Extension fuzzing:**
```bash
ffuf -w wordlist.txt -u https://target/FUZZ -e .json,.yaml,.xml,.php
```

**Recursive discovery:**
```bash
ffuf -w wordlist.txt -u https://target/FUZZ -recursion -recursion-depth 2
```

**Virtual host discovery:**
```bash
ffuf -w vhosts.txt -u https://target -H "Host: FUZZ" -fs 4242
```

**GET parameter name fuzzing:**
```bash
ffuf -w paramnames.txt -u https://target/api/endpoint?FUZZ=test -fs 4242
```

**POST data fuzzing with auth cookie:**
```bash
ffuf -w values.txt -X POST -d "username=admin&password=FUZZ" \
  -b "session=abc123" -u https://target/login -fc 401
```

**JSON output for pipeline integration:**
```bash
ffuf -w wordlist.txt -u https://target/FUZZ -o results.json -of json
```

### Rate limiting and evasion

```bash
ffuf -w wordlist.txt -u https://target/FUZZ -rate 10           # 10 req/sec
ffuf -w wordlist.txt -u https://target/FUZZ -p 0.5             # 0.5s delay
ffuf -w wordlist.txt -u https://target/FUZZ -t 5               # 5 threads
ffuf -w wordlist.txt -u https://target/FUZZ -x http://127.0.0.1:8080  # via proxy
```

### Alternative: wfuzz (Python, richer filter language)

```bash
# Directory fuzzing with status code filter
wfuzz -w wordlist/common.txt --hc 404 http://target/FUZZ

# Multi-payload: fuzz username and password simultaneously
wfuzz -c -z file,users.txt -z file,pass.txt --sc 200 http://target/login?user=FUZZ&pass=FUZ2Z

# Baseline-based filtering (first request sets baseline, rest compared)
wfuzz -c -z range,1-100 --hh BBB http://target/FUZZ{something_not_there}
```

Use wfuzz when you need: Python scripting integration, complex filter chains, or the plugin system. Use ffuf for raw speed on large wordlists.

## Key APIs (Summary)

### ffuf Essential Flags

| Flag | Purpose | Example |
|------|---------|---------|
| `-w` | Wordlist path | `-w /lists/api.txt` |
| `-u` | Target URL with FUZZ keyword | `-u https://target/FUZZ` |
| `-H` | Custom header (repeatable) | `-H "Host: FUZZ"` |
| `-X` | HTTP method | `-X POST` |
| `-d` | POST body data | `-d '{"key":"FUZZ"}'` |
| `-b` | Cookie string | `-b "session=xyz"` |
| `-e` | Extensions (comma-separated) | `-e .json,.php,.html` |
| `-fs` | Filter by response size | `-fs 4242` |
| `-fc` | Filter by status code | `-fc 404,403` |
| `-fr` | Filter by regex on response | `-fr "not found"` |
| `-mc` | Match status codes | `-mc 200,302` |
| `-mr` | Match regex on response | `-mr "admin"` |
| `-recursion` | Recursive scanning | `-recursion -recursion-depth 2` |
| `-t` | Thread count (default: 40) | `-t 10` |
| `-rate` | Requests per second | `-rate 5` |
| `-o` / `-of` | Output file and format | `-o out.json -of json` |
| `-ac` | Auto-calibrate filters | `-ac` |
| `-x` | Proxy URL | `-x http://127.0.0.1:8080` |
| `-maxtime` | Max total runtime (seconds) | `-maxtime 300` |

### ffuf Multi-Wordlist Modes

| Mode | Behavior |
|------|----------|
| `clusterbomb` (default) | All combinations of all wordlists |
| `pitchfork` | Iterate wordlists in lockstep (same index) |
| `sniper` | Fuzz one position at a time |

### ffuf Interactive Mode Commands

Press ENTER during execution to pause. Key commands: `fc` / `fs` / `fw` to reconfigure filters, `show` to view current matches, `restart` to reset and re-run, `savejson <file>` to save matches.

### wfuzz Key Flags

| Flag | Purpose |
|------|---------|
| `-w` / `-z` | Wordlist or payload source |
| `--hc` / `--sc` | Hide/show by status code |
| `--hl` / `--sl` | Hide/show by line count |
| `--hw` / `--sw` | Hide/show by word count |
| `--hh` / `--sh` | Hide/show by char count |
| `--script` | Run a plugin (e.g., `robots`, `links`) |

### Hidden Route Wordlist (Quick-Start)

```
/admin
/administrator
/console
/actuator
/actuator/health
/debug
/debug/vars
/phpmyadmin
/pma
/api
/api/v1
/api/v2
/graphql
/swagger
/openapi.json
/docs
/.env
/config
/backup
```

## Caveats

- **Recursion requires FUZZ at URL end:** `-recursion` only activates when the target URL ends with `FUZZ`.
- **Autocalibration is fragile:** `-ac` assumes stable response sizes. If the baseline endpoint returns variable-length content (timestamps, CSRF tokens), autocalibration may hide real findings or show false positives.
- **Rate limiting triggers:** Default 40 threads can overwhelm small servers or trigger WAF bans. Start with `-t 5 -p 0.5` and increase only if needed.
- **Auth is critical for internal APIs:** Most internal endpoints return 302/401 without auth. Always fuzz with valid cookies/tokens (`-b` or `-H "Authorization: Bearer ..."`) AND without auth to find both authenticated and unauthenticated surfaces.
- **POST data escaping:** In shell, `&` in `-d` must be escaped as `\&`. Consider using `--request` with a raw HTTP file for complex payloads.
- **Wfuzz is slower:** Python-based wfuzz is significantly slower than Go-based ffuf for large wordlists. Use ffuf for raw path enumeration; use wfuzz when you need Python scripting or the plugin system.
- **Interactive mode limitation:** ffuf does not store "negative" matches. Tightening filters removes false positives, but relaxing filters requires `restart` (rerunning from scratch).
- **Wordlist quality directly determines results:** Generic `common.txt` misses API-specific paths. Build custom wordlists from technology fingerprinting (e.g., include `/actuator` for Spring Boot, `/graphql` for GraphQL, `/api/v[1-3]` patterns).

## Composition Hints

- **Feeds into:** `api-discovery-endpoint-inventory` — use `-of json` output and parse discovered paths into the normalization pipeline
- **Precedes:** More targeted fuzzing on discovered endpoints — once a path is found, fuzz its parameter names and values with smaller, focused wordlists
- **Complements:** `api-discovery-swagger-openapi-probing` — if Swagger is found, use the schema directly instead of fuzzing. Fuzz only paths the schema doesn't cover
- **Escalation path:** If ffuf results are all 403, route through `api-discovery-mobile-mitmproxy` — the mobile app may use different endpoints or auth mechanisms
- **Wordlist building:** Start with API-specific patterns from technology fingerprinting, then expand with SecLists `Discovery/Web-Content` and raft wordlists
