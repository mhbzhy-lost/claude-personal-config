# `blocks/_shared/` —— 业务模式 block 的脚手架模板

这里**不是运行时代码**，而是 `scripts/new-block.py` 用来生成新 block 的
模板源文件。每个文件可能含 `{{占位符}}`，由脚手架在写入新 block 目录
时替换。

## 设计选择：模板而非共享库

参见 `docs/plans/milestone-2026-05-09-conversation-list-block.md` §6.4
的发现——前两个 block 的"机械 cp 部分"集中在基础设施层（config/db/
auth/errors/...），业务逻辑天然分歧。把基础设施做成 **scaffold-level
模板**（生成时替换 + 各 block 自留拷贝）而不是 **code-level 共享库**
（运行时依赖）的考量：

- 每个 block 仍是独立工程，可独立部署/演进
- 不引入跨块的版本耦合（共享库一升级 N 个 block 全跟着升）
- 业务专属字段（IM 的 online_status / commerce 的多张表）可自由长出，不被基类锁死
- 修 bug 时需要手工同步所有 block，但 block 数量小（< 20）时这个成本可接受；
  数量上去再考虑抽出 `_shared/` 升级为真共享库

## 用法

```bash
./scripts/new-block.py \
  --slug order-detail \
  --env-prefix OD \
  --pkg-ns od \
  --backend-port 8082 \
  --postgres-port 5546 \
  --title-en "Order Detail" \
  --title-cn "订单详情"
```

完成后 `blocks/order-detail/` 含完整可跑的最小工程：
- 后端 `make install && make migrate && make dev` 就能启动
- 后端 `make test` 跑 2 个开箱测试（health + me）
- 前端 `pnpm install && pnpm build` 出 lib 产物
- 协议层留空，需要开发者填 `protocol/openapi.yaml` + 运行 `make gen`
- 业务模型 / schemas / services / api routes 留空，按 IM 或 commerce 的模式填

开发者需要做的（脚手架做不了的部分）：
1. 在 `protocol/openapi.yaml` 定义业务接口
2. 在 `backend/app/models/` 定义业务实体
3. 写 alembic 初始迁移：`alembic revision --autogenerate -m 'initial schema'`
4. 在 `backend/app/schemas/` 写 pydantic 模型
5. 在 `backend/app/services/` 写业务逻辑
6. 在 `backend/app/api/v1/` 写路由
7. 在 `frontend/src/components/` 写组件
8. 写 SKILL.md 强指令型说明

## 占位符清单

| Key | 例子 | 说明 |
|---|---|---|
| `{{SLUG}}` | `order-detail` | block 目录名（kebab-case） |
| `{{SLUG_SNAKE}}` | `order_detail` | snake_case 版（Python 标识符用） |
| `{{ENV_PREFIX}}` | `OD` | 环境变量前缀（`OD_DATABASE_URL`） |
| `{{ENV_PREFIX_LOWER}}` | `od` | 小写版（pg user / db / volume 等） |
| `{{PKG_NS}}` | `od` | npm 包前缀（`@od/...`） |
| `{{BACKEND_PORT}}` | `8082` | uvicorn 端口 |
| `{{POSTGRES_PORT}}` | `5546` | postgres 主机映射端口 |
| `{{TITLE_EN}}` | `Order Detail` | block 英文标题 |
| `{{TITLE_CN}}` | `订单详情` | 中文标题 |
| `{{SEED_CMD}}` | `od-seed` | 种子 CLI 命令名 |

注意端口规划：IM 用 8080/5544，commerce 用 8081/5545。下一个 block
应使用 8082/5546 起递增，避免本地冲突。
