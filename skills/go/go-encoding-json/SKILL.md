---
name: go-encoding-json
description: Go 标准库 encoding/json 包 — JSON 序列化/反序列化、struct tag 控制、自定义序列化接口、流式 Decoder/Encoder、RawMessage 延迟解析。
tech_stack: [go]
language: [go]
capability: [api-design]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go encoding/json 包

> Source: https://pkg.go.dev/encoding/json, https://golang.org/doc/articles/json_and_go.html

## Purpose

encoding/json 实现 RFC 7159 JSON 的编解码。核心 API：`Marshal`（Go → JSON）、`Unmarshal`（JSON → Go）、流式 `Decoder`/`Encoder`。通过 struct tag、`Marshaler`/`Unmarshaler` 接口、`RawMessage` 和 `Number` 提供完整的序列化控制。

## When to Use

- API 数据序列化/反序列化（REST、RPC 请求体）
- 配置文件读写（JSON 格式 config）
- 大文件或网络流的流式 JSON 处理（Decoder/Encoder）
- 部分 JSON 延迟解析（RawMessage）
- 自定义类型 JSON 表示（Marshaler/Unmarshaler）
- 任意 schema JSON 处理（`interface{}` / `map[string]any`）
- 保留大整数精度（Number + UseNumber）

## Basic Usage

### Marshal — Go 值 → JSON bytes

```go
type ColorGroup struct {
    ID     int      `json:"id"`
    Name   string   `json:"name"`
    Colors []string `json:"colors,omitempty"`
}
group := ColorGroup{ID: 1, Name: "Reds", Colors: []string{"Crimson", "Red"}}
b, _ := json.Marshal(group)
// {"id":1,"name":"Reds","colors":["Crimson","Red"]}
```

编码优先级：`Marshaler.MarshalJSON()` → `TextMarshaler.MarshalText()`（编码为 JSON string） → 类型默认编码。`[]byte` 编码为 base64 字符串。NaN/±Inf 返回 `UnsupportedValueError`。默认对 `<`、`>`、`&`、U+2028、U+2029 做 HTML 转义。

### Unmarshal — JSON bytes → Go 值

```go
var decoded ColorGroup
json.Unmarshal(b, &decoded) // v 必须是非 nil 指针
```

解码优先级：`Unmarshaler.UnmarshalJSON()` → `TextUnmarshaler.UnmarshalText()`（仅 JSON 带引号字符串时）→ 类型默认解码。struct 字段匹配 **大小写不敏感**（精确匹配优先）。未知键默认静默忽略。JSON null 对非 pointer/slice/map/interface 类型无影响、无错误。

### Struct Tags

```go
Field int `json:"name,option1,option2"`
```

| Tag | 效果 |
|-----|------|
| `json:"myName"` | JSON 键名 "myName" |
| `json:"myName,omitempty"` | 空值时省略：false, 0, nil pointer, 零长 slice/map/string |
| `json:"myName,omitzero"` | 零值时省略（优先用 `IsZero()` 判断，否则 Go 零值） |
| `json:"myName,string"` | 值编码为 JSON 字符串内的字符串（用于 string/int/float/bool，与 JS 通信常用） |
| `json:"-"` | 始终省略 |
| `json:"-,"` | JSON 键名 "-" |

`omitempty` 和 `omitzero` 可组合使用。匿名嵌入 struct 的导出字段会被提升到外层（Go 1.1+）。多字段冲突时优先选有 tag 的字段；若仍有多个则全部忽略。

### Decoder（流式读） vs Encoder（流式写）

```go
// 流式读取：适合大文件、网络流、逐条处理
dec := json.NewDecoder(r)
dec.DisallowUnknownFields() // 拒绝未知字段
dec.UseNumber()              // 数字存为 Number 而非 float64
for {
    var v MyType
    if err := dec.Decode(&v); err == io.EOF { break }
    // process v
}

// 流式写入
enc := json.NewEncoder(w)
enc.SetEscapeHTML(false)     // 禁用 HTML 转义
enc.SetIndent("", "  ")      // 美化输出
enc.Encode(v)
```

`Encoder.Encode` 会在每个值后追加 `\n`。

### RawMessage — 延迟/透传 JSON

```go
type Event struct {
    Type    string          `json:"type"`
    Payload json.RawMessage `json:"payload"`
}
// 先解析 Type，再根据 Type 决定 Payload 如何解析
var e Event
json.Unmarshal(data, &e)
switch e.Type {
case "click":
    var c ClickPayload
    json.Unmarshal(e.Payload, &c)
}
```

### Number — 保留数字精度

```go
dec := json.NewDecoder(r)
dec.UseNumber()
var v map[string]interface{}
dec.Decode(&v)
n := v["big_id"].(json.Number)
id, _ := n.Int64() // 完整精度，不丢失为 float64
```

