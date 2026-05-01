---
name: go-io
description: Go I/O interfaces and patterns — io.Reader/Writer composition, fs.FS abstraction, os file operations, bufio buffering, and embed static files
tech_stack: [backend]
language: [go]
capability: [api-design, file-upload]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go I/O — Readers, Writers, Filesystems & Embedding

> Source: https://pkg.go.dev/io, https://pkg.go.dev/io/fs, https://pkg.go.dev/os, https://pkg.go.dev/bufio, https://pkg.go.dev/embed

## Purpose

Go's I/O is built around the `io.Reader` and `io.Writer` interfaces. These interfaces compose across five key packages: `io` (core interfaces and composition), `io/fs` (portable filesystem abstraction), `os` (OS file operations), `bufio` (buffered I/O and scanning), and `embed` (compile-time file embedding).

## When to Use

| Scenario | Use |
|---|---|
| Accept any readable source | `io.Reader` parameter |
| Accept any writable destination | `io.Writer` parameter |
| Chain / tee / limit readers | `io.MultiReader`, `io.TeeReader`, `io.LimitReader` |
| Copy between reader and writer | `io.Copy` or `io.CopyBuffer` |
| Read entire contents | `io.ReadAll(r)` or `os.ReadFile(name)` |
| In-memory pipe between goroutines | `io.Pipe()` |
| Filesystem-agnostic code (testable) | `fs.FS` + `fstest.MapFS` for tests |
| Real OS file operations | `os.Open` / `os.ReadFile` / `os.WriteFile` |
| Line-by-line or token scanning | `bufio.Scanner` |
| Buffered bulk reads/writes | `bufio.Reader` / `bufio.Writer` |
| Embed static assets at compile time | `//go:embed` directive |

## Basic Usage

### Core interfaces

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

Critical `Read` rule: **always process `n > 0` bytes before checking `err`**. A Read may return both data and an error (including `EOF`) in the same call.

### Copy and compose

```go
// Copy all data
io.Copy(dst, src)

// Copy with reusable 32KB buffer
io.CopyBuffer(dst, src, make([]byte, 32*1024))

// Concatenate readers
r := io.MultiReader(r1, r2, r3)

// Read from r, also tee a copy to w
tr := io.TeeReader(r, w)

// Limit to N bytes
lr := io.LimitReader(r, 1024)

// In-memory synchronous pipe (goroutine bridge)
r, w := io.Pipe()
go func() {
    defer w.Close()
    io.WriteString(w, "hello from goroutine")
}()
io.Copy(os.Stdout, r)
```

### Filesystem abstraction (fs.FS) — production and test

```go
func processConfig(fsys fs.FS) error {
    data, err := fs.ReadFile(fsys, "config.json")
    // ...
}

// Production:
processConfig(os.DirFS("/etc/myapp"))

// Test:
processConfig(fstest.MapFS{
    "config.json": {Data: []byte(`{"port": 8080}`)},
})
```

### OS file operations

```go
// Simple read/write (entire file into memory — avoid for large files)
data, err := os.ReadFile("input.txt")
err = os.WriteFile("output.txt", data, 0o644)

// Streaming with Open
f, err := os.Open("large.dat")
defer f.Close()
io.Copy(dst, f)

// Create with flags
f, err := os.OpenFile("log.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)

// Walk directories
fs.WalkDir(os.DirFS("."), ".", func(path string, d fs.DirEntry, err error) error {
    if err != nil { return err }
    fmt.Println(path)
    return nil
})
```

### bufio.Scanner — line-by-line

```go
scanner := bufio.NewScanner(os.Stdin)
for scanner.Scan() {
    line := scanner.Text()
    // process line
}
if err := scanner.Err(); err != nil {
    log.Fatal(err)
}

// Word scanning
scanner.Split(bufio.ScanWords)

// Custom split function
scanner.Split(func(data []byte, atEOF bool) (advance int, token []byte, err error) {
    // return advance, token, nil to yield a token
    // return 0, nil, nil to request more data
    // return 0, token, bufio.ErrFinalToken for the final token
})
```

### embed — compile-time assets

```go
import "embed"

//go:embed static/* templates/*.html
var assets embed.FS

// embed.FS implements fs.FS
http.Handle("/", http.FileServer(http.FS(assets)))
```

## Key APIs (Summary)

### io — core functions

| Function | Purpose |
|---|---|
| `Copy(dst, src)` | Copy until EOF (returns nil on success) |
| `CopyN(dst, src, n)` | Copy exactly n bytes |
| `CopyBuffer(dst, src, buf)` | Copy with reusable buffer |
| `ReadAll(r)` | Read entire reader into `[]byte` |
| `ReadFull(r, buf)` | Read exactly len(buf) bytes |
| `ReadAtLeast(r, buf, min)` | Read at least min bytes |
| `LimitReader(r, n)` | Reader stopping after n bytes |
| `MultiReader(rs...)` | Concatenate readers |
| `MultiWriter(ws...)` | Broadcast to all writers |
| `TeeReader(r, w)` | Reader that also writes to w |
| `Pipe()` | Synchronous in-memory pipe |
| `NopCloser(r)` | Add no-op Close to a Reader |

