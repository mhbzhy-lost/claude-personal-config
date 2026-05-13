---
name: user-profile-frontend
description: 社交用户主页(cover+头像+stats+关注/编辑+tabs)必须用 `UserProfile`,禁止自行拼装(易漏 cover 覆叠/响应式/is_self 切换)。
---

# `@up/user-profile`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `UserProfile`:

- 社交类 / 协作类 / 内容平台的"个人主页"
- 需要 cover banner + 头像覆叠 + 关注按钮 + posts tabs
- 自己 vs 他人主页要区分动作(编辑 vs 关注)

## 何时**不**使用

- 后台用户管理列表 → `data-table`
- 登录/注册流程 → 待建 `auth-flow`
- 私信会话 → `im-conversation-list` / `im-chat-detail`
- 评论楼层中的"用户卡片浮层" → 用 antd `Popover`

## 安装

```bash
pnpm add file:./sdk/user-profile/frontend
```

## 最小用法

```tsx
import { UserProfile } from '@up/user-profile';
import '@up/user-profile/styles.css';

<UserProfile
  config={{ apiBaseUrl: 'http://localhost:8087' }}
  userId="01JBUSERDEMO001"
  tabs={[
    { key: 'posts', label: '帖子', count: 128, render: () => <PostsList /> },
  ]}
  onFollow={(id) => api.follow(id)}
  onUnfollow={(id) => api.unfollow(id)}
  onEdit={() => openEdit()}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `data` | `UserProfileData` | — | 优先级高于 fetch |
| `config` | `BlockConfig` | — | fetch 必填 |
| `userId` | `string` | — | fetch 必填 |
| `tabs` | `ProfileTab[]` | — | 主体下方 tabs;省略则无 |
| `activeTabKey` | `string` | 第一个 tab | 受控 |
| `onTabChange` | `(key) => void` | — | tab 切换 |
| `onFollow` | `(userId) => void` | — | 显示"关注"按钮 |
| `onUnfollow` | `(userId) => void` | — | `is_following=true` 显示"已关注" |
| `onEdit` | `() => void` | — | `is_self=true` 显示"编辑资料" |
| `headerExtra` | `ReactNode` | — | follow/edit 旁边的额外按钮(私信/更多) |
| `className` | `string` | — | |
| `height` | `string \| number` | `'100%'` | |

`UserProfileData`:`{ id, name, handle?, avatar?, cover?, bio?, location?, website?, joined_at?, stats, is_following?, is_self?, verified?, meta? }`

`ProfileStats`:`{ posts?, followers?, following?, [key]: number }`(host 可扩展)

`ProfileTab`:`{ key, label, count?, render: () => ReactNode }`

## 内部已经处理好的事项

- ✅ 自动 fetch:`config + userId` 时 GET `/v1/users/:id`
- ✅ cover banner(渐变兜底,无 cover 也美观)
- ✅ 头像覆叠 cover 下边缘(`margin-top: -56px`)
- ✅ verified 蓝勾标签 + aria-label
- ✅ stats 矩阵自动从 `stats` 对象渲染(支持 host 扩展 key)
- ✅ is_self vs is_following 三态按钮(编辑 / 已关注 / 关注)
- ✅ tabs 切换受控/非受控,count 自动 `label · N` 渲染
- ✅ 响应式:< 768 px header 单列 + actions 移至底部

## 严格禁止的反模式

❌ **自己拼 cover + 头像覆叠**:本块就是为了消灭这种重复;每次手写都漏覆叠像素 / 响应式

❌ **不区分 is_self vs is_following**:本块基于 `data.is_self` 切按钮文案与含义,host 必须正确填这两个字段

❌ **`stats` 用最小单位**(粉丝数 = 24800 但展示成 "2.48 万"):本块按数字直接渲染,host 自己用 `formatCount` 包装后再传

❌ **`tabs.render` 内部还监听 tab 切换**:本块在 tab 切换时只 mount 对应 tab 的 render 输出,host 不要在 render 内重复管理 tabKey

❌ **改 sdk 内 UserProfile.tsx**:想加"消息按钮"→ 用 `headerExtra` slot;真要改大版式包 Adapter

## 状态

- v0.1 — 首版形态参考;未来:头像浮层放大、cover 视差、posts feed 内置消费 card-flow、resp 设计、关注按钮 loading