### 自定义序列化

```go
type Animal int

func (a *Animal) UnmarshalJSON(b []byte) error {
    var s string
    json.Unmarshal(b, &s)
    switch strings.ToLower(s) {
    case "gopher": *a = Gopher
    case "zebra":  *a = Zebra
    default:       *a = Unknown
    }
    return nil
}

func (a Animal) MarshalJSON() ([]byte, error) {
    var s string
    switch a {
    case Gopher: s = "gopher"
    case Zebra:  s = "zebra"
    default:     s = "unknown"
    }
    return json.Marshal(s)
}
```

### 任意 JSON 处理

```go
var f interface{}
json.Unmarshal(data, &f)
m := f.(map[string]interface{})
for k, v := range m {
    switch vv := v.(type) {
    case string:  fmt.Println(k, "is string", vv)
    case float64: fmt.Println(k, "is number", vv)
    case []interface{}: // ...
    case map[string]interface{}: // ...
    }
}
```

## Key APIs (Summary)

| API | 签名 | 用途 |
|-----|------|------|
| `Marshal` | `func Marshal(v any) ([]byte, error)` | 一次性 Go→JSON |
| `Unmarshal` | `func Unmarshal(data []byte, v any) error` | 一次性 JSON→Go |
| `MarshalIndent` | `func MarshalIndent(v any, prefix, indent string) ([]byte, error)` | 美化 Marshal |
| `Valid` | `func Valid(data []byte) bool` | 校验 JSON 合法性 |
| `NewDecoder` | `func NewDecoder(r io.Reader) *Decoder` | 创建流式解码器 |
| `NewEncoder` | `func NewEncoder(w io.Writer) *Encoder` | 创建流式编码器 |
| `Decoder.Decode` | `func (dec *Decoder) Decode(v any) error` | 读取下一个 JSON 值 |
| `Decoder.DisallowUnknownFields` | `func (dec *Decoder) DisallowUnknownFields()` | 拒绝未知字段 |
| `Decoder.UseNumber` | `func (dec *Decoder) UseNumber()` | 数字存为 Number |
| `Decoder.Token` / `Decoder.More` | — | 逐 token 解析 |
| `Encoder.SetEscapeHTML` | `func (enc *Encoder) SetEscapeHTML(on bool)` | 控制 HTML 转义 |
| `Encoder.SetIndent` | `func (enc *Encoder) SetIndent(prefix, indent string)` | 流式美化输出 |

## Caveats

- **重复键静默覆盖**：后出现的值覆盖/合并前值（map/struct 合并；其他类型替换）。`DisallowUnknownFields` 不检测此问题。
- **大小写不敏感匹配**：`Name` 字段匹配 `"name"`、`"NAME"`、`"Name"`。冲突时精确匹配优先。
- **未知字段默认忽略**：不同于严格解析器。用 `Decoder.DisallowUnknownFields()` 拒绝。
- **数字默认 float64**：超过 2^53 的整数精度丢失。用 `UseNumber()` 或 `json.Number` 保留精度。
- **[]byte → base64**：不是数字数组。用 `[]int` 或 `[]uint8` 表示数字数组。
- **HTML 转义默认开启**：非 HTTP 场景用 `Encoder.SetEscapeHTML(false)` 关闭。
- **NaN/±Inf 不可编码**：Marshal 返回 `UnsupportedValueError`。提前处理。
- **循环结构**：Marshal 无限递归。避免。
- **Unmarshal 对 map 是累加**：已有 map 不会清空，新条目追加。如需替换，先清空。
- **JSON null 对非引用类型无影响**：unmarshal null 到 int 字段不报错、不改变值。
- **nil Marshaler 不调用**：即使底层类型实现了 Marshaler，nil 指针也不调用 MarshalJSON。
- **Encoder.Encode 追加换行**：与 Marshal 不同，流式输出每个值后跟 `\n`。

## Composition Hints

- **Decoder + UseNumber** 是处理外部 API 大整数的首选组合，避免 float64 精度丢失
- **RawMessage + 类型判别字段** 实现多态 JSON 反序列化（如 Event.Type 决定 Payload 结构）
- **Marshaler/Unmarshaler** 用于枚举、时间格式、自定义编码等需要非默认表示的场景
- **TextMarshaler 作为备选**：仅需字符串表示时可只用 TextMarshaler，json 包自动将其编码为 JSON string
- **DisallowUnknownFields** 在严格 API 契约场景下使用，可提前发现客户端拼写错误
- **Encoder.SetIndent** 用于 debug 日志和配置文件写入；生产 API 响应中避免（增加带宽）
- **匿名嵌入 struct** 可实现 JSON 字段的扁平化继承，注意冲突解决规则
- **`json:"-"` + 手动处理** 用于需要完全自定义序列化逻辑的复杂场景
