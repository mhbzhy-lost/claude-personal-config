---
name: payment-reconciliation
description: "支付对账与清算：日终对账流程、账单下载与解析、差异处理、退款流水、资金结算、账务模型。"
tech_stack: [payment, backend]
capability: [payment-reconcile]
---

# 支付对账与清算

> 版本基准：支付宝开放平台 v3 / 微信支付 APIv3 / 银联在线网关 -- 截至 2025 年 5 月

## 用途

实现支付系统与第三方渠道之间的资金核对闭环：通过日终对账发现并修正交易差异，保障商户资金准确无误地结算到账，并在账务层面建立复式记账模型以支持审计与财务报表。

## 何时使用

- 系统上线支付功能后，需要建立每日自动对账机制保障资金安全
- 发现渠道回调丢失或本地订单状态与渠道不一致时，需要差异处理流程
- 退款业务量增长，需要单独的退款对账与状态追踪
- 引入多渠道支付后，需要统一的账单标准化与跨渠道资金归集
- 财务合规要求建立复式记账账务模型，支持日终轧账与审计追溯

---

## 对账流程概览

### 整体流程

```
T+1 凌晨
  │
  ├─ 1. 下载渠道账单
  │     支付宝 (09:00+)、微信 (10:00+)、银联 (凌晨)
  │
  ├─ 2. 解析 & 标准化
  │     CSV/GZIP/固定宽度 → 统一对账记录结构
  │
  ├─ 3. 逐笔匹配
  │     以 merchant_order_no 为主键关联本地订单
  │
  ├─ 4. 生成差异报告
  │     长款 / 短款 / 金额不一致 / 状态不一致
  │
  ├─ 5. 差异处理
  │     自动补单 / 人工审核 / 退款核实
  │
  └─ 6. 归档 & 轧账
        原始账单归档，试算平衡检查
```

### 为什么必须做对账

1. **渠道回调丢失**：网络抖动、服务重启、队列积压等原因导致异步通知未到达，本地状态停留在"待支付"而渠道实际已扣款。
2. **本地状态不一致**：并发更新、幂等处理遗漏、数据库事务部分提交等场景下，本地订单状态可能与真实资金流向不符。
3. **退款未同步**：退款由客服后台或渠道侧发起后，本地退款记录可能延迟甚至缺失。
4. **手续费核对**：渠道实际扣除的手续费可能因费率调整、优惠活动等原因与预期不符。

### 对账频率

| 类型 | 频率 | 适用场景 |
|------|------|---------|
| T+1 日终对账 | 每天一次 | **主流模式**，覆盖所有交易 |
| T+0 实时对账 | 准实时 | 高价值订单、即时到账业务的补充手段 |
| 定期全量校验 | 月度/季度 | 防止累计误差，审计用 |

T+0 实时对账通常基于渠道主动查询接口（如微信 `/v3/pay/transactions/out-trade-no/{out_trade_no}`），在回调超时后主动查单校正，作为日终对账的前置补充。

---

## 账单下载 API 速查

### 三大渠道对比

| 渠道 | API | 账单格式 | 可用时间 | 时区 | 说明 |
|------|-----|---------|---------|------|------|
| 支付宝 | `alipay.data.dataservice.bill.downloadurl.query` | CSV (ZIP) | T+1 09:00 后 | 东八区 | `bill_type`: trade / signcustomer |
| 微信支付 | `/v3/bill/tradebill` 或 `/v3/bill/fundflowbill` | CSV (GZIP) | T+1 10:00 后 | 东八区 | `bill_type`: ALL / SUCCESS / REFUND / RECHARGE_REFUND |
| 银联 | 文件下载 (SFTP / HTTP) | 固定宽度文本 | T+1 凌晨 | 东八区 | 需按商户号分别下载 |

### 支付宝账单下载

```
POST /gateway.do
  method=alipay.data.dataservice.bill.downloadurl.query
  biz_content={
    "bill_type": "trade",
    "bill_date": "2025-05-15"
  }

响应 → bill_download_url（有效期 30 秒，需立即下载）
```

