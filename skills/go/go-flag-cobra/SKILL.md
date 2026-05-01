---
name: go-flag-cobra
description: Go command-line flag parsing (flag), CLI framework (cobra), and configuration management (viper)
tech_stack: []
language: [go]
capability: []
version: "flag go1.26.2 / cobra v1.10.2 / viper v1.21.0"
collected_at: 2026-04-07
---

# Go Flags, Cobra & Viper

> Source: https://pkg.go.dev/flag, https://github.com/spf13/cobra, https://github.com/spf13/viper

## Purpose

Three-tier stack for Go CLI applications:

| Layer | Package | Role |
|-------|---------|------|
| Flag parsing | `flag` (stdlib) | Basic `-flag` parsing for simple tools |
| CLI structure | `cobra` | Subcommands, POSIX flags, help, autocomplete |
| Configuration | `viper` | Merge config from files, env vars, flags, remote stores |

Cobra + Viper together form the standard Go CLI backbone (used by Kubernetes, Hugo, GitHub CLI).

## When to Use

- **`flag` alone**: Single-command tools with a handful of flags, no subcommands.
- **Cobra**: Any multi-command CLI. Whenever you need `app server`, `app fetch`, etc., plus `--help`, shell completions, man pages.
- **Viper**: 12-factor apps needing config from files (YAML/JSON/TOML), env vars, and flags merged with a clear precedence. Live config reloading.

## Basic Usage

### flag — minimal

```go
import "flag"

var name = flag.String("name", "world", "who to greet")
var count = flag.Int("n", 1, "number of greetings")

func main() {
    flag.Parse()
    for i := 0; i < *count; i++ {
        fmt.Printf("Hello, %s!\n", *name)
    }
}
```

Three ways to define:
```go
// 1. Pointer return (most common)
nFlag := flag.Int("n", 1234, "help message")

// 2. Bind to existing variable
var flagvar int
flag.IntVar(&flagvar, "flagname", 1234, "help message")

// 3. Custom type via Value interface
flag.Var(&myCustomFlag, "name", "help message")
```

Always: define flags → `flag.Parse()` → use values. Flags are pointers; Var-bound variables are values.

### cobra — minimal app

```go
import "github.com/spf13/cobra"

var rootCmd = &cobra.Command{
    Use:   "app",
    Short: "A brief description",
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Println("Hello from root")
    },
}

var serveCmd = &cobra.Command{
    Use:   "serve",
    Short: "Start the server",
    Run: func(cmd *cobra.Command, args []string) {
        port, _ := cmd.Flags().GetInt("port")
        fmt.Printf("Serving on :%d\n", port)
    },
}

func main() {
    serveCmd.Flags().Int("port", 8080, "port to listen on")
    rootCmd.AddCommand(serveCmd)
    rootCmd.Execute()
}
```

Scaffold with: `go install github.com/spf13/cobra-cli@latest`

### viper — config from file + env

```go
import "github.com/spf13/viper"

func main() {
    viper.SetConfigName("config")      // config.yaml
    viper.AddConfigPath(".")            // search .
    viper.AddConfigPath("$HOME/.myapp") // search ~/.myapp
    viper.AutomaticEnv()                // MYAPP_PORT etc.

    viper.SetDefault("port", 8080)

    if err := viper.ReadInConfig(); err != nil {
        if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
            log.Fatal(err)
        }
    }

    port := viper.GetInt("port") // merged from defaults/config/env
}
```

### cobra + viper — unified config

```go
// Bind cobra flag to viper key
serveCmd.Flags().Int("port", 8080, "port to listen on")
viper.BindPFlag("port", serveCmd.Flags().Lookup("port"))

// Now viper.GetInt("port") respects: Set() > flag > env > config > defaults
```

## Key APIs (Summary)

### flag — top-level

```go
flag.String(name, default, usage) *string   // also Bool, Int, Int64, Uint, Uint64, Float64, Duration
flag.StringVar(&v, name, default, usage)     // bind to variable
flag.Var(value Value, name, usage)           // custom type
flag.Func(name, usage, fn func(string) error)    // Go 1.16+
flag.BoolFunc(name, usage, fn func(string) error) // Go 1.21+, no value needed
flag.TextVar(&v, name, default, usage)        // Go 1.19+, encoding.TextUnmarshaler
flag.Parse()         // must call before accessing flags
flag.Args() []string // positional args after flags
flag.NArg() int      // count of positional args
flag.NFlag() int     // count of flags set
flag.Parsed() bool   // has Parse() been called?
```

### flag — FlagSet (for subcommands)

```go
fs := flag.NewFlagSet("subcmd", flag.ExitOnError)
// ErrorHandling: ContinueOnError, ExitOnError, PanicOnError
fs.String("name", "", "help")
fs.Parse(os.Args[2:])  // parse subcommand args
```

