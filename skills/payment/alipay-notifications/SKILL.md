---
name: alipay-notifications
description: "支付宝异步通知：支付/退款回调验签、通知参数解析、幂等处理、HTTP 端点实现（Spring Boot/FastAPI）。"
tech_stack: [payment, alipay, backend]
language: [java, python]
capability: [payment-gateway]
---

# 支付宝异步通知处理

> 来源：https://opendocs.alipay.com/open/270/105902 (异步通知说明)
> 版本基准：alipay-sdk-java 4.40.x.ALL；python-alipay-sdk 3.4.0（fzlee/alipay）
> 前置依赖：`alipay-onboarding`（应用创建、密钥/证书配置、SDK 初始化）

## 用途

处理支付宝通过 POST 请求异步推送的支付结果和退款通知：签名验证、参数解析、幂等控制、业务状态流转，并正确响应 `success` 以终止重试。

## 何时使用

- 收到用户支付成功后的服务端回调，需要更新订单状态、发货/开通权益
- 收到部分退款或全额退款后的通知，需要更新退款记录
- 需要对通知做幂等处理，防止重复发货或重复退款记账
- 需要在 Spring Boot 或 FastAPI 中实现完整的通知接收端点

## 通知机制概览

### 触发流程

1. 商户在下单 API（如 `alipay.trade.app.pay`）中设置 `notify_url`
2. 用户完成支付后，支付宝服务器向 `notify_url` 发起 **POST** 请求，Content-Type 为 `application/x-www-form-urlencoded`
3. 商户服务端验签、处理业务、响应纯文本 `success`

### 重试策略

支付宝在 **25 小时内最多重试 8 次**，间隔为：

| 第 N 次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---------|---|---|---|---|---|---|---|---|
| 间隔 | 立即 | 4m | 10m | 10m | 1h | 2h | 6h | 15h |

只有收到响应体为纯文本 `success`（7 个小写字母，无引号、无 HTML、无 BOM）时才停止重试。HTTP 状态码不影响判断，关键是响应体内容。

### 通知地址要求

- 必须是公网可访问的 HTTPS 地址（生产环境）
- 不能包含查询参数（支付宝会拼接自己的参数）
- 沙箱环境可使用 HTTP

## 签名验证

**核心原则：先验签再处理业务，验签失败直接丢弃通知。**

### 验签流程（Step-by-Step）

1. 获取 POST 请求中的所有参数，存入 Map/Dict
2. 提取 `sign` 值并保存，提取 `sign_type` 值
3. 从参数 Map 中移除 `sign` 和 `sign_type`（rsaCheckV1）
4. 将剩余参数按 key 的 ASCII 码升序排列
5. 拼接为 `key1=value1&key2=value2&...` 格式的待验签字符串
6. 使用 **支付宝公钥**（非应用公钥）+ RSA2(SHA256WithRSA) 算法验证签名

### 公钥模式 vs 证书模式

| 维度 | 公钥模式 | 证书模式 |
|------|---------|---------|
| 验签方法（Java） | `AlipaySignature.rsaCheckV1()` | `AlipaySignature.rsaCertCheckV1()` |
| 所需密钥 | 支付宝公钥字符串 | 支付宝公钥证书路径 |
| sign_type 参与验签 | 否（移除 sign + sign_type） | 否（同样移除） |
| 适用场景 | 旧应用、简单集成 | 新应用推荐，支持证书轮转 |

> `rsaCheckV2` 仅用于生活号（服务窗）异步通知，保留 sign_type 参与验签。普通支付通知统一使用 `rsaCheckV1` 或 `rsaCertCheckV1`。

### Java 验签代码

```java
import com.alipay.api.internal.util.AlipaySignature;
import java.util.Map;

public class AlipayNotifyVerifier {

    /**
     * 公钥模式验签
     * @param params 通知的全部参数（原始 Map，包含 sign/sign_type）
     * @param alipayPublicKey 支付宝公钥（非应用公钥）
     * @return 验签是否通过
     */
    public static boolean verifyByPublicKey(Map<String, String> params,
                                            String alipayPublicKey) throws Exception {
        return AlipaySignature.rsaCheckV1(params, alipayPublicKey, "utf-8", "RSA2");
    }

    /**
     * 证书模式验签
     * @param params 通知的全部参数
     * @param alipayPublicCertPath 支付宝公钥证书路径
     */
    public static boolean verifyByCert(Map<String, String> params,
                                       String alipayPublicCertPath) throws Exception {
        return AlipaySignature.rsaCertCheckV1(params, alipayPublicCertPath, "utf-8", "RSA2");
    }
}
```