Sentinel errors: `io.EOF`, `io.ErrUnexpectedEOF`, `io.ErrShortBuffer`, `io.ErrShortWrite`, `io.ErrClosedPipe`.

### io/fs — portable filesystem

| Function | Purpose |
|---|---|
| `ReadFile(fsys, name)` | Read whole file |
| `ReadDir(fsys, name)` | List directory entries |
| `WalkDir(fsys, root, fn)` | Walk tree; skip with `SkipDir` / `SkipAll` |
| `Glob(fsys, pattern)` | Glob match (like `path.Match`) |
| `Stat(fsys, name)` | Get `FileInfo` |
| `Sub(fsys, dir)` | Sub-filesystem rooted at dir |

Sentinel errors: `fs.ErrNotExist`, `fs.ErrPermission`, `fs.ErrExist`, `fs.ErrInvalid`, `fs.ErrClosed`.

### os — platform I/O (subset)

| Function | Purpose |
|---|---|
| `Open(name)` | Read-only open |
| `Create(name)` | Create / truncate for writing |
| `OpenFile(name, flag, perm)` | Open with flags (`O_RDWR`, `O_APPEND`, `O_CREATE`, etc.) |
| `ReadFile(name)` | Read entire file |
| `WriteFile(name, data, perm)` | Write data (create/truncate) |
| `ReadDir(name)` | Read directory entries |
| `DirFS(dir)` | Return `fs.FS` for a directory |
| `CopyFS(dir, fsys)` | Copy `fs.FS` to disk (Go 1.23+) |
| `Mkdir` / `MkdirAll` | Create directories |
| `Remove` / `RemoveAll` | Delete files / trees |
| `Rename(old, new)` | Move / rename |
| `CreateTemp` / `MkdirTemp` | Temporary files / dirs |

### bufio — buffered I/O

| Constructor | Purpose |
|---|---|
| `NewReader(r)` | Buffered reader (default 4KB) |
| `NewReaderSize(r, n)` | Buffered reader with size hint |
| `NewWriter(w)` | Buffered writer (default 4KB) |
| `NewWriterSize(w, n)` | Buffered writer with size hint |
| `NewScanner(r)` | Token scanner (default: lines) |

Key methods: `Reader.ReadBytes(delim)`, `Reader.ReadString(delim)`, `Reader.Peek(n)`, `Writer.Flush()`, `Scanner.Scan()`, `Scanner.Text()`, `Scanner.Bytes()`, `Scanner.Split(fn)`, `Scanner.Buffer(buf, max)`.

## Caveats

### Reader / Writer
- **Always process `n > 0` before checking `err`** — data and error may arrive together.
- **`io.ReadAll`, `fs.ReadFile`, `os.ReadFile` return nil on success, not `io.EOF`.**
- **`io.Pipe` is synchronous and unbuffered** — each `Write` blocks until a `Read` consumes it. Close after writing or readers deadlock.
- **Don't assume thread safety** for `io` interfaces unless documented.

### fs.FS
- **Paths are slash-separated on all platforms** (even Windows). No leading/trailing slashes.
- **`os.DirFS` follows host symlinks** — not safe for chroot-style isolation. Use `os.Root.FS()` (Go 1.24+) for symlink-safe access.
- **`WalkDir` reads entire directory into memory** before iterating (for lexical ordering).

### os
- **`ReadFile`/`WriteFile` load entire file into memory** — use `Open` + streaming for large files.
- **`Create` truncates existing files.** Use `OpenFile` with `O_APPEND` to preserve content.
- **Always `defer f.Close()`** after opening.
- **`os.Exit` does not run deferred functions.**

### bufio
- **Always `Flush()` buffered writers** or use `defer w.Flush()` — unwritten data is lost.
- **Scanner max token is 64KB** by default — use `Buffer()` for larger tokens.
- **`ReadSlice` returns a buffer reference** invalidated by next read — prefer `ReadBytes`/`ReadString`.
- **`ReadLine` is low-level** — use `ReadBytes('\n')`, `ReadString('\n')`, or `Scanner`.

### embed
- **`//go:embed` only at package scope**, not in functions.
- **Patterns cannot contain `.` or `..`**, cannot start/end with `/`.
- **Must match ≥1 file at build time** — empty match is a build error.
- **Files starting with `.` or `_` are excluded** unless `all:` prefix is used.

## Composition Hints

- **Accept `io.Reader` / `io.Writer`, return concrete types.** Functions should take the smallest interface they need.
- **Use `fs.FS` for filesystem-dependent code** — it decouples business logic from the OS and makes testing trivial with `fstest.MapFS`.
- **Pipe `io.Pipe()` between goroutines** when one produces data and another consumes it — no buffer, no synchronization needed beyond the pipe itself.
- **Combine `io.TeeReader` + hashing** to compute checksums while streaming: `tr := io.TeeReader(r, sha256.New())`.
- **`bufio.Scanner` is the right default for text** — it handles line endings, buffering, and tokenization. Fall back to `bufio.Reader` only when you need `Peek` or byte-level control.
- **Use `embed.FS` for static web assets, templates, and config files** — no runtime file dependencies, single-binary deployment.