```bash
# 伪代码: 下载并解压
curl -o bill.zip "${bill_download_url}"
unzip bill.zip -d /data/bills/alipay/2025-05-15/
# 解压后包含: 业务明细 + 汇总文件
# 文件编码: GBK
```

注意事项：
- `bill_download_url` 有效期极短（约 30 秒），获取后必须立即下载
- `bill_type=trade` 下载交易账单，`bill_type=signcustomer` 下载商户签约账单
- 账单 CSV 首行为表头，末尾有汇总行（解析时需跳过）

### 微信支付账单下载

```
GET /v3/bill/tradebill?bill_date=2025-05-15&bill_type=ALL

响应 → { "download_url": "...", "hash_type": "SHA1", "hash_value": "..." }
```

```bash
# 伪代码: 下载并解压
curl -H "Authorization: WECHATPAY2-SHA256-RSA2048 ..." \
     "${download_url}" -o bill.csv.gz
gunzip bill.csv.gz
# 文件编码: UTF-8
# 需校验 hash_value
```

注意事项：
- 下载 URL 需携带微信支付签名认证头
- 必须校验 `hash_value`，防止传输篡改
- `bill_type=ALL` 包含所有交易；`REFUND` 仅含退款
- 资金账单 `/v3/bill/fundflowbill` 需额外权限

### 银联账单下载

```bash
# 银联对账文件通常通过 SFTP 拉取
sftp merchant@sftp.unionpay.com:/settle/20250515/
# 或 HTTP 下载（需商户证书认证）
curl --cert merchant.pem \
     "https://filedownload.95516.com/settle?merId=xxxx&date=20250515" \
     -o settle_20250515.txt
# 文件编码: GBK
# 固定宽度字段，需按位置切割
```

注意事项：
- 多商户号场景需逐个下载
- 文件名和路径因接入方式而异，以银联技术对接文档为准
- 固定宽度格式中字段位置在版本升级时可能变化

---

## 账单解析与标准化

### 统一对账记录结构

所有渠道账单解析后统一映射到以下标准结构：

```sql
CREATE TABLE recon_channel_bill (
    id              BIGSERIAL PRIMARY KEY,
    channel         VARCHAR(20)    NOT NULL,  -- alipay / wechat / unionpay
    channel_trade_no VARCHAR(64)   NOT NULL,  -- 渠道交易流水号
    merchant_order_no VARCHAR(64)  NOT NULL,  -- 商户订单号
    amount_cents    BIGINT         NOT NULL,  -- 交易金额（分）
    refund_amount_cents BIGINT     NOT NULL DEFAULT 0,  -- 退款金额（分）
    fee_cents       BIGINT         NOT NULL DEFAULT 0,  -- 手续费（分）
    trade_status    VARCHAR(20)    NOT NULL,  -- SUCCESS / REFUND / CLOSED
    trade_time      TIMESTAMPTZ    NOT NULL,  -- 交易时间
    bill_date       DATE           NOT NULL,  -- 账单日期
    raw_data        JSONB,                    -- 原始行数据（用于争议排查）
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (channel, channel_trade_no, bill_date)
);

CREATE INDEX idx_recon_bill_match
    ON recon_channel_bill (merchant_order_no, bill_date);
```

### 支付宝 CSV 字段映射

支付宝业务明细 CSV（GBK 编码）核心字段：

| 支付宝字段 | 标准字段 | 说明 |
|-----------|---------|------|
| 支付宝交易号 | channel_trade_no | 去除前后空格 |
| 商户订单号 | merchant_order_no | 去除前后空格 |
| 订单金额（元） | amount_cents | **元转分：乘 100 后取整** |
| 退款金额（元） | refund_amount_cents | 同上 |
| 服务费（元） | fee_cents | 同上，注意为负数表示支出 |
| 交易状态 | trade_status | 交易完成→SUCCESS，退款成功→REFUND |
| 交易创建时间 | trade_time | 格式 `yyyy-MM-dd HH:mm:ss` |

