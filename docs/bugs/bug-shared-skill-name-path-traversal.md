# bug: shared skill 白名单名称未校验可能穿越 ~/.agents/skills

## 症状

`init_opencode.sh` 新增的 `sync_shared_skills` 会读取 `agents/skills.list`，并拼接：

```bash
dst_path="$AGENTS_SKILLS_DIR/$skill_name"
```

如果列表中出现 `../escape` 这类名称，目标路径会落到 `~/.agents/skills` 之外。

## 影响

- 误写白名单时可能在共享 skills 目录外创建软链。
- 如果目标路径已有本仓可管理软链，后续同步可能错误更新不属于 skills 命名空间的路径。

## 期望行为

共享 skill 名称只允许普通 skill 命名字符，路径分隔符、空格、`.` 穿越片段都必须拒绝。

## 实际行为

`trim_skill_name` 只去掉注释和空白，没有做格式校验。

## 根因

同步函数把 `agents/skills.list` 当可信配置处理，但该文件仍是文本输入。缺少名称校验导致路径拼接边界不成立。

## 修复方案

新增 skill 名称校验函数，只允许 `a-zA-Z0-9_-`，非法项打印告警并跳过。

## 验证

- 单测构造临时 skills.list：包含 `../escape` 和一个合法 skill。
- 验证非法项不会在 skills 目录外创建路径，合法项仍正常软链。
