---
name: webrtc-coturn
description: coturn TURN/STUN server — NAT traversal relay for WebRTC, supporting TURN REST API ephemeral credentials, multiple database backends, and TLS/DTLS.
tech_stack: [webrtc]
language: [c, javascript]
capability: [auth, encryption]
version: "coturn unversioned (GitHub master)"
collected_at: 2026-03-16
---

# coturn TURN/STUN Server

> Source: https://github.com/coturn/coturn/blob/master/README.turnserver, https://github.com/coturn/coturn/wiki, https://github.com/coturn/coturn/tree/master/docs

## Purpose

coturn is an open-source TURN and STUN server (RFC 5766 / RFC 5389 / RFC 5780). It provides NAT traversal relay services critical for WebRTC: when two peers cannot establish a direct P2P connection due to symmetric NATs or restrictive firewalls, coturn relays media through a publicly reachable server. It is the standard TURN server deployed in production WebRTC infrastructure.

## When to Use

- Providing `iceServers` STUN/TURN endpoints for `RTCPeerConnection` in WebRTC apps
- TURN relay fallback when P2P connections fail (symmetric NAT, restrictive firewalls)
- Production WebRTC deployments where connection reliability matters
- Any real-time communication infrastructure requiring NAT/firewall traversal

## Basic Usage

### Quick Start (TURN REST API — Production)

```bash
turnserver -o \
    --use-auth-secret --static-auth-secret=my-shared-secret \
    --realm=mycompany.com \
    --listening-port=3478 --tls-listening-port=5349 \
    --cert=/path/to/cert.pem --pkey=/path/to/key.pem
```

### Quick Start (Long-Term Credentials — Simple)

```bash
turnserver -o -a -b /var/db/turndb --realm=mycompany.com
```

### Basic turnserver.conf

```ini
listening-ip=12.34.56.78
listening-port=3478
tls-listening-port=5349
lt-cred-mech
user=alice:password1
user=bob:password2
realm=mycompany.com
fingerprint
cert=/etc/ssl/cert.pem
pkey=/etc/ssl/key.pem
```

## Key APIs (Summary)

### Authentication Mode Selection

| Flag | Mode | When to Use |
|------|------|-------------|
| *(default)* | No auth | Testing only; anonymous access |
| `-a, --lt-cred-mech` | Long-term credentials | Simple setups with static user/pass DB |
| `--use-auth-secret` | TURN REST API | **Production WebRTC** — ephemeral credentials |
| `--oauth` | OAuth (RFC 7635) | Third-party auth integration |

### TURN REST API — The Recommended Pattern

The application server shares a secret with coturn. Credentials are generated on-the-fly with a timestamp embedded in the username, allowing the TURN server to validate them without a database lookup.

**Server-side credential generation:**

```
timestamp = now_epoch_seconds + TTL_seconds
username  = "{timestamp}:{userId}"              // or just timestamp
password  = base64(hmac-sha1(username, shared_secret))
```

**Example implementations:**

```js
// Node.js server generating ephemeral TURN credentials
const crypto = require('crypto');

function getTurnCredentials(userId, sharedSecret, ttlSeconds = 86400) {
    const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${timestamp}:${userId}`;
    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(username);
    const password = hmac.digest('base64');
    return { username, password, ttl: ttlSeconds };
}

