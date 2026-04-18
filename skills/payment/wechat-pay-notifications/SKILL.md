---
name: wechat-pay-notifications
description: "微信支付回调通知：签名验证、AES-256-GCM 资源解密、支付/退款通知处理、HTTP 端点实现。"
tech_stack: [payment, wechat-pay, backend]
language: [java, python]
capability: [payment-gateway, encryption]
---

# 微信支付回调通知处理（V3）

> 来源：https://pay.weixin.qq.com/doc/v3/merchant/4012791861  
> 解密：https://pay.weixin.qq.com/doc/v3/merchant/4012071382  
> SDK(Java)：https://github.com/wechatpay-apiv3/wechatpay-java  
> SDK(Python)：https://github.com/minibear2021/wechatpayv3

## 用途

接收微信支付 V3 异步回调通知（支付成功/退款结果），完成签名验证、AES-256-GCM 解密、幂等业务处理并正确响应。

## 何时使用

- 接收用户支付成功通知，更新订单状态、发货/开通权益
- 接收退款结果通知（成功/异常/关闭），更新退款记录
- 所有微信支付产品（JSAPI/APP/Native/H5/小程序）共用同一通知处理流程

---

## 通知机制概览

用户支付成功（或退款状态变更）后，微信支付以 **POST JSON** 向下单时传入的 `notify_url` 发送通知。

**重试策略**：商户未返回 HTTP 200/204 时，按 `15s/15s/30s/3m/10m/20m/30m/30m/30m/60m/3h/3h/3h/6h/6h` 间隔重试，共 15 次，总计约 24 小时。

**响应规范**：成功返回 HTTP 200/204（body 可选）；失败返回 HTTP 4xx/5xx + `{"code":"FAIL","message":"原因"}`。

---

## 通知报文结构

```json
{
  "id": "EV-2018022511223320873",
  "create_time": "2024-01-01T12:00:00+08:00",
  "event_type": "TRANSACTION.SUCCESS",
  "resource_type": "encrypt-resource",
  "resource": {
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "Base64密文...",
    "nonce": "fdasflkja484w",
    "associated_data": "transaction"
  }
}
```

`resource.ciphertext` 是 AES-256-GCM 加密的业务数据，解密后才能获得支付/退款结果。

---

## 签名验证

微信支付通知携带 4 个签名 HTTP 头：`Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Signature`、`Wechatpay-Serial`。

**验签串构造**（每行末尾含 `\n`）：
```
{Wechatpay-Timestamp}\n{Wechatpay-Nonce}\n{请求体JSON原文}\n
```

用 `Wechatpay-Serial` 匹配平台证书公钥，对验签串执行 **SHA256withRSA** 验签。

Java 推荐使用官方 SDK `NotificationParser` 自动完成验签（见完整端点示例）。Python 手动验签：

```python
import base64
from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.x509 import load_pem_x509_certificate

def verify_signature(timestamp: str, nonce: str, body: str,
                     signature: str, cert_pem: bytes) -> bool:
    sign_str = f"{timestamp}\n{nonce}\n{body}\n"
    public_key = load_pem_x509_certificate(cert_pem).public_key()
    try:
        public_key.verify(
            base64.b64decode(signature),
            sign_str.encode("utf-8"), PKCS1v15(), SHA256())
        return True
    except Exception:
        return False
```

---

## AES-256-GCM 资源解密（核心）

这是 V3 对接中**最容易出错**的环节。

| 参数 | 来源 | 说明 |
|------|------|------|
| key | 商户 **APIv3 密钥** | 必须恰好 32 字节 |
| nonce | `resource.nonce` | 12 字节 IV |
| aad | `resource.associated_data` | 附加认证数据，可能为空串 |
| ciphertext | `resource.ciphertext` | Base64 编码，解码后含密文+16字节tag |

### Java 实现