解析要点：
- CSV 首行有 BOM 标记，某些解析库会将其混入第一个字段名
- 末尾 5 行为汇总信息（以 `#` 或特殊前缀开头），需过滤
- 字段值前后有空格和制表符，必须 trim
- GBK 编码需显式指定，否则中文乱码

### 微信支付 CSV 字段映射

微信支付账单（UTF-8 编码，带 BOM）核心字段：

| 微信字段 | 标准字段 | 说明 |
|---------|---------|------|
| 微信支付订单号 | channel_trade_no | |
| 商户订单号 | merchant_order_no | |
| 订单金额 | amount_cents | 元转分 |
| 申请退款金额 | refund_amount_cents | 元转分 |
| 手续费 | fee_cents | 元转分 |
| 交易状态 | trade_status | SUCCESS / REFUND / REVOKED |
| 交易时间 | trade_time | 格式 `` `yyyy-MM-dd HH:mm:ss` `` |

解析要点：
- 每个字段值前有反引号 `` ` `` 前缀（防止 Excel 自动格式化），解析时必须去除
- 文件首行为表头，倒数第二行为"总交易单数"汇总行，最后一行为汇总金额
- 退款和支付混在一份账单中（`bill_type=ALL` 时），需按交易状态区分

### 银联固定宽度文本解析

银联对账文件为固定宽度字段格式（GBK 编码），典型字段布局：

| 起始位 | 长度 | 字段名 | 标准字段 |
|--------|------|--------|---------|
| 1 | 15 | 商户号 | -- |
| 16 | 20 | 交易流水号 | channel_trade_no |
| 36 | 32 | 商户订单号 | merchant_order_no |
| 68 | 12 | 交易金额 | amount_cents（单位已是分） |
| 80 | 8 | 交易日期 | trade_time（yyyyMMdd） |
| 88 | 6 | 交易时间 | trade_time（HHmmss） |
| 94 | 2 | 交易类型 | trade_status（00=消费 01=退货） |

解析要点：
- 按字节位置切割，非字符位置（中文字符在 GBK 中占 2 字节）
- 金额单位已是"分"，无需转换
- 不同版本的对账文件字段布局可能不同，需在对接时确认

### 字符编码处理

```
渠道       编码       BOM
支付宝     GBK        无（但首行可能有 BOM）
微信支付   UTF-8      有 BOM (EF BB BF)
银联       GBK        无
```

推荐策略：
1. 读取文件时先检测前 3 字节是否为 UTF-8 BOM `0xEF 0xBB 0xBF`，有则去除
2. 对支付宝/银联文件显式指定 GBK 解码
3. 解码后统一转为 UTF-8 存储
4. 用 `chardet` 等库做二次校验，防止渠道静默更改编码

---

## 逐笔匹配与差异处理

### 匹配逻辑

核心思路：以 `merchant_order_no` 为主键，将渠道账单与本地订单做 FULL OUTER JOIN。

```sql
-- 逐笔匹配查询
SELECT
    b.channel,
    b.channel_trade_no,
    b.merchant_order_no   AS bill_order_no,
    o.order_no            AS local_order_no,
    b.amount_cents        AS bill_amount,
    o.pay_amount_cents    AS local_amount,
    b.trade_status        AS bill_status,
    o.status              AS local_status,
    CASE
        WHEN o.order_no IS NULL           THEN 'LONG'       -- 长款
        WHEN b.merchant_order_no IS NULL  THEN 'SHORT'      -- 短款
        WHEN b.amount_cents != o.pay_amount_cents
                                          THEN 'AMOUNT_DIFF' -- 金额不一致
        WHEN b.trade_status != o.mapped_status
                                          THEN 'STATUS_DIFF' -- 状态不一致
        ELSE 'MATCH'                                         -- 一致
    END AS recon_result