// Send to client, which uses them in RTCPeerConnection:
const pc = new RTCPeerConnection({
    iceServers: [{
        urls: 'turn:turn.example.com:3478?transport=udp',
        username: creds.username,
        credential: creds.password
    }]
});
```

### Essential Server Flags

#### Networking

| Flag | Purpose |
|------|---------|
| `-L <ip>` | Listening IP (repeatable; default: all system IPs) |
| `-p <port>` | UDP/TCP port (default: 3478) |
| `--tls-listening-port=<port>` | TLS/DTLS port (default: 5349) |
| `-E <ip>` | Relay IP for outgoing packets (repeatable) |
| `-X <public-ip>` | Public IP mapping when server is behind NAT |
| `--no-udp` / `--no-tcp` / `--no-tls` / `--no-dtls` | Disable specific listeners |

#### Security

| Flag | Purpose |
|------|---------|
| `-f, --fingerprint` | Add fingerprints to TURN messages |
| `--secure-stun` | Require auth for STUN Binding requests |
| `--stale-nonce=600` | Nonce lifetime in seconds (0 = unlimited; weakens replay protection) |

#### Timeouts

| Flag | Default | Safe to Change? |
|------|---------|-----------------|
| `--max-allocate-lifetime` | 3600s | Yes |
| `--channel-lifetime` | 600s | **No** — RFC mandated |
| `--permission-lifetime` | 300s | **No** — RFC mandated |

#### Diagnostics & Monitoring

| Flag | Purpose |
|------|---------|
| `--prometheus` | Enable Prometheus `/metrics` on port 9641; `/` is health check |
| `--prometheus-username-labels` | Label metrics by username (disabled — leaks memory with ephemeral usernames) |
| `--syslog` | Redirect logs to syslog |
| `--simple-log` | No rollover; use with logrotate |
| `--log-binding` | Log STUN bindings (off by default — DoS risk) |

## Caveats

- **TURN REST API clock skew**: The timestamp in the username is validated by coturn's clock. If your application server and TURN server clocks drift, credentials expire early. Keep them NTP-synchronized.
- **Prometheus + ephemeral usernames**: `--prometheus-username-labels` causes unbounded memory growth with TURN REST API — **do not enable** together. Each unique ephemeral username becomes a new label set.
- **Loopback peers**: `--allow-loopback-peers` is a security vulnerability in production. Never use it outside local testing.
- **Server relay**: `--server-relay` bypasses IP permission checks (RFC 5766 §17.2.3). DANGEROUS — only for server applications on relay endpoints.
- **Channel/permission lifetimes**: `--channel-lifetime` and `--permission-lifetime` are RFC-mandated values. Changing them breaks spec compliance.
- **Nonce lifetime = 0**: disables replay attack protection entirely. Keep at default 600s.
- **STUN binding logging**: disabled by default because it's a DoS vector. Only enable (`--log-binding`) for debugging.
- **Prometheus availability**: not included in apt packages. Compile from source for metrics.
- **TLS auto-detection**: coturn auto-detects TLS vs plain traffic on all ports. The separate "TLS port" exists only for RFC 5766 compliance. Both ports are functionally identical.
- **Windows**: no official support. Linux/macOS only.

## Composition Hints

- **With RTCPeerConnection**: coturn is the backend for `iceServers` in WebRTC. Configure `urls` as `turn:<host>:3478?transport=udp` or `turns:<host>:5349?transport=tcp` for TLS.
- **With Janus / mediasoup**: these SFUs also need TURN for clients behind restrictive NATs. Point their `iceServers` / STUN configuration at your coturn instance. Janus CLI: `-S <coturn-ip>:3478`.
- **TLS/DTLS setup**: for production, always use `--cert` and `--pkey`. Use `--no-tlsv1_2` to enforce TLS 1.3 / DTLS 1.2 minimum. Use `--dh2066` (default) or stronger for DH key length.
- **Database choice**: SQLite (`-b`) for simple single-server deploys. PostgreSQL (`-e`) or Redis (`-N`) for multi-server setups where credential state needs to be shared. All backends support both long-term credentials and TURN REST API secrets.
- **Load balancing**: use `--aux-server` for multiple listeners on one process, or run multiple coturn processes behind HAProxy with `--tcp-proxy-port` for the proxy protocol. For UDP, use `--udp-self-balance` (OLDER Linux kernels only).
- **Ephemeral credential TTL**: set TTL to slightly longer than your expected session duration. 24 hours (86400s) is common. Shorter TTLs improve security at the cost of needing mid-session credential refresh (requires ICE restart).