### Python 验签代码

```python
from urllib.parse import unquote
from base64 import b64decode
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
from cryptography.hazmat.primitives.serialization import load_pem_public_key

def verify_alipay_notification(params: dict[str, str], alipay_public_key: str) -> bool:
    """
    手动验签支付宝异步通知。
    :param params: 从 POST form 中解析出的全部参数
    :param alipay_public_key: 支付宝公钥（PEM 格式字符串）
    :return: 验签是否通过
    """
    sign = params.get("sign", "")
    # 移除 sign 和 sign_type，剩余参数按 key ASCII 升序排列
    filtered = {k: v for k, v in params.items() if k not in ("sign", "sign_type") and v}
    sorted_keys = sorted(filtered.keys())
    message = "&".join(f"{k}={filtered[k]}" for k in sorted_keys)

    try:
        public_key = load_pem_public_key(alipay_public_key.encode("utf-8"))
        public_key.verify(
            b64decode(sign),
            message.encode("utf-8"),
            PKCS1v15(),
            SHA256(),
        )
        return True
    except Exception:
        return False
```

> Python 使用 `cryptography` 库（`pip install cryptography`）。`alipay_public_key` 需包含 `-----BEGIN PUBLIC KEY-----` 和 `-----END PUBLIC KEY-----` 头尾。

## 支付成功通知参数

### 关键参数表

| 参数 | 类型 | 说明 |
|------|------|------|
| notify_id | String | 通知唯一 ID（可用于调用 notify_verify 接口校验真伪） |
| notify_type | String | 通知类型，如 `trade_status_sync` |
| notify_time | String | 通知发送时间，格式 `yyyy-MM-dd HH:mm:ss` |
| trade_no | String | 支付宝交易号（支付宝侧唯一） |
| out_trade_no | String | 商户订单号（商户侧唯一） |
| trade_status | String | 交易状态（见下方状态说明） |
| total_amount | String | 订单总金额（元） |
| receipt_amount | String | 实收金额 |
| buyer_pay_amount | String | 买家实付金额 |
| buyer_id | String | 买家支付宝用户 ID |
| seller_id | String | 卖家支付宝用户 ID |
| gmt_payment | String | 支付时间 |
| app_id | String | 应用 APPID |
| sign | String | 签名值 |
| sign_type | String | 签名类型（RSA2） |
| fund_bill_list | String | 支付资金渠道（JSON 字符串，可能被 HTML 转义） |
| passback_params | String | 回传参数（下单时设置的原样返回，URL 编码） |

### trade_status 状态说明

| 状态值 | 含义 | 是否触发通知 | 能否退款 |
|--------|------|------------|---------|
| WAIT_BUYER_PAY | 等待买家付款 | 否 | -- |
| TRADE_SUCCESS | 交易支付成功 | 是 | 可以退款 |
| TRADE_FINISHED | 交易完结 | 是 | 已过退款期，不可退款 |
| TRADE_CLOSED | 交易关闭 | 是 | -- |

**TRADE_SUCCESS vs TRADE_FINISHED 的区别**：

- `TRADE_SUCCESS`：用户已付款，订单仍在退款窗口期内（通常为交易完成后 90 天），商户可以发起退款
- `TRADE_FINISHED`：退款窗口期已关闭，不再接受退款请求。此通知在退款期到期时触发
- 实际业务中，**只需处理 TRADE_SUCCESS 即可**。TRADE_FINISHED 仅在需要感知退款窗口关闭时才需处理

### 业务校验清单

验签通过后，还需进行以下业务校验（防伪造通知）：

1. **out_trade_no** -- 检查是否为本系统创建的订单号
2. **total_amount** -- 检查金额是否与本地订单一致
3. **seller_id** -- 检查是否为本商户的支付宝账户 ID
4. **app_id** -- 检查是否为本应用的 APPID

## 退款通知

退款成功后，支付宝通过**同一个 notify_url** 发送退款通知。通过 `trade_status` 和退款相关字段区分。

### 退款通知特有参数

| 参数 | 说明 |
|------|------|
| gmt_refund | 退款时间 |
| refund_fee | 总退款金额（累计） |
| out_biz_no | 退款请求号（对应下单时的 out_request_no） |

### 区分支付通知与退款通知

- **支付通知**：`trade_status` 为 `TRADE_SUCCESS`，无 `out_biz_no` 字段
- **退款通知**：`trade_status` 为 `TRADE_SUCCESS`（部分退款）或 `TRADE_CLOSED`（全额退款），包含 `gmt_refund` 和 `refund_fee` 字段
- 判断方式：检查参数中是否存在 `gmt_refund` 或 `out_biz_no`

