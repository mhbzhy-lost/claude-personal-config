---
name: im-e2ee
description: Signal 体系端到端加密协议栈（X3DH / Sesame / PQXDH）核心要点
tech_stack: [signal, im, crypto]
capability: [encryption, realtime-messaging]
version: "X3DH unversioned; Sesame unversioned; PQXDH unversioned"
collected_at: 2026-04-18
---

# IM 端到端加密（Signal 协议栈）

> 来源：https://signal.org/docs/specifications/x3dh/, https://signal.org/docs/specifications/sesame/, https://signal.org/docs/specifications/pqxdh/

## 用途
为异步 IM 提供三位一体的端到端加密基础：X3DH 负责异步密钥协商（前向安全 + 可否认），Sesame 管理多设备多会话生命周期，PQXDH 在 X3DH 基础上叠加后量子 KEM 抵御量子对手。

## 何时使用
- 构建新 IM 时选型 E2EE 协议栈（通常 X3DH/PQXDH → Double Ratchet → Sesame）
- 需要支持对端离线时仍能发首条加密消息（异步握手）
- 多设备场景：同一账号多个设备间收发要全部加密到位
- 应对量子计算威胁（harvest-now-decrypt-later）——升级到 PQXDH

## 基础用法

**X3DH 三阶段**：
1. Bob 向服务器发布：身份键 `IKB`、带签名的预签名键 `SPKB`、一组一次性预签名键 `OPKB`
2. Alice 拉取 Bob 的 prekey bundle，验签后生成临时键 `EKA`，执行 DH：
   - 无 OPK：`DH1 || DH2 || DH3`
   - 有 OPK：追加 `DH4`
   - `SK = KDF(DH 串接结果)`
3. Bob 收到首条消息，重算 DH 得到相同 SK 并解密

**PQXDH 在 X3DH 上追加 PQ KEM**：
```
DH1 = DH(IKA, SPKB)
DH2 = DH(EKA, IKB)
DH3 = DH(EKA, SPKB)
(CT, SS) = PQKEM-ENC(PQPKB)   # 后量子 KEM 封装
SK = KDF(DH1 || DH2 || DH3 || SS)
# 若有 OPK 再追加 DH4
```
Bob 侧新增一类 prekey：签名的 last-resort 后量子 prekey `PQSPKB` + 一次性 `PQOPKB`。

**Sesame 设备态结构**：
- `UserRecords`（by UserID）→ `DeviceRecords`（by DeviceID）→ 1 个 active session + 有序 inactive 列表
- 发送：对目标用户的每个非 stale 设备用 active session 加密；服务端返回设备花名册变化时动态增删会话
- 接收：在 inactive session 上成功解密则升级为 active，双方自然收敛到单一会话对
- 用户/设备删除后标记为 stale 而非立即清除，给延迟消息留窗口

## 关键 API（摘要）
- **参数选型**：Curve（X25519 / X448）、Hash（SHA-256 / SHA-512）、Info 字符串、公钥编码函数
- **X3DH 密钥**：`IKA/IKB`（长期身份）、`SPKB`（周期轮换签名预签名键）、`OPKB`（一次性）、`EKA`（每轮临时）
- **PQXDH 新增**：`PQSPKB`（签名 last-resort KEM prekey）、`PQOPKB`（一次性 KEM prekey）
- **Sesame 记录**：UserRecord、DeviceRecord、active/inactive session、stale 标记
- **KDF 输入顺序**：必须严格按 `DH1||DH2||DH3[||DH4]` / `...||SS` 拼接，否则双端推不出同一 SK
- 典型组合：X3DH/PQXDH 只做首次协商，后续消息交给 Double Ratchet；跨设备/多会话由 Sesame 调度

## 注意事项
- **身份验证**：协议本身不防中间人，用户必须通过指纹比对（safety number）校验对端 IK，这是整套体系的安全根
- **设备沦陷是灾难性的**：无法只"撤销"，必须替换设备并通知全部联系人轮换会话
- **签名预签名键 SPKB 要周期轮换**并及时删除旧的，降低泄露窗口
- **一次性预签名键**是前向安全的关键；恶意服务器可拒发 OPK 但无法解密消息
- **同时握手的会话收敛**：双方同时创建会话时，Sesame 通过"收到即升为 active"规则收敛到单一 session 对
- **状态回滚**：备份恢复导致 ratchet 状态回退会破坏安全属性，通常的做法是标 stale 并重建会话
- **PQXDH 的 PQ 属性只覆盖机密性**：认证仍基于椭圆曲线签名，面对拥有量子计算机的主动攻击者认证不是量子安全
- **可否认性**：协议不生成可对外发布的通信证明；但也意味着不能用协议产物证明"对方说过什么"
- **重放防御**：X3DH 之后协议应各自协商新鲜密钥
- 形式化验证（ProVerif / CryptoVerif）在 Gap-DH + Module-LWE 假设下证明了机密与认证

## 组合提示
- **Double Ratchet** 几乎必配：X3DH/PQXDH 只出根密钥 SK，之后每条消息的 per-message key 由 Double Ratchet 派生
- **Sesame + X3DH/PQXDH + Double Ratchet** 三件套是 Signal 体系的完整形态
- 与 `im-offline-sync` 配合：prekey 发布/下发走服务器，离线首消息先走 X3DH bundle，后续消息才进 MAM/离线队列
- 避免自造 KDF/协议变体；直接使用 `libsignal` 等参考实现