FROM recon_channel_bill b
FULL OUTER JOIN payment_order o
    ON b.merchant_order_no = o.order_no
    AND b.bill_date = o.pay_date
WHERE b.bill_date = '2025-05-15'
   OR o.pay_date  = '2025-05-15';
```

### 差异类型详解

#### 长款（渠道有、本地无）

**现象**：渠道账单中有一笔支付成功的交易，但本地订单表中找不到对应记录，或本地状态仍为"待支付"。

**常见原因**：
- 异步回调丢失（网络问题、服务宕机）
- 本地订单创建失败但用户在收银台完成了支付
- 订单号映射错误

**处理策略**：
1. 先通过渠道查单接口确认交易确实存在
2. 本地有待支付订单 → 更新为已支付（补单）
3. 本地完全无记录 → 创建补单记录并标记 `source=recon`，进入人工审核

#### 短款（本地有、渠道无）

**现象**：本地标记为已支付，但渠道账单中无对应记录。

**常见原因**：
- 重复通知导致本地误更新
- 模拟/伪造的回调通知（安全问题）
- 渠道侧交易实际未成功

**处理策略**：
1. 调用渠道查单接口确认交易真实状态
2. 渠道确认未支付 → 本地回滚订单状态，如已发货则走退款
3. 涉及安全风险的短款必须告警

#### 金额不一致

**现象**：本地记录金额与渠道账单金额不匹配。

**常见原因**：
- 元/分单位转换错误
- 优惠券/折扣在渠道侧和本地的计算口径不同
- 部分退款已在渠道侧生效但本地未记录

**处理策略**：必须人工审核，不可自动处理。

#### 状态不一致

**现象**：本地显示已退款但渠道仍显示已支付，或反过来。

**常见原因**：
- 退款异步通知延迟
- 退款在渠道侧仍在处理中

**处理策略**：
1. 查询渠道退款状态接口确认
2. 退款处理中 → 等待下一对账周期再确认
3. 退款已完成但本地未更新 → 补更新

### 差异处理自动化策略

```
差异类型        自动处理        人工审核阈值
长款           可自动补单       金额 > 500 元需人工
短款           禁止自动处理     全部人工
金额不一致      禁止自动处理     全部人工
状态不一致      可自动同步       退款金额 > 1000 元需人工
```

建议：自动处理的补单/状态同步操作必须记录完整审计日志，并在差异报告中标注为"系统自动处理"。

### 对账差异表 DDL

```sql
CREATE TABLE recon_diff (
    id              BIGSERIAL PRIMARY KEY,
    bill_date       DATE           NOT NULL,
    channel         VARCHAR(20)    NOT NULL,
    diff_type       VARCHAR(20)    NOT NULL,  -- LONG / SHORT / AMOUNT_DIFF / STATUS_DIFF
    merchant_order_no VARCHAR(64),
    channel_trade_no VARCHAR(64),
    bill_amount_cents   BIGINT,
    local_amount_cents  BIGINT,
    bill_status     VARCHAR(20),
    local_status    VARCHAR(20),
    handle_status   VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
        -- PENDING / AUTO_FIXED / MANUAL_REVIEW / RESOLVED / IGNORED
    handle_remark   TEXT,
    handler         VARCHAR(50),              -- 处理人（自动处理记 'SYSTEM'）
    handled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_diff_date ON recon_diff (bill_date, channel);
CREATE INDEX idx_recon_diff_status ON recon_diff (handle_status);
```

---

## 退款全流程

### 退款状态机

```
         发起退款
            │
            v
    ┌─ REFUND_PENDING ─┐
    │   (本地已受理)      │
    │       │            │
    │       v            │
    │  REFUND_PROCESSING │    提交渠道失败
    │   (渠道处理中)      ├──────────────┐
    │       │            │              v
    │       ├────────────┤      REFUND_FAILED
    │       │            │      (退款失败)
    │       v            │
    │  REFUND_SUCCESS    │
    │   (退款成功)        │
    └────────────────────┘
```

状态转换规则：
- `REFUND_PENDING` → `REFUND_PROCESSING`：成功调用渠道退款 API
- `REFUND_PROCESSING` → `REFUND_SUCCESS`：收到渠道退款成功通知
- `REFUND_PROCESSING` → `REFUND_FAILED`：渠道返回退款失败
- `REFUND_PENDING` → `REFUND_FAILED`：调用渠道退款 API 失败（网络超时等）
- `REFUND_FAILED` → `REFUND_PENDING`：人工重新发起

### 全额退款 vs 部分退款

| 维度 | 全额退款 | 部分退款 |
|------|---------|---------|
| 退款金额 | 等于订单支付金额 | 小于订单支付金额 |
| 发起次数 | 仅一次 | 可多次，累计不超过原金额 |
| 订单状态 | 退款后关闭 | 退款后订单仍有效 |
| 对账复杂度 | 低（一对一匹配） | 高（需累计匹配） |

部分退款的累计校验：

```sql
-- 检查退款是否超额
SELECT
    o.order_no,
    o.pay_amount_cents,
    COALESCE(SUM(r.refund_amount_cents), 0) AS total_refunded,
    o.pay_amount_cents - COALESCE(SUM(r.refund_amount_cents), 0) AS refundable
FROM payment_order o
LEFT JOIN refund_order r ON r.order_no = o.order_no
    AND r.status IN ('REFUND_PENDING', 'REFUND_PROCESSING', 'REFUND_SUCCESS')
WHERE o.order_no = 'ORD20250515001'
GROUP BY o.order_no, o.pay_amount_cents;
```

### 退款与原订单关联

- **支付宝**：退款请求中通过 `out_request_no`（退款请求号）关联原交易的 `out_trade_no`（商户订单号）
- **微信支付**：通过 `out_refund_no`（商户退款单号）关联原交易的 `out_trade_no`

退款单表设计：

```sql
CREATE TABLE refund_order (
    id                  BIGSERIAL PRIMARY KEY,
    refund_no           VARCHAR(64)    NOT NULL UNIQUE,  -- 商户退款单号
    order_no            VARCHAR(64)    NOT NULL,         -- 原商户订单号
    channel             VARCHAR(20)    NOT NULL,
    channel_refund_no   VARCHAR(64),                     -- 渠道退款流水号
    refund_amount_cents BIGINT         NOT NULL,
    refund_reason       VARCHAR(200),
    status              VARCHAR(20)    NOT NULL DEFAULT 'REFUND_PENDING',
    notify_data         JSONB,                           -- 渠道回调原始数据
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refund_order_no ON refund_order (order_no);
```

### 退款对账

退款必须单独对账，不能仅依赖支付对账覆盖：

1. 下载退款账单（微信 `bill_type=REFUND`，支付宝退款记录在 trade 账单中以状态区分）
2. 以 `refund_no` 为主键匹配本地退款表
3. 差异类型同支付对账：长款（渠道有退款记录但本地无）、短款（本地有退款但渠道无记录）
4. 退款金额不一致时必须人工审核

### 退款资金流向

| 渠道 | 原路退回 | 余额退回 | 说明 |
|------|---------|---------|------|
| 支付宝 | 默认 | 支持 | 原路退回到用户支付宝账户 |
| 微信支付 | 默认 | 支持（需开通） | 退回到微信零钱或银行卡 |
| 银联 | 默认 | 不支持 | 原路退回到银行卡，周期较长（3-15 工作日） |

注意：原路退回的到账时间因渠道和银行而异，退款成功不等于用户立即收到退款。

---

## 资金结算

### 结算周期

| 渠道 | 标准周期 | 可选周期 | 说明 |
|------|---------|---------|------|
| 支付宝 | T+1 | T+0（需申请） | 工作日结算，遇节假日顺延 |
| 微信支付 | T+1 | T+0（需开通实时到账） | 同上 |
| 银联 | T+1 / D+1 | 视协议而定 | D+1 含节假日 |

T+1 表示交易日后第一个工作日结算，D+1 表示自然日后一天结算。

### 结算金额计算

```
结算金额 = 交易净额 - 手续费 - 退款金额

其中：
  交易净额 = 当日所有成功交易金额之和
  手续费   = 每笔交易金额 x 费率（如 0.6%），不足最低手续费按最低收取
  退款金额 = 当日完成退款的金额之和（从结算款中扣除）
```

示例计算（费率 0.6%，无最低手续费）：

```
交易净额:  100,000.00 元（100 笔 x 1000 元）
手续费:       600.00 元（100,000 x 0.6%）
退款金额:   2,000.00 元（2 笔退款）
──────────────────────
结算金额:  97,400.00 元
```

### 手续费计算

```sql
-- 手续费计算（含最低手续费逻辑）
SELECT
    order_no,
    pay_amount_cents,
    GREATEST(
        ROUND(pay_amount_cents * fee_rate),  -- 按费率计算
        min_fee_cents                        -- 最低手续费
    ) AS fee_cents
FROM payment_order o
JOIN channel_fee_config c ON o.channel = c.channel
WHERE o.pay_date = '2025-05-15'
  AND o.status = 'SUCCESS';
```

注意事项：
- 费率精度通常为万分位（如 0.0060 表示 0.6%）
- 手续费计算结果取整规则需与渠道一致（四舍五入 / 向上取整）
- 优惠费率（如支付宝新商户 0.25%）有时间限制
- 部分退款时手续费是否退还取决于渠道政策（支付宝退、微信不退）

### 分账（Split Payment）

当平台需要将交易金额拆分给多个收款方时：

**微信支付分账**：
- 调用 `/v3/profitsharing/orders` 发起分账
- 需先通过 `/v3/profitsharing/receivers/add` 添加分账接收方
- 分账比例由平台自行控制，但渠道有最大比例限制（如 30%）
- 分账冻结期内可多次分账，超期自动解冻归商户

**支付宝分账**（`royalty_info`）：
- 下单时在 `extend_params` 中设置 `royalty_info` 声明分账关系
- 交易成功后调用 `alipay.trade.order.settle` 执行分账
- 支持多次分账，总额不超过原交易金额

分账对账要点：分账明细需单独对账，确保各接收方实际收到的金额与预期一致。

### 结算对账

银行到账后进行结算对账：

```sql
-- 结算对账：预期 vs 实际
SELECT
    settle_date,
    channel,
    expected_settle_cents,   -- 根据交易/退款/手续费计算的预期值
    actual_settle_cents,     -- 银行回单上的实际到账金额
    expected_settle_cents - actual_settle_cents AS diff_cents
FROM settlement_record
WHERE settle_date = '2025-05-16'
  AND ABS(expected_settle_cents - actual_settle_cents) > 0;
```

结算差异常见原因：
- 渠道在结算日扣除了前日的退款
- 手续费计算的四舍五入差（通常在几分钱以内）
- 银行手续费（跨行结算时可能额外扣除）
- 分账金额的扣除

---

## 账务模型

### 复式记账基本概念

每笔交易至少影响两个科目，借贷总额始终平衡：
- **借（Debit）**：资产增加或负债/收入减少
- **贷（Credit）**：负债/收入增加或资产减少

支付系统常用科目：

| 科目编号 | 科目名称 | 类型 | 说明 |
|---------|---------|------|------|
| 1001 | 银行存款 | 资产 | 已到账资金 |
| 1101 | 应收账款-渠道 | 资产 | 渠道已收款但未结算到商户 |
| 2001 | 预收款项-商户 | 负债 | 已收用户款项但未确认收入 |
| 6001 | 手续费支出 | 费用 | 支付渠道手续费 |
| 6601 | 营业收入 | 收入 | 确认收入时使用 |

### 支付场景的会计分录

#### 用户支付成功

用户通过渠道支付 100 元：

```
借: 应收账款-渠道(1101)   10000 分
贷: 预收款项-商户(2001)   10000 分
```

含义：渠道欠商户 100 元（资产增加），同时商户欠用户一笔待履约的款项（负债增加）。

#### 渠道 T+1 结算到账

渠道结算 100 元，扣除 0.6% 手续费（0.6 元）后到账 99.4 元：

```
借: 银行存款(1001)          9940 分
借: 手续费支出(6001)           60 分
贷: 应收账款-渠道(1101)    10000 分
```

含义：银行实际到账 99.4 元，手续费 0.6 元作为费用支出，渠道应收清零。

#### 退款

用户退款 100 元（原路退回）：

```
借: 预收款项-商户(2001)    10000 分
贷: 应收账款-渠道(1101)    10000 分
```

含义：商户不再欠用户这笔款（负债减少），同时渠道将从下期结算中扣除该金额（资产减少）。

#### 确认收入

商品发货/服务完成后确认收入：

```
借: 预收款项-商户(2001)    10000 分
贷: 营业收入(6601)         10000 分
```

### 账户余额表设计

```sql
CREATE TABLE account_balance (
    id              BIGSERIAL PRIMARY KEY,
    account_code    VARCHAR(10)    NOT NULL,  -- 科目编号
    account_name    VARCHAR(50)    NOT NULL,  -- 科目名称
    account_type    VARCHAR(10)    NOT NULL,  -- ASSET / LIABILITY / INCOME / EXPENSE
    balance_cents   BIGINT         NOT NULL DEFAULT 0,  -- 当前余额（分）
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (account_code)
);
```

### 流水表设计

```sql
CREATE TABLE account_journal (
    id              BIGSERIAL PRIMARY KEY,
    journal_no      VARCHAR(64)    NOT NULL UNIQUE,  -- 记账凭证号
    biz_type        VARCHAR(20)    NOT NULL,         -- PAYMENT / REFUND / SETTLE / REVENUE
    biz_no          VARCHAR(64)    NOT NULL,         -- 业务单号（订单号/退款号/结算号）
    entries         JSONB          NOT NULL,          -- 分录明细
    -- entries 示例:
    -- [
    --   {"account_code":"1101","direction":"DEBIT","amount_cents":10000},
    --   {"account_code":"2001","direction":"CREDIT","amount_cents":10000}
    -- ]
    remark          VARCHAR(200),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_biz ON account_journal (biz_type, biz_no);
```

也可采用扁平化分录表（一行一条分录），适合大规模查询和聚合：

```sql
CREATE TABLE account_entry (
    id              BIGSERIAL PRIMARY KEY,
    journal_no      VARCHAR(64)    NOT NULL,
    account_code    VARCHAR(10)    NOT NULL,
    direction       VARCHAR(6)     NOT NULL,  -- DEBIT / CREDIT
    amount_cents    BIGINT         NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entry_journal ON account_entry (journal_no);
CREATE INDEX idx_entry_account ON account_entry (account_code, created_at);
```

### 日终轧账（试算平衡检查）

每日对账完成后执行试算平衡，确保借贷总额相等：

```sql
-- 试算平衡检查
SELECT
    SUM(CASE WHEN direction = 'DEBIT' THEN amount_cents ELSE 0 END)  AS total_debit,
    SUM(CASE WHEN direction = 'CREDIT' THEN amount_cents ELSE 0 END) AS total_credit,
    SUM(CASE WHEN direction = 'DEBIT' THEN amount_cents ELSE 0 END)
  - SUM(CASE WHEN direction = 'CREDIT' THEN amount_cents ELSE 0 END) AS diff
FROM account_entry
WHERE created_at >= '2025-05-15 00:00:00+08'
  AND created_at <  '2025-05-16 00:00:00+08';

-- diff 必须为 0，否则说明记账有误
```

轧账流程：
1. 计算当日所有分录的借方总额和贷方总额
2. 差额为 0 → 平衡，记录轧账通过
3. 差额不为 0 → 告警，暂停次日对账，排查错误分录
4. 逐科目核对余额 = 期初余额 + 当日借方发生额 - 当日贷方发生额

---

## 常见陷阱

1. **时区陷阱**：渠道账单日期基于东八区自然日（00:00-24:00 CST），本地系统若使用 UTC 存储时间，查询 `pay_date = '2025-05-15'` 时需转换为 `2025-05-14T16:00:00Z ~ 2025-05-15T16:00:00Z`。跨时区不对齐是对账差异的头号来源。

2. **金额精度陷阱**：渠道账单中金额单位为"元"（浮点），本地存储应使用"分"（整数 BIGINT）。转换时使用 `ROUND(元 * 100)` 而非直接类型转换，避免 `0.01 * 100 = 0.9999999...` 导致的 1 分钱差异。禁止使用 FLOAT/DOUBLE 存储金额。

3. **重复对账陷阱**：对账任务应设计幂等机制。相同 `(channel, bill_date)` 的账单重复导入时，需先清除旧记录再重新导入，或通过唯一约束 `(channel, channel_trade_no, bill_date)` 防止重复。否则同一笔交易会被匹配两次，产生虚假的"长款"差异。

4. **账单不可用的应对**：渠道账单生成有延迟（支付宝 T+1 09:00、微信 T+1 10:00），过早请求会返回"账单不存在"。下载任务需内置重试机制（如每 30 分钟重试一次，最多重试 8 次），且必须区分"账单不存在"（可重试）和"参数错误"（不可重试）。

5. **编码混乱陷阱**：支付宝和银联使用 GBK 编码，微信使用 UTF-8 with BOM。若未正确处理编码，商户名称、商品描述等中文字段会乱码，甚至导致 CSV 解析行偏移。更危险的是：某些解析库默认忽略编码错误，导致商户订单号被静默截断，最终匹配失败产生虚假差异。

6. **微信账单字段前缀陷阱**：微信支付账单中每个字段值前有一个反引号 `` ` `` 字符（用于防止 Excel 将长数字转为科学计数法）。如果解析时未去除该前缀，`merchant_order_no` 会变成 `` `ORD20250515001`` 而非 `ORD20250515001`，导致全量匹配失败。

7. **退款手续费差异**：支付宝退款时会退还对应手续费，微信支付退款不退手续费。如果结算金额计算逻辑未区分渠道，会导致与银行到账金额产生系统性偏差。部分退款场景更复杂——支付宝按比例退还手续费。

8. **跨日交易归属**：用户在 23:59 发起支付、00:01 完成支付，该交易属于哪天的账单？不同渠道规则不同（支付宝按"交易创建时间"，微信按"支付成功时间"）。本地对账日期归属逻辑必须与渠道保持一致，否则会在日切时刻产生规律性的短款/长款。

9. **并发补单风险**：对账发现长款后自动补单时，恰好延迟的渠道回调也到达了，两者同时更新同一笔订单可能导致重复入账。补单操作必须使用数据库级别的唯一约束或分布式锁来保证幂等。

10. **账单汇总行干扰**：支付宝和微信的账单 CSV 末尾都包含汇总统计行。如果解析逻辑未正确过滤，汇总行会被当作一笔交易导入，产生一条金额巨大的"长款"差异。支付宝汇总行以 `#` 开头，微信汇总行字段数与明细行不同。

---

## 组合提示

- 与 **payment-gateway** 搭配：对账需要依赖网关层的统一订单号和渠道路由信息
- 与 **payment-resilience** 搭配：账单下载重试、补单幂等、分布式锁等依赖弹性设计
- 与 **payment-security** 搭配：账单下载 URL 签名验证、回调通知防伪
- 与 **alipay-apis / wechat-pay-apis / unionpay-apis** 搭配：各渠道具体的查单、退款、分账 API 细节
- 与 **alipay-notifications / wechat-pay-notifications** 搭配：异步通知是对账差异的主要来源，理解通知机制有助于排查问题
