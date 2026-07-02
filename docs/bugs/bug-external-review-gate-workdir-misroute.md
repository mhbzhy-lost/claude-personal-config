# Bug: external-review-gate workdir/cwd 未透传导致仓库误路由

## symptom

OpenCode 中执行带 Bash `workdir` / `cwd` 的裸 `git push` 时，`external-review-gate`
可能按 hook 进程当前目录判断目标仓库，而不是按 Bash tool 实际执行目录判断。
在父仓和子仓同时存在待 push 提交时，review range、marker 和 deny 文案可能落到父仓。

## impact

错误仓库会消费或覆盖错误的 review marker，导致两轮 review 预算不稳定；同时外源
review 看到的 diff 可能不是当前 push 的目标 diff，用户会收到与实际 push 目标不一致的
blocking 结果。

## reproduction

1. 父仓和子仓分别配置 `origin/main` upstream，并各自有未 push 的提交。
2. OpenCode Bash tool 使用 `workdir=<子仓>` 执行裸命令 `git push origin main`。
3. plugin 调用 `shared/hooks/external-review-gate.sh`。
4. hook payload 中缺失 `workdir` / `cwd` 时，hook 只能从命令文本或自身 cwd 推断目标仓库。

## root cause

`userconf/plugins/external-review-gate.js` 构造 Claude Code hook protocol payload 时只透传
`command`、`env`、`environment`。OpenCode Bash tool 的实际执行目录存在于
`output.args.workdir` 或 `output.args.cwd`，但该字段没有进入 payload。

`shared/hooks/external-review-gate.sh` 虽已支持从 payload 读取 `workdir` / `cwd`，但在仓库
检测后仍有部分裸 `git` 调用依赖进程 cwd，诊断日志也缺少 review range、repo、file count，
误路由时难以定位。

## fix plan

1. plugin payload 透传 `output.args.workdir` 和 `output.args.cwd`。
2. hook 在完成有效仓库检测后，后续 git diff、remote、HEAD 等调用统一使用 `_git_prefix`。
3. hook 在运行 review 和 deny 输出中补充 `Review range`、`Review repo`、`Review file count`。

## verification/regression guard

1. 新增 plugin 单测，断言 Bash `output.args.workdir` / `cwd` 会进入 hook payload。
2. 新增 hook 集成测试，构造父仓 + 子仓，payload 用裸 `git push` 且 `workdir` 指向子仓，断言日志中的 repo/range/file count 来自子仓。
3. 聚焦运行 `node --test userconf/plugins/test/external-review-gate-workdir.test.mjs`，先 RED 后 GREEN。

## post-fix invariant

定位有效仓库后，hook 中用于 review range、diff hash、HEAD、remote slug 和 reviewer
上下文的 git 调用必须继续使用同一个 `_git_prefix`；新增裸 `git` 调用前必须先确认不会回到
hook 进程 cwd。