### 全额退款 vs 部分退款

| 场景 | trade_status | refund_fee | 触发通知 |
|------|-------------|------------|---------|
| 部分退款 | TRADE_SUCCESS | 累计退款金额 | 每次退款都触发 |
| 全额退款 | TRADE_CLOSED | 等于 total_amount | 触发 |

> 注意：全额退款后 trade_status 变为 TRADE_CLOSED，此时支付宝不一定发送异步通知（实测部分场景不发）。建议主动调用 `alipay.trade.fastpay.refund.query` 查询退款状态，不完全依赖异步通知。

## 幂等处理

支付宝会重试通知，商户端必须保证**同一笔通知处理多次的结果一致**。

### 推荐方案

```
1. 验签通过
2. 查询本地订单状态
3. if 订单已处理（已支付/已退款）:
       直接返回 "success"（不重复执行业务）
4. else:
       开启数据库事务
       更新订单状态（利用乐观锁或唯一约束防并发）
       执行业务逻辑（发货/退款记账等）
       提交事务
       返回 "success"
```

### 数据库层防重

```sql
-- 支付流水表，trade_no 唯一约束防止重复插入
CREATE TABLE payment_record (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    out_trade_no VARCHAR(64)  NOT NULL,
    trade_no     VARCHAR(64)  NOT NULL UNIQUE,  -- 支付宝交易号，唯一约束
    total_amount DECIMAL(10,2) NOT NULL,
    trade_status VARCHAR(32)  NOT NULL,
    paid_at      DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 退款流水表，out_biz_no 唯一约束
CREATE TABLE refund_record (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    out_trade_no VARCHAR(64)  NOT NULL,
    out_biz_no   VARCHAR(64)  NOT NULL UNIQUE,  -- 退款请求号，唯一约束
    refund_amount DECIMAL(10,2) NOT NULL,
    refunded_at  DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## HTTP 端点完整实现

### Java Spring Boot

```java
import com.alipay.api.internal.util.AlipaySignature;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@RestController
public class AlipayNotifyController {

    private static final Logger log = LoggerFactory.getLogger(AlipayNotifyController.class);

    @Value("${alipay.public-key}") // 支付宝公钥（非应用公钥）
    private String alipayPublicKey;

    @Value("${alipay.app-id}")
    private String appId;

    private final OrderService orderService; // 注入业务 Service

    public AlipayNotifyController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping(value = "/api/alipay/notify", produces = MediaType.TEXT_PLAIN_VALUE)
    public String handleNotify(HttpServletRequest request) {
        // 1. 收集所有 POST 参数
        Map<String, String> params = new HashMap<>();
        Map<String, String[]> requestParams = request.getParameterMap();
        for (Map.Entry<String, String[]> entry : requestParams.entrySet()) {
            String[] values = entry.getValue();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < values.length; i++) {
                if (i > 0) sb.append(",");
                sb.append(values[i]);
            }
            params.put(entry.getKey(), sb.toString());
        }

        // 2. 记录原始通知日志（排查用）
        log.info("[AlipayNotify] 收到通知: out_trade_no={}, trade_status={}, trade_no={}",
                params.get("out_trade_no"), params.get("trade_status"), params.get("trade_no"));

