---
name: go-testing
description: Go 标准库 testing 包 — 单元测试、基准测试、模糊测试、子测试、TestMain、示例函数的完整测试框架。
tech_stack: [go]
language: [go]
capability: [unit-testing]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go testing 包

> Source: https://pkg.go.dev/testing, https://go.dev/doc/fuzz

## Purpose

Go 标准库 testing 包提供自动化测试支持，与 `go test` 命令协同工作。涵盖单元测试 (`TestXxx`)、基准测试 (`BenchmarkXxx`)、模糊测试 (`FuzzXxx`)、子测试 (`T.Run`/`B.Run`)、示例函数 (`ExampleXxx`)、以及 TestMain 全局 setup/teardown。

## When to Use

- 为 Go 包编写单元测试，命名文件 `*_test.go`
- 表驱动测试（Table-Driven Tests）进行系统性输入/输出验证
- 性能基准测试与回归检测（`go test -bench`）
- 模糊测试发现边界条件和安全漏洞（`go test -fuzz`）
- 子测试层级组织复杂测试套件，共享 setup/teardown
- TestMain 进行全局资源初始化（数据库连接、临时目录）
- 文档即测试的示例函数

## Basic Usage

### 表驱动测试（最常用模式）

```go
func TestAbs(t *testing.T) {
    tests := []struct {
        name  string
        input int
        want  int
    }{
        {"positive", 5, 5},
        {"negative", -3, 3},
        {"zero", 0, 0},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            if got := Abs(tc.input); got != tc.want {
                t.Errorf("Abs(%d) = %d; want %d", tc.input, got, tc.want)
            }
        })
    }
}
```

关键约定：
- 白盒测试：`_test.go` 文件与被测包同 package（可访问未导出标识符）
- 黑盒测试：使用 `package foo_test`，仅访问导出标识符
- 使用 `t.Run` 创建命名子测试，`-run` flag 可精确匹配子测试名（斜杠分隔）

### 基准测试（B.Loop 现代写法）

```go
func BenchmarkRandInt(b *testing.B) {
    for b.Loop() {
        rand.Int()
    }
}
// 输出: BenchmarkRandInt-8   68453040    17.8 ns/op
```

`B.Loop()` 是新代码首选写法。仅循环体被计时，循环前可做昂贵 setup。旧式 `b.N` 写法：
```go
func BenchmarkBigLen(b *testing.B) {
    big := NewBig()
    b.ResetTimer()
    for range b.N {
        big.Len()
    }
}
```

并行基准测试：
```go
func BenchmarkTemplateParallel(b *testing.B) {
    templ := template.Must(template.New("test").Parse("Hello, {{.}}!"))
    b.RunParallel(func(pb *testing.PB) {
        var buf bytes.Buffer
        for pb.Next() {
            buf.Reset()
            templ.Execute(&buf, "World")
        }
    })
}
```

### 模糊测试

```go
func FuzzHex(f *testing.F) {
    for _, seed := range [][]byte{{}, {0}, {9}, {0xa}, {0xf}, {1, 2, 3, 4}} {
        f.Add(seed)
    }
    f.Fuzz(func(t *testing.T, in []byte) {
        enc := hex.EncodeToString(in)
        out, err := hex.DecodeString(enc)
        if err != nil {
            t.Fatalf("%v: decode: %v", in, err)
        }
        if !bytes.Equal(in, out) {
            t.Fatalf("%v: not equal", in, out)
        }
    })
}
```

规则：
- 每测试仅一个 fuzz target
- Fuzzing 参数类型：`string`, `[]byte`, 各类 int/uint, `float32`, `float64`, `bool`
- Seed corpus 通过 `f.Add` 或 `testdata/fuzz/<Name>/` 目录提供
- `go test -fuzz=FuzzHex` 启用 fuzzing；默认仅运行 seed corpus
- 失败输入写入 `testdata/fuzz/<Name>/`，成为回归测试
- Fuzz target 必须快速（超时 1s）、确定性（不依赖全局状态、不跨调用持久化）

### TestMain

```go
func TestMain(m *testing.M) {
    // flag.Parse() — 必须显式调用，TestMain 执行时 flag 尚未解析
    os.Exit(m.Run())
}
```

TestMain 在 main goroutine 中运行，可做全局 setup/teardown。`m.Run()` 返回退出码。仅当需要跨测试共享昂贵资源时才使用。

### 并行子测试与 Teardown

```go
func TestGroupedParallel(t *testing.T) {
    for _, tc := range tests {
        t.Run(tc.Name, func(t *testing.T) {
            t.Parallel()
            // ...
        })
    }
    // 所有子测试并行，父 Run 在所有子测试完成后才返回
}
```