```java
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class AesGcmDecryptor {
    public static String decrypt(String apiV3Key, String nonce,
                                 String associatedData, String ciphertext)
            throws Exception {
        byte[] data = Base64.getDecoder().decode(ciphertext);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,
            new SecretKeySpec(apiV3Key.getBytes(StandardCharsets.UTF_8), "AES"),
            new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8)));
        if (associatedData != null) {
            cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));
        }
        return new String(cipher.doFinal(data), StandardCharsets.UTF_8);
    }
}
```

### Python 实现

```python
import base64, json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_resource(api_v3_key: str, nonce: str,
                     associated_data: str, ciphertext: str) -> dict:
    """解密后返回业务数据字典"""
    aesgcm = AESGCM(api_v3_key.encode("utf-8"))
    plaintext = aesgcm.decrypt(
        nonce.encode("utf-8"),
        base64.b64decode(ciphertext),
        (associated_data or "").encode("utf-8"))
    return json.loads(plaintext.decode("utf-8"))
```

依赖：`pip install cryptography`

---

## 支付成功通知

`event_type: "TRANSACTION.SUCCESS"`，解密后关键字段：

| 字段 | 说明 |
|------|------|
| `out_trade_no` | 商户订单号 |
| `transaction_id` | 微信支付订单号 |
| `trade_state` | 交易状态（见下表） |
| `trade_type` | JSAPI / NATIVE / APP / MWEB |
| `amount.total` | 订单总金额（分） |
| `amount.payer_total` | 用户实际支付金额（分），有优惠时与 total 不同 |
| `payer.openid` | 支付者 openid |
| `success_time` | 支付完成时间（RFC3339） |
| `attach` | 下单时传入的自定义数据，原样返回 |

**trade_state 枚举**：`SUCCESS`（成功）、`REFUND`（转入退款）、`NOTPAY`（未支付）、`CLOSED`（已关闭）、`REVOKED`（已撤销，仅付款码）、`USERPAYING`（支付中，仅付款码）、`PAYERROR`（支付失败，仅付款码）

**幂等处理**：用 `out_trade_no` 作幂等键，处理前查库判断是否已支付；使用数据库唯一索引+状态机更新防并发重复。

---

## 退款通知

| event_type | 含义 |
|------------|------|
| `REFUND.SUCCESS` | 退款成功 |
| `REFUND.ABNORMAL` | 退款异常（银行卡注销/冻结等） |
| `REFUND.CLOSED` | 退款关闭 |

解密后关键字段：

| 字段 | 说明 |
|------|------|
| `refund_id` | 微信退款单号 |
| `out_refund_no` | 商户退款单号 |
| `transaction_id` / `out_trade_no` | 原支付订单号 |
| `refund_status` | SUCCESS / CLOSED / ABNORMAL |
| `amount.total` | 原订单金额（分） |
| `amount.refund` | 退款金额（分） |
| `amount.payer_refund` | 用户实际退款金额（分） |
| `user_received_account` | 退款入账账户（如"招商银行信用卡0403"） |

---

## HTTP 端点完整实现

### Java Spring Boot（使用官方 SDK）

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.github.wechatpay-apiv3</groupId>
    <artifactId>wechatpay-java</artifactId>
    <version>0.2.14</version>
</dependency>
```

```java
// --- 配置 Bean ---
@Configuration
public class WechatPayConfig {
    @Bean
    public NotificationParser notificationParser(
            @Value("${wechat.pay.merchant-id}") String merchantId,
            @Value("${wechat.pay.private-key-path}") String keyPath,
            @Value("${wechat.pay.merchant-serial-number}") String serial,
            @Value("${wechat.pay.api-v3-key}") String apiV3Key) {
        NotificationConfig config = new RSAAutoCertificateConfig.Builder()
                .merchantId(merchantId).privateKeyFromPath(keyPath)
                .merchantSerialNumber(serial).apiV3Key(apiV3Key).build();
        return new NotificationParser(config);
    }
}

