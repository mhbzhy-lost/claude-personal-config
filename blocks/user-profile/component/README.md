# user-profile SDK

用户主页 SDK——**前端形态完整 + 后端 stub mock**。

```
component/
├── frontend/    UserProfile 组件 + useUserProfile hook + SKILL.md
├── backend/     FastAPI + stub /v1/users/:id (mock 返回 Alice Chen)
└── protocol/    OpenAPI 占位
```

## 定位:社交语境的用户主页形态参考

`UserProfile` 是 cover + 头像覆叠 + 名/认证/handle/bio + 位置/网站/加入时间
+ stats 矩阵 + 关注/编辑动作 + tabs 的标准社交主页骨架。
**完整业务规则**(follow 关系数据库 / posts feed / 资料编辑表单 / 私信入口)
host 在拷贝后扩展。

## 整体复制

```bash
cp -r blocks/user-profile/component your-project/sdk/user-profile
```

## 三层接入

### 1. 前端

```bash
pnpm add file:./sdk/user-profile/frontend
```

```tsx
import { UserProfile } from '@up/user-profile';
import '@up/user-profile/styles.css';

<UserProfile
  config={{ apiBaseUrl: 'http://localhost:8087' }}
  userId="01JBUSERDEMO001"
  tabs={[
    { key: 'posts', label: '帖子', count: 128, render: () => <MyPostsList /> },
    { key: 'likes', label: '喜欢', render: () => <MyLikesList /> },
  ]}
  onFollow={async (id) => await api.follow(id)}
  onUnfollow={async (id) => await api.unfollow(id)}
  onEdit={() => openEditModal()}
/>
```

### 2. 后端

```bash
cd sdk/user-profile/backend
uv venv && uv pip install -e '.[dev]'
uv run uvicorn app.main:app --port 8087
```

`GET /v1/users/01JBUSERDEMO001` 返回 mock(Alice Chen + cover + bio +
stats)。host 把 stub 换成真实持久化即可。

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8087` |
| postgres | `:5551` |
| env prefix | `UP_` |
| frontend pkg | `@up/user-profile` |

## 何时**不**用

- 后台用户管理(列表/筛选) → `data-table`
- 登录/注册/找回密码 → 待建 `auth-flow`
- 用户资料编辑表单 → host 自己拼(本块只触发 `onEdit`)
- 聊天对手资料浮卡 → 用 antd `Popover` 直接拼