        try {
            // 3. 验签
            boolean signVerified = AlipaySignature.rsaCheckV1(
                    params, alipayPublicKey, "utf-8", "RSA2");
            if (!signVerified) {
                log.warn("[AlipayNotify] 验签失败: out_trade_no={}", params.get("out_trade_no"));
                return "failure";
            }

            // 4. 业务校验
            String outTradeNo = params.get("out_trade_no");
            String tradeStatus = params.get("trade_status");
            String totalAmount = params.get("total_amount");
            String tradeNo = params.get("trade_no");
            String notifyAppId = params.get("app_id");

            // 校验 app_id
            if (!appId.equals(notifyAppId)) {
                log.warn("[AlipayNotify] app_id 不匹配: expected={}, actual={}", appId, notifyAppId);
                return "failure";
            }

            // 校验订单存在且金额一致
            Order order = orderService.findByOutTradeNo(outTradeNo);
            if (order == null) {
                log.warn("[AlipayNotify] 订单不存在: {}", outTradeNo);
                return "success"; // 订单不存在也返回 success，避免无限重试
            }
            if (new BigDecimal(totalAmount).compareTo(order.getAmount()) != 0) {
                log.warn("[AlipayNotify] 金额不匹配: notify={}, local={}", totalAmount, order.getAmount());
                return "failure";
            }

            // 5. 判断是退款通知还是支付通知
            String gmtRefund = params.get("gmt_refund");
            if (gmtRefund != null && !gmtRefund.isEmpty()) {
                // 退款通知
                handleRefundNotify(params, order);
            } else if ("TRADE_SUCCESS".equals(tradeStatus)) {
                // 支付成功通知
                handlePaymentSuccess(outTradeNo, tradeNo, order);
            } else if ("TRADE_FINISHED".equals(tradeStatus)) {
                // 交易完结（退款窗口关闭），按需处理
                log.info("[AlipayNotify] 交易完结: {}", outTradeNo);
            }

            return "success";

        } catch (Exception e) {
            log.error("[AlipayNotify] 处理异常: {}", e.getMessage(), e);
            return "failure"; // 返回 failure 触发重试
        }
    }

    private void handlePaymentSuccess(String outTradeNo, String tradeNo, Order order) {
        // 幂等：已支付则跳过
        if (order.isPaid()) {
            log.info("[AlipayNotify] 订单已处理，跳过: {}", outTradeNo);
            return;
        }
        // 更新订单状态（Service 层使用乐观锁或 DB 唯一约束防并发）
        orderService.markAsPaid(outTradeNo, tradeNo);
        // 异步执行后续业务（发货、开通权益等）-- 建议投递消息队列
        // messageQueue.send(new PaymentSuccessEvent(outTradeNo, tradeNo));
    }

    private void handleRefundNotify(Map<String, String> params, Order order) {
        String outBizNo = params.get("out_biz_no");
        String refundFee = params.get("refund_fee");
        log.info("[AlipayNotify] 退款通知: out_biz_no={}, refund_fee={}", outBizNo, refundFee);
        // 幂等：检查退款记录是否已存在
        orderService.processRefundNotify(order.getOutTradeNo(), outBizNo, refundFee);
    }
}
```

### Python FastAPI

```python
import logging
from decimal import Decimal
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

app = FastAPI()
logger = logging.getLogger("alipay_notify")