// --- Controller ---
@RestController
@RequestMapping("/api/wechat-pay")
public class WechatPayNotifyController {
    private final NotificationParser parser;
    private final OrderService orderService;
    private final RefundService refundService;
    // 构造器注入省略

    @PostMapping("/notify/pay")
    public ResponseEntity<Map<String, String>> payNotify(
            @RequestBody String body,
            @RequestHeader("Wechatpay-Timestamp") String timestamp,
            @RequestHeader("Wechatpay-Nonce") String nonce,
            @RequestHeader("Wechatpay-Signature") String signature,
            @RequestHeader("Wechatpay-Serial") String serial) {
        try {
            RequestParam param = new RequestParam.Builder()
                .serialNumber(serial).nonce(nonce).signature(signature)
                .timestamp(timestamp).body(body).build();
            // SDK 内部完成验签+解密
            Transaction tx = parser.parse(param, Transaction.class);
            if (tx.getTradeState() == Transaction.TradeStateEnum.SUCCESS) {
                orderService.handlePaymentSuccess(
                    tx.getOutTradeNo(), tx.getTransactionId(),
                    tx.getAmount().getPayerTotal());
            }
            return ResponseEntity.ok(Map.of("code","SUCCESS","message","OK"));
        } catch (ValidationException e) {
            return ResponseEntity.status(401)
                .body(Map.of("code","FAIL","message","验签失败"));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                .body(Map.of("code","FAIL","message",e.getMessage()));
        }
    }

    @PostMapping("/notify/refund")
    public ResponseEntity<Map<String, String>> refundNotify(
            @RequestBody String body,
            @RequestHeader("Wechatpay-Timestamp") String timestamp,
            @RequestHeader("Wechatpay-Nonce") String nonce,
            @RequestHeader("Wechatpay-Signature") String signature,
            @RequestHeader("Wechatpay-Serial") String serial) {
        try {
            RequestParam param = new RequestParam.Builder()
                .serialNumber(serial).nonce(nonce).signature(signature)
                .timestamp(timestamp).body(body).build();
            RefundNotification r = parser.parse(param, RefundNotification.class);
            switch (r.getRefundStatus()) {
                case SUCCESS  -> refundService.handleSuccess(r.getOutRefundNo());
                case ABNORMAL -> refundService.handleAbnormal(r.getOutRefundNo());
                case CLOSED   -> refundService.handleClosed(r.getOutRefundNo());
            }
            return ResponseEntity.ok(Map.of("code","SUCCESS","message","OK"));
        } catch (ValidationException e) {
            return ResponseEntity.status(401)
                .body(Map.of("code","FAIL","message","验签失败"));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                .body(Map.of("code","FAIL","message",e.getMessage()));
        }
    }
}
```

### Python FastAPI

```python
import base64, json, logging
from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.x509 import load_pem_x509_certificate
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
logger = logging.getLogger(__name__)

API_V3_KEY = "your-32-byte-apiv3-key-here!!!!!"   # 恰好 32 字节
CERT_PEM = open("wechatpay_cert.pem", "rb").read() # 平台证书，需支持轮换

def _verify(ts: str, nonce: str, body: str, sig: str) -> bool:
    pub = load_pem_x509_certificate(CERT_PEM).public_key()
    try:
        pub.verify(base64.b64decode(sig),
                   f"{ts}\n{nonce}\n{body}\n".encode(), PKCS1v15(), SHA256())
        return True
    except Exception:
        return False

def _decrypt(resource: dict) -> dict:
    aesgcm = AESGCM(API_V3_KEY.encode())
    pt = aesgcm.decrypt(
        resource["nonce"].encode(),
        base64.b64decode(resource["ciphertext"]),
        resource.get("associated_data", "").encode())
    return json.loads(pt)