利用 `Run` 不返回直到并行子测试完成的特性，实现分组 teardown：
```go
func TestTeardownParallel(t *testing.T) {
    t.Run("group", func(t *testing.T) {
        t.Run("Test1", parallelTest1)
        t.Run("Test2", parallelTest2)
    })
    // tear-down 在所有并行子测试完成后执行
}
```

### 示例函数

```go
func ExampleHello() {
    fmt.Println("hello")
    // Output: hello
}
```

命名约定：`Example`（包级）、`ExampleF`（函数 F）、`ExampleT`（类型 T）、`ExampleT_M`（方法 M）。`// Unordered output:` 匹配任意行序。

## Key APIs (Summary)

| 类型/函数 | 角色 | 关键方法 |
|-----------|------|----------|
| `*testing.T` | 测试状态 | `Run`, `Parallel`, `Error/Errorf`, `Fatal/Fatalf`, `Fail/FailNow`, `Log/Logf`, `Skip/SkipNow`, `Cleanup`, `Setenv`, `TempDir`, `Helper`, `Context`, `Deadline`, `Name` |
| `*testing.B` | 基准测试状态 | `Loop() bool`, `ResetTimer`, `StartTimer/StopTimer`, `ReportAllocs`, `ReportMetric`, `RunParallel`, `Run`, `SetBytes`, `SetParallelism`, `Elapsed` |
| `*testing.F` | 模糊测试状态 | `Add(args ...any)`, `Fuzz(ff any)` |
| `*testing.M` | TestMain 入口 | `Run() (code int)` |
| `*testing.PB` | 并行基准 helper | `Next() bool` |
| `BenchmarkResult` | 基准结果 | `NsPerOp`, `AllocsPerOp`, `AllocedBytesPerOp` |
| `AllocsPerRun` | 分配计数 | `func AllocsPerRun(runs int, f func()) (avg float64)` |
| `Coverage/CoverMode` | 覆盖率查询 | `Coverage() float64`, `CoverMode() string` |
| `Short/Verbose` | 标志查询 | `Short() bool`, `Verbose() bool`, `Testing() bool` |

## Caveats

- **`B.Loop` 优先于旧式 `b.N`**：旧式 `b.N` 可能多次调用 benchmark 函数并调整 N，setup 代码会被重复执行；用 `ResetTimer()` 规避。新代码统一用 `B.Loop`。
- **TestMain 与 flag.Parse**：TestMain 运行时 flag 尚未解析，依赖 flag 必须显式调用 `flag.Parse()`。
- **Fuzz target 限制**：每调用 1 秒超时、必须快速且确定性、状态不跨调用持久化。Coverage instrumentation 仅支持 AMD64/ARM64。
- **`T.Fatal`/`T.FailNow` 调用 `runtime.Goexit()`**：仅停止当前 goroutine，deferred 函数仍执行。不要在非测试 goroutine 中调用这些方法。
- **`T.Cleanup` 执行顺序**：LIFO（后注册先执行）。适合资源释放的逆序依赖。
- **`T.Setenv` 并发不安全**：恢复原始值，不要并发使用同一环境变量。
- **`T.Parallel` 阻塞父级**：父 `Run` 在所有并行子测试完成后才返回，可用于分组 teardown。
- **`t.Skip()` in fuzz target**：表示输入无效而非失败，不会写入 corpus。
- **Golden files**：约定存储在 `testdata/` 目录。用 `-update` flag 机制更新。

## Composition Hints

- **表驱动测试 + 子测试** 是 Go 测试的默认组合模式，利用 `t.Run` 获得独立 test case 命名和并行控制
- **`T.Cleanup`** 用于注册测试后清理，替代手动 defer；比 `TestMain` 更适合 per-test 资源管理
- **`T.TempDir()`** 自动创建和清理临时目录，比手动 `os.MkdirTemp` 更安全
- **`T.Helper()`** 标记辅助函数，使失败日志指向调用方而非辅助函数内部
- **接口 + Mock**：定义接口作为依赖边界，测试中注入 mock 实现；用 `T.Cleanup` 注册 mock 验证
- **Golden files 模式**：`testdata/` 目录存储期望输出，`go test -update` 约定更新 golden 文件
- **Fuzz + 回归测试**：fuzz 发现的失败输入自动成为 seed corpus 条目，后续 `go test` 默认执行
- **Benchmark + `ReportMetric`**：报告自定义指标（如吞吐量），结合 `benchstat` 工具做 A/B 比较