# 配置项（实际从环境变量或配置文件加载）
ALIPAY_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...
-----END PUBLIC KEY-----"""
APP_ID = "2021000000000000"


@app.post("/api/alipay/notify", response_class=PlainTextResponse)
async def alipay_notify(request: Request):
    # 1. 解析 form 参数
    form_data = await request.form()
    params: dict[str, str] = {k: v for k, v in form_data.items() if isinstance(v, str)}

    logger.info(
        "收到通知: out_trade_no=%s, trade_status=%s, trade_no=%s",
        params.get("out_trade_no"), params.get("trade_status"), params.get("trade_no"),
    )

    # 2. 验签
    if not verify_alipay_notification(params, ALIPAY_PUBLIC_KEY):
        logger.warning("验签失败: out_trade_no=%s", params.get("out_trade_no"))
        return PlainTextResponse("failure")

    # 3. 业务校验
    out_trade_no = params.get("out_trade_no", "")
    trade_status = params.get("trade_status", "")
    total_amount = params.get("total_amount", "0")
    trade_no = params.get("trade_no", "")
    notify_app_id = params.get("app_id", "")

    if notify_app_id != APP_ID:
        logger.warning("app_id 不匹配: expected=%s, actual=%s", APP_ID, notify_app_id)
        return PlainTextResponse("failure")

    order = await order_service.find_by_out_trade_no(out_trade_no)
    if order is None:
        logger.warning("订单不存在: %s", out_trade_no)
        return PlainTextResponse("success")  # 避免无限重试

    if Decimal(total_amount) != order.amount:
        logger.warning("金额不匹配: notify=%s, local=%s", total_amount, order.amount)
        return PlainTextResponse("failure")

    # 4. 区分支付通知与退款通知
    gmt_refund = params.get("gmt_refund")
    if gmt_refund:
        # 退款通知
        out_biz_no = params.get("out_biz_no", "")
        refund_fee = params.get("refund_fee", "0")
        await order_service.process_refund_notify(out_trade_no, out_biz_no, refund_fee)
    elif trade_status == "TRADE_SUCCESS":
        # 支付成功 -- 幂等检查
        if not order.is_paid:
            await order_service.mark_as_paid(out_trade_no, trade_no)
            # await message_queue.send(PaymentSuccessEvent(out_trade_no, trade_no))
    elif trade_status == "TRADE_FINISHED":
        logger.info("交易完结: %s", out_trade_no)

    return PlainTextResponse("success")
```

## 最佳实践

### 快速响应，异步处理

通知端点应在 **5 秒内** 返回 `success`。耗时的业务逻辑（发货、通知用户、同步第三方系统）应通过消息队列异步执行：

```
通知端点: 验签 → 校验 → 更新 DB 订单状态 → 返回 success（< 1s）
消息消费者: 发货 / 开通权益 / 发送短信 / 同步 ERP（异步）
```

### 日志规范

- 记录**完整通知参数**（脱敏 buyer_id），保留至少 90 天
- 记录验签结果、业务校验结果、最终处理结果
- 使用 `out_trade_no` 作为日志关联 ID，便于全链路追踪

### 监控告警

- 验签失败率 > 1% 告警（可能被攻击或密钥配置错误）
- 通知处理超时 > 3s 告警
- 同一 out_trade_no 的通知次数 > 3 次告警（可能响应格式有误）

## 常见陷阱

### 1. 响应内容不是纯文本 success

支付宝只认响应体为精确的 7 个字符 `success`。常见错误写法：
- `"success"` 带引号
- `{"code": "success"}` JSON 格式
- `<html>success</html>` 包裹在 HTML 中
- `success\n` 尾部有换行符
- Spring Boot 默认返回 JSON -- 必须设置 `produces = MediaType.TEXT_PLAIN_VALUE`

### 2. 用应用公钥而非支付宝公钥验签

支付宝开放平台有两个公钥：**应用公钥**（你上传给支付宝的）和**支付宝公钥**（支付宝生成返还给你的）。验签必须使用**支付宝公钥**。使用应用公钥验签 100% 失败。

### 3. fund_bill_list 被 HTML 转义导致验签失败

TRADE_SUCCESS 通知中的 `fund_bill_list` 参数值包含 JSON，其中的双引号可能被 Web 框架/过滤器转义为 `&quot;`。如果框架层自动做了 HTML 转义，验签时待签字符串与支付宝生成签名时的原始字符串不一致，导致失败。解决方案：确保获取参数时拿到的是**原始值**，关闭框架的自动转义过滤器，或在验签前将 `&quot;` 还原为 `"`。

### 4. 未做幂等，重复发货

支付宝通知有重试机制，同一笔支付可能收到多次 TRADE_SUCCESS 通知。如果不做幂等检查（如 DB 唯一约束 + 状态判断），会导致重复发货或重复赠送权益。

### 5. 只处理 TRADE_SUCCESS 忘记返回 success

即使收到 `TRADE_FINISHED` 或 `TRADE_CLOSED` 等当前不需要处理的状态，也必须返回 `success`。否则支付宝会持续重试，占用服务器资源。正确做法：验签通过后，无论 trade_status 是什么值，处理完业务逻辑后统一返回 `success`。

### 6. 验签时参数值做了 URL Decode

支付宝 POST 过来的参数已经是解码后的值。如果再做一次 URL Decode，会导致部分参数值被错误解码（如 `passback_params` 中包含 `%` 字符时），待签字符串改变导致验签失败。Java 的 `request.getParameter()` 已自动解码，无需手动处理。

### 7. 异步通知地址带查询参数

`notify_url` 设置为 `https://example.com/notify?extra=123` 时，支付宝可能截断或拼接参数出错。`notify_url` 应为纯净路径，额外信息通过下单时的 `passback_params` 传递。

### 8. 退款通知不可靠未做主动查询

全额退款后支付宝**不保证**发送异步通知（部分退款则会通知）。如果业务依赖退款通知更新状态，可能出现退款成功但本地状态未更新的情况。建议：退款接口同步返回成功后即更新本地状态，异步通知作为补充校验；或定时调用 `alipay.trade.fastpay.refund.query` 主动查询。

### 9. 本地订单不存在时返回 failure

如果商户系统中找不到 `out_trade_no` 对应的订单，应返回 `success` 而非 `failure`。返回 `failure` 会导致支付宝持续重试一个永远找不到订单的通知。可能原因：测试环境残留数据、订单已被清理。记录日志并返回 `success` 即可。

## 组合提示

| 场景 | 相关 Skill |
|------|-----------|
| 首次接入：应用创建、密钥配置、SDK 初始化 | `alipay-onboarding` |
| 发起支付下单（APP/WAP/PC/当面付） | `alipay-apis` |
| 支付网关架构（订单状态机、幂等设计、多渠道抽象） | `payment-gateway` |
| 支付安全（密钥管理、防重放、风控） | `payment-security` |
| 对账与差错处理 | `payment-reconciliation` |
| 微信支付回调处理（对比参考） | `wechat-pay-notifications` |