### cobra — Command

```go
&cobra.Command{
    Use:     "name [args]",
    Short:   "one-line",
    Long:    "detailed description",
    Args:    cobra.ExactArgs(1),      // validation: MinimumNArgs, MaximumNArgs, etc.
    Run:     func(cmd *cobra.Command, args []string) { ... },
    RunE:    func(cmd *cobra.Command, args []string) error { ... },  // return error
    PreRunE: ...,                      // before Run
    PersistentPreRunE: ...,            // inherited by children
}

cmd.Flags().String("name", "", "usage")        // local flag
cmd.PersistentFlags().String("config", "", "")  // inherited by all children
cmd.AddCommand(subCmd)
cmd.Execute()
```

### viper — key operations

```go
// Sources (precedence: Set > flag > env > config > remote > default)
viper.Set("key", value)
viper.SetDefault("key", value)
viper.BindPFlag("key", pflag)           // bind cobra/pflag
viper.BindPFlags(pflag.CommandLine)     // bind entire flag set
viper.SetEnvPrefix("MYAPP")             // env: MYAPP_KEY
viper.BindEnv("key")                    // bind specific env var
viper.AutomaticEnv()                    // auto-bind all env vars
viper.AllowEmptyEnv(true)               // treat empty env as set

// Config files
viper.SetConfigName("config")           // no extension
viper.SetConfigType("yaml")             // for io.Reader sources
viper.AddConfigPath(".")                // search paths
viper.ReadInConfig()                    // find + parse
viper.WriteConfig() / SafeWriteConfig()
viper.WatchConfig()                     // live reload (fsnotify)
viper.OnConfigChange(func(e fsnotify.Event) { ... })

// Reading values
viper.Get("key") interface{}
viper.GetString("key") / GetInt / GetBool / GetDuration / GetStringSlice / GetStringMap
viper.IsSet("key") bool
viper.AllSettings() map[string]any
viper.Sub("parent.child") *Viper       // scoped subset

// Unmarshal
viper.Unmarshal(&struct)
viper.UnmarshalKey("key", &struct)

// Utilities
viper.RegisterAlias("alias", "real.key")
viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))  // nested.key → NESTED_KEY
viper.New() *Viper     // new instance (preferred over global)
```

## Caveats

### flag
- `flag.Parse()` **must** be called before accessing any flag values.
- **Boolean trap**: `-flag x` is illegal for booleans; use `-flag=false`.
- Parsing **stops** at first non-flag argument or `--`.
- The global `flag.CommandLine` is shared. Use `flag.NewFlagSet` for subcommands.

### cobra
- Uses **pflag** (POSIX fork of `flag`), not stdlib `flag`. pflag adds `--long` and short flags but has subtle API differences.
- `cobra-cli` is a scaffolding tool, not the library itself.
- `RunE` returning an error will print it; use `SilenceErrors` + `SilenceUsage` for custom handling.

### viper
- **Keys are case insensitive** except environment variables (case sensitive).
- **No deep merge**: overriding a map/key replaces the whole subtree.
- **Not concurrency-safe**: synchronize access with `sync.Mutex`.
- **Global singleton discouraged**: pass `*viper.Viper` instances for testability.
- **Env vars not cached**: read on every access. Empty env = unset (unless `AllowEmptyEnv`).
- **Single config file** per instance (but multiple search paths).
- Use `viper.ConfigFileNotFoundError` with `errors.As` to handle missing config gracefully.
- Remote support needs blank import `_ "github.com/spf13/viper/remote"`.

## Composition Hints

**The standard Go CLI stack:**
```
cobra.Command  ←  defines CLI structure (commands, subcommands, help)
     ↕ BindPFlag
viper          ←  merges config from: flag defaults, env vars, config files, remote
     ↕ Get/Unmarshal
app config struct
```

**Recommended initialization order in `main()` / `init()`:**
1. Define Viper defaults (`viper.SetDefault`)
2. Define Cobra commands and flags (`cmd.Flags().String(...)`)
3. Bind Cobra flags to Viper (`viper.BindPFlag(...)`)
4. Set up env vars (`viper.SetEnvPrefix`, `viper.AutomaticEnv`)
5. Read config file (`viper.ReadInConfig`) — handle `ConfigFileNotFoundError` gracefully
6. Parse flags (`rootCmd.Execute` triggers `pflag.Parse`)
7. Unmarshal into config struct (`viper.Unmarshal(&cfg)`)

**Testing:** Use `flag.NewFlagSet` or `cobra.Command` with `SetArgs()` and `viper.New()` to avoid global state. For Viper, set config via `viper.Set()` in tests rather than relying on files.
