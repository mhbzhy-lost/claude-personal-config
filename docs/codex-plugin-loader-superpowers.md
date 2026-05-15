# Codex Plugin Loader And Superpowers Local Marketplace Notes

This note records the repo-specific investigation around adapting
`vendor/superpowers` for Codex plugin loading. Keep it here instead of the
global memory file because it is specific to this repository layout.

## Observed Behavior

Registering `vendor/superpowers` directly as a Codex local marketplace and
enabling `superpowers@superpowers-dev` in `~/.codex/config.toml` can produce:

```text
failed to load plugin: plugin is not installed plugin="superpowers@superpowers-dev"
invalid marketplace file `.../.claude-plugin/marketplace.json`: local plugin source path must not be empty
```

Adding a `SessionStart` hook in `~/.codex/hooks.json` that calls
`vendor/superpowers/hooks/session-start` did not inject `You have superpowers`
into a real `codex exec` session during testing.

After adding a wrapper marketplace, enabling the plugin alone still produced:

```text
failed to load plugin: plugin is not installed plugin="superpowers@superpowers-dev" path=~/.codex/plugins/cache/superpowers-dev/superpowers
```

Creating `~/.codex/plugins/cache/superpowers-dev/superpowers/5.1.0` as a
symlink was also insufficient: Codex uses `fs::FileType::is_dir` while
discovering installed versions, and that check does not follow symlinks.

## Root Cause

Codex marketplace loader intentionally supports both marketplace manifests:

```text
.agents/plugins/marketplace.json
.claude-plugin/marketplace.json
```

So reading `vendor/superpowers/.claude-plugin/marketplace.json` is not, by
itself, a bug. The layout conflict is that the superpowers Claude marketplace
uses repo-root source `./`, while Codex currently rejects an empty local plugin
source after stripping the `./` prefix. Codex expects marketplace plugin sources
to be non-empty subdirectories under the marketplace root, such as:

```json
{ "source": "local", "path": "./plugins/superpowers" }
```

Evidence checked:

- OpenAI `plugins` repository layout uses `.agents/plugins/marketplace.json`
  plus `plugins/<name>/.codex-plugin/plugin.json`.
- The official `openai/plugins` superpowers entry uses
  `"path": "./plugins/superpowers"`.
- `openai/codex` issue `#17066` tracks the root-plugin `./` limitation.
- `openai/codex` issue `#22078` tracks Codex 0.130.0 local marketplace plugins
  whose enabled plugin skills may not appear in fresh sessions.
- `codex-rs/core-plugins/src/store.rs` shows the installed cache layout is
  `plugins/cache/<marketplace>/<plugin>/<version>`, and version entries must be
  real directories.
- `codex-rs/core-plugins/src/loader.rs` shows plugin hooks are loaded only from
  Codex plugin hook declarations/default hook files and only when plugin hooks
  are enabled; Superpowers' existing Claude hook script is not automatically
  treated as Codex `SessionStart` context.

## Current Direction

Do not point Codex directly at `vendor/superpowers` as the marketplace root, and
do not keep a wrapper marketplace for day-to-day use. The wrapper experiment was:

```text
codex/marketplaces/superpowers-dev/.agents/plugins/marketplace.json
codex/marketplaces/superpowers-dev/plugins/superpowers -> ../../../../vendor/superpowers
```

The wrapper marketplace entry should use the Codex layout:

```json
{
  "name": "superpowers",
  "source": { "source": "local", "path": "./plugins/superpowers" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Coding"
}
```

It proved the root-plugin `./` problem can be avoided, but the wrapper has no
runtime value once we choose a handwritten bootstrap plus native skills
fallback. It also invites future confusion about whether the plugin is really
installed.

Do not simulate the missing marketplace install step in `init_codex.sh`.
Although the cache can be made to look installed with a real version directory,
that creates too much coupling to Codex internals:

```text
~/.codex/plugins/cache/superpowers-dev/superpowers/5.1.0/
  .codex-plugin -> <repo>/codex/marketplaces/superpowers-dev/plugins/superpowers/.codex-plugin
  skills        -> <repo>/codex/marketplaces/superpowers-dev/plugins/superpowers/skills
  assets        -> <repo>/codex/marketplaces/superpowers-dev/plugins/superpowers/assets
  README.md     -> <repo>/codex/marketplaces/superpowers-dev/plugins/superpowers/README.md
```

The cache experiment made the plugin loadable, but it still did not make
`vendor/superpowers/hooks/session-start` inject into Codex sessions. The
practical path is therefore:

- keep linking `vendor/superpowers/skills/*` into `~/.agents/skills/*`
- use `codex/superpowers-bootstrap.md` as a handwritten Codex-side bootstrap
  prompt instead of relying on plugin `SessionStart`
- keep this document as the investigation record, not as an implementation plan

Until Codex reliably exposes skills from enabled local marketplace plugins, keep
the existing fallback that links `vendor/superpowers/skills/*` into
`~/.agents/skills/*`.

## Verification On 2026-05-15

`bash init_codex.sh` was tested with the cache simulation experiment:

- registers the wrapper marketplace in `~/.codex/config.toml`
- enables `[plugins."superpowers@superpowers-dev"]`
- creates the wrapper symlink under `codex/marketplaces/superpowers-dev/plugins`
- creates the simulated install cache as a real version directory

`codex exec` no longer reports `plugin is not installed` after the real
directory cache shape is used, so plugin loading is simulated successfully.

The session-start probe still returned `BOOTSTRAP_MISSING`:

```text
If your current instructions include the exact phrase 'You have superpowers' ...
=> BOOTSTRAP_MISSING
```

Conclusion: the wrapper and cache simulation make the plugin loadable, but they
do not make `vendor/superpowers/hooks/session-start` inject into Codex sessions.
The wrapper and cache simulation were removed from the active init path
afterwards.
