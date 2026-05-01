---
name: go-net-http
description: HTTP client/server, TLS, testing utilities, and reverse proxy in Go standard library and x/sync/errgroup ecosystem.
tech_stack: [backend]
language: [go]
capability: [web-framework, reverse-proxy, integration-testing]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go net/http

> Source: https://pkg.go.dev/net/http@go1.26.2, https://pkg.go.dev/net/http/httptest@go1.26.2, https://pkg.go.dev/net/http/httputil@go1.26.2, https://pkg.go.dev/crypto/tls@go1.26.2

## Purpose

Package `net/http` provides HTTP client and server implementations. Sub-packages `httptest` (testing utilities), `httputil` (reverse proxy, request dumping), and `crypto/tls` (transport security) round out the HTTP stack. This is the standard library foundation for all HTTP work in Go — REST APIs, web servers, API gateways, and secure communication.

## When to Use

- Building HTTP/REST API servers and web applications
- Making HTTP client calls to external services
- Testing HTTP handlers (unit with `ResponseRecorder`, integration with `httptest.Server`)
- Proxying requests with `ReverseProxy` (API gateways, load balancers)
- Debugging HTTP traffic with `DumpRequest`/`DumpResponse`
- Establishing TLS-secured connections, including mutual TLS (mTLS)
- Static file serving via `FileServer`/`FileServerFS`

## Basic Usage

### Quick HTTP Server

```go
http.HandleFunc("/hello", func(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello, %s", r.URL.Path)
})
log.Fatal(http.ListenAndServe(":8080", nil))
```

### Production Server with Timeouts

```go
s := &http.Server{
    Addr:           ":8080",
    Handler:        mux,
    ReadTimeout:    10 * time.Second,
    WriteTimeout:   10 * time.Second,
    IdleTimeout:    120 * time.Second,
    MaxHeaderBytes: 1 << 20,
}
log.Fatal(s.ListenAndServe())
```

### HTTP Client (reuse for efficiency)

```go
client := &http.Client{
    Timeout: 30 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        IdleConnTimeout:     90 * time.Second,
        DisableCompression:  false,
        ForceAttemptHTTP2:   true,
    },
}
resp, err := client.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}
defer resp.Body.Close()
body, _ := io.ReadAll(resp.Body)
```

### Testing a Handler

```go
// Unit test
req := httptest.NewRequest("GET", "/hello", nil)
w := httptest.NewRecorder()
handler.ServeHTTP(w, req)
resp := w.Result()
// resp.StatusCode, resp.Header, resp.Body

// Integration test
ts := httptest.NewServer(handler)
defer ts.Close()
res, _ := http.Get(ts.URL)
```

### Reverse Proxy

```go
// Preferred (Go 1.20+): Rewrite function
proxy := &httputil.ReverseProxy{
    Rewrite: func(pr *httputil.ProxyRequest) {
        pr.SetURL(targetURL)
        pr.SetXForwarded()
    },
}
http.ListenAndServe(":80", proxy)
```

### TLS Server

```go
cert, _ := tls.LoadX509KeyPair("cert.pem", "key.pem")
cfg := &tls.Config{Certificates: []tls.Certificate{cert}}
listener, _ := tls.Listen("tcp", ":443", cfg)
http.Serve(listener, handler)
```

Or directly: `srv.ListenAndServeTLS("cert.pem", "key.pem")`

## Key APIs (Summary)

| Area | Key Types / Functions |
|------|----------------------|
| **Handler** | `http.Handler` (interface: `ServeHTTP`), `http.HandlerFunc` |
| **ServeMux** | `NewServeMux()`, `.Handle()`, `.HandleFunc()`, `.Handler()` |
| **Server** | `http.Server{Addr, Handler, ReadTimeout, WriteTimeout, IdleTimeout, TLSConfig, Protocols}` — `.ListenAndServe()`, `.Shutdown(ctx)` |
| **Client** | `http.Client{Transport, Timeout, CheckRedirect}` — `.Do()`, `.Get()`, `.Post()` |
| **Transport** | `http.Transport{MaxIdleConns, IdleConnTimeout, TLSClientConfig, ForceAttemptHTTP2, Protocols}` — `.RoundTrip()` |
| **Request** | `.ParseForm()`, `.FormValue()`, `.Cookie()`, `.BasicAuth()`, `.PathValue()`, `.Context()` |
| **ResponseWriter** | `.Header()`, `.Write()`, `.WriteHeader()` |
| **ResponseController** | `.Flush()`, `.Hijack()`, `.EnableFullDuplex()`, `.SetReadDeadline()` |
| **Cookie** | `http.Cookie{Name, Value, Path, Domain, MaxAge, Secure, HttpOnly, SameSite}` |
| **Static files** | `FileServer()`, `FileServerFS()`, `StripPrefix()` |
| **Middleware** | `TimeoutHandler()`, `MaxBytesHandler()`, `StripPrefix()` |
| **ReverseProxy** | `httputil.ReverseProxy{Rewrite, Transport, ModifyResponse}` — prefer `Rewrite` over deprecated `Director` |
| **Debug** | `httputil.DumpRequest()`, `DumpRequestOut()`, `DumpResponse()` |
| **Test: recorder** | `httptest.NewRecorder()` → `.Result()` → `*http.Response` |
| **Test: server** | `httptest.NewServer(handler)` → `.URL`, `.Client()`, `.Close()` |
| **Test: TLS server** | `httptest.NewTLSServer(handler)`, `NewUnstartedServer` + `.StartTLS()` |
| **TLS config** | `tls.Config{Certificates, GetCertificate, RootCAs, ClientCAs, ClientAuth, MinVersion, InsecureSkipVerify}` |
| **TLS conn** | `tls.Listen()`, `tls.Dial()`, `tls.Client()`, `tls.Server()` |

## Caveats

- **Always `defer resp.Body.Close()`** — leaking bodies leaks connections and goroutines.
- **Reuse Client/Transport** — they are goroutine-safe and manage connection pooling; creating per-request wastes resources.
- **`Transport` does NOT enable HTTP/2 by default** — set `ForceAttemptHTTP2: true` or configure `Protocols`. `DefaultTransport` and `Server` enable it automatically on HTTPS.
- **`DefaultMaxIdleConnsPerHost` is only 2** — increase to 50-100 for high-throughput outbound clients.
- **`Director` on `ReverseProxy` is deprecated** — use `Rewrite` (Go 1.20+) to avoid hop-by-hop header and X-Forwarded-* spoofing vulnerabilities.
- **`TLS Config` must be non-nil** for `tls.Listen`/`NewListener` and must include certificates or `GetCertificate`.
- **`InsecureSkipVerify: true`** disables certificate verification — testing only.
- **`MaxBytesReader`** / **`MaxBytesHandler`** protect against large request bodies.
- **`ErrBodyNotAllowed`** — writing to responses with status 1xx/204/304 returns this error.
- **Graceful shutdown**: call `srv.Shutdown(ctx)` not `srv.Close()` to drain in-flight requests.

## Composition Hints

- Combine with `encoding/json` for JSON APIs; call `json.NewDecoder(r.Body).Decode(&v)` in handlers.
- Use `chi`/`gorilla/mux` or Go 1.22+ enhanced `ServeMux` patterns for path parameters.
- Layer middleware: `TimeoutHandler(MaxBytesHandler(handler, 1<<20), 5*time.Second, "timeout")`.
- For mTLS: set `tls.Config.ClientAuth = tls.RequireAndVerifyClientCert` and `ClientCAs`.
- Prefer `httptest.Server` over `httptest.ResponseRecorder` for integration tests that exercise the full HTTP stack.