async def _parse_notify(request: Request) -> tuple[dict | None, JSONResponse | None]:
    """公共逻辑：验签 + 解密，返回 (明文dict, 错误响应)"""
    body = (await request.body()).decode("utf-8")
    if not _verify(request.headers.get("Wechatpay-Timestamp", ""),
                   request.headers.get("Wechatpay-Nonce", ""),
                   body, request.headers.get("Wechatpay-Signature", "")):
        return None, JSONResponse(401, {"code":"FAIL","message":"验签失败"})
    try:
        result = _decrypt(json.loads(body)["resource"])
        return result, None
    except Exception as e:
        logger.exception("解密失败")
        return None, JSONResponse(500, {"code":"FAIL","message":str(e)})

OK = JSONResponse(200, {"code": "SUCCESS", "message": "OK"})

@app.post("/api/wechat-pay/notify/pay")
async def pay_notify(request: Request):
    result, err = await _parse_notify(request)
    if err: return err
    if result.get("trade_state") == "SUCCESS":
        logger.info("支付成功: %s / %s / %s分",
            result["out_trade_no"], result["transaction_id"],
            result.get("amount",{}).get("payer_total"))
        # TODO: 幂等更新订单状态
    return OK

@app.post("/api/wechat-pay/notify/refund")
async def refund_notify(request: Request):
    result, err = await _parse_notify(request)
    if err: return err
    status = result.get("refund_status")
    logger.info("退款通知: %s, status=%s", result.get("out_refund_no"), status)
    # TODO: 根据 status 幂等更新退款记录
    return OK
```

依赖：`pip install fastapi uvicorn cryptography`

---

## 常见陷阱

1. **APIv3 密钥长度错误**：必须恰好 32 字节（非 API 密钥、非商户密钥），在商户平台"API安全"页面设置。长度错误直接导致 AES-GCM 解密异常。

2. **平台证书轮换导致验签失败**：微信支付定期更换平台证书。`Wechatpay-Serial` 标识证书序列号，商户只缓存一张旧证书时新通知将验签失败。用官方 SDK 的 `RSAAutoCertificateConfig` 自动更新，或定时调用证书下载接口。

3. **请求体被框架篡改**：验签必须用 HTTP 原始 body。Spring Boot 用 `@RequestBody String`；不能用 `@RequestBody Map` 再序列化。Python FastAPI 用 `await request.body()`。PHP 用 `file_get_contents('php://input')`。

4. **响应异常引发重试风暴**：微信只认 HTTP 200/204 为成功。业务处理成功但后续操作抛异常返回 500，将触发 15 次重试。务必先响应 200 再异步处理耗时业务。

5. **未做幂等导致重复发货**：重试机制下同一通知会多次到达。基于 `out_trade_no` / `out_refund_no` 做幂等校验，推荐数据库唯一索引+状态机。

6. **associated_data 空串 vs null**：解密时 AAD 可能是空字符串 `""`，但不能传 `null`（Go/Java 中 null AAD 行为不同）。Python 传 `b""` 安全。

7. **notify_url 不可带查询参数**：微信要求 `notify_url` 不含 `?key=value`。自定义数据用下单接口的 `attach` 字段传递。

8. **5 秒超时限制**：微信要求 5 秒内响应。耗时逻辑（发货/发短信）先入消息队列异步处理。

9. **回调端点必须 HTTPS**：`notify_url` 必须 HTTPS，不能内网地址。开发环境用 ngrok 等穿透工具。

10. **时间格式解析**：`success_time` 是 RFC3339（如 `2024-01-01T12:00:00+08:00`）。Java 用 `OffsetDateTime.parse()`，Python 用 `datetime.fromisoformat()`。

---

## 组合提示

- **`wechat-pay-apis`**：下单接口传入 `notify_url`，支付完成后走本 skill 通知流程
- **`wechat-pay-onboarding`**：入驻时获取的 APIv3 密钥、商户证书是通知处理的前置依赖
- **`payment-security`**：签名验证、密钥管理、防重放等安全实践
- **`payment-resilience`**：超时重试、幂等、消息队列异步处理等可靠性模式
- **`payment-reconciliation`**：通知可能丢失/延迟，需配合定时对账补齐状态
