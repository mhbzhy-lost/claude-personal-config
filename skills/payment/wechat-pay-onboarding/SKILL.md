---
name: wechat-pay-onboarding
description: "微信支付 V3 接入：商户配置四要素、APIv3 签名机制、平台证书管理、SDK 初始化（Java/Python）。"
tech_stack: [payment, wechat-pay, backend]
language: [java, python]
---

# 微信支付 APIv3 接入指南

> 来源：<https://pay.weixin.qq.com/doc/v3/merchant/4012081606> | <https://github.com/wechatpay-apiv3/wechatpay-java> | <https://pypi.org/project/wechatpayv3/>
> 基准版本：wechatpay-java 0.2.17 / wechatpayv3 (Python) 2.0.2 -- 截至 2026-04

## 用途

覆盖微信支付 APIv3 从零接入的完整流程：商户四要素配置、签名机制原理与实现、平台证书/公钥管理、Java 和 Python 官方 SDK 初始化、应用配置与测试方案。目标是让开发者完成阅读后能正确初始化 SDK 并发起第一笔支付请求。

## 何时使用

- 首次接入微信支付，需要理解商户号、证书、密钥的完整配置流程
- 排查"签名校验失败"、"证书序列号不匹配"等接入期高频错误
- 从 APIv2（MD5/HMAC-SHA256）迁移到 APIv3（SHA256-RSA2048）
- 需要手动实现签名/验签（不使用官方 SDK 的场景）
- 搭建多商户支付网关，需理解证书管理与轮换机制

---

## 版本与 SDK

### 官方 Java SDK -- wechatpay-java

| 项目 | 值 |
|------|-----|
| 仓库 | <https://github.com/wechatpay-apiv3/wechatpay-java> |
| 最新版本 | **0.2.17**（2025-04 发布） |
| JDK 要求 | Java 8+ |
| 主要能力 | 请求签名、应答验签、平台证书自动更新、回调通知解密、敏感信息加解密 |

Maven 坐标：

```xml
<dependency>
    <groupId>com.github.wechatpay-apiv3</groupId>
    <artifactId>wechatpay-java</artifactId>
    <version>0.2.17</version>
</dependency>
```

Gradle：

```groovy
implementation 'com.github.wechatpay-apiv3:wechatpay-java:0.2.17'
```

### Python SDK -- wechatpayv3

| 项目 | 值 |
|------|-----|
| 仓库 | <https://github.com/minibear2021/wechatpayv3> |
| 最新版本 | **2.0.2**（2026-02-28 发布） |
| Python 要求 | Python 3.6+ |
| 主要能力 | 请求签名、应答验签、平台证书自动更新、回调报文解密、异步支持 |

```bash
pip install wechatpayv3==2.0.2
```

> **说明**：wechatpayv3 是社区维护的 Python SDK（非官方），但 API 覆盖完整，质量稳定。微信支付官方仅提供 Java、Go、PHP 三种语言的 SDK。

---

## 商户配置四要素

接入微信支付 APIv3 需要准备四个核心凭证，缺一不可：

| # | 要素 | 说明 | 获取位置 |
|---|------|------|---------|
| 1 | **商户号 (mchid)** | 10 位数字，如 `1900000109` | 微信商户平台首页右上角 |
| 2 | **商户证书序列号** | 40 位十六进制，如 `5157F09EFDC096DE15EBE81A47057A7200000000` | 商户平台 -> 账户中心 -> API安全 -> 商户API证书 -> 查看证书 |
| 3 | **商户 API 私钥** | RSA 2048 位私钥，文件名 `apiclient_key.pem` | 申请商户 API 证书时由证书工具生成，保存在本地 |
| 4 | **APIv3 密钥** | 32 字节字符串（256 位），用于 AES-256-GCM 解密 | 商户平台 -> 账户中心 -> API安全 -> APIv3 密钥 -> 设置 |

### 获取步骤

#### 1. 商户号 (mchid)

登录 [微信商户平台](https://pay.weixin.qq.com)，首页右上角即可看到 10 位数字商户号。

#### 2. 商户 API 证书与私钥

```
商户平台 -> 账户中心 -> API安全 -> 申请API证书
```

申请流程会使用"微信支付证书工具"在本地生成密钥对：
- `apiclient_key.pem` -- 商户 API **私钥**（核心机密，不可泄露、不可上传）
- `apiclient_cert.pem` -- 商户 API **证书**（包含公钥和证书序列号）

查看证书序列号的方式：

```bash
# 方式一：openssl 命令
openssl x509 -in apiclient_cert.pem -noout -serial
# 输出示例：serial=5157F09EFDC096DE15EBE81A47057A7200000000

# 方式二：商户平台在线查看
# 账户中心 -> API安全 -> API证书 -> 查看证书
```

#### 3. APIv3 密钥

```
商户平台 -> 账户中心 -> API安全 -> APIv3密钥 -> 设置
```

设置一个 **恰好 32 字节**的字符串（仅支持 ASCII 字母和数字）。此密钥用于解密平台证书和回调通知报文。

> **注意**：APIv3 密钥与 APIv2 的 API 密钥（`key`）是两套独立的密钥，互不通用。

---

## APIv3 签名机制

### 概述

微信支付 APIv3 使用 **SHA256-RSA2048** 非对称签名方案：
- **请求签名**：商户用自己的 API 私钥签名，微信支付用商户证书中的公钥验签
- **应答验签**：微信支付用平台私钥签名，商户用平台证书/公钥验签

### Step 1: 构造签名串

签名串共 **五行**，每行以 `\n`（0x0A）结尾，**包括最后一行**：

```
HTTP请求方法\n
URL\n
请求时间戳\n
请求随机串\n
请求报文主体\n
```

各字段说明：

| 行 | 字段 | 规则 |
|----|------|------|
| 1 | HTTP 请求方法 | 大写，如 `GET`、`POST`、`PUT`、`DELETE` |
| 2 | URL | 请求的**绝对路径**（不含域名），如 `/v3/pay/transactions/jsapi`；含查询参数时带 `?` 后缀 |
| 3 | 时间戳 | Unix 时间戳（秒），如 `1554208460` |
| 4 | 随机串 | 32 位随机字符串（大小写字母+数字） |
| 5 | 请求报文主体 | POST/PUT 时为 JSON 请求体原文；GET/DELETE 时为**空字符串** |

#### 构造示例

```
POST\n
/v3/pay/transactions/jsapi\n
1554208460\n
593BEC0C930BF1AFEB40B4A08C8FB242\n
{"appid":"wx8888","mchid":"1900000109","description":"测试","out_trade_no":"1217752501201407033233368018","notify_url":"https://example.com/notify","amount":{"total":1}}\n
```

### Step 2: 计算签名值

使用商户 API 私钥对签名串进行 **SHA256withRSA** 签名，并对签名结果进行 **Base64** 编码。

#### Java 实现

```java
import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.Base64;

/**
 * 计算微信支付 APIv3 请求签名
 *
 * @param method      HTTP 方法（GET/POST/PUT/DELETE）
 * @param url         请求路径（如 /v3/pay/transactions/jsapi）
 * @param timestamp   Unix 时间戳（秒）
 * @param nonceStr    32 位随机字符串
 * @param body        请求体 JSON（GET/DELETE 传空字符串）
 * @param privateKey  商户 API 私钥
 * @return Base64 编码的签名值
 */
public static String sign(String method, String url, long timestamp,
                          String nonceStr, String body, PrivateKey privateKey)
        throws Exception {
    // Step 1: 构造签名串（五行，每行以 \n 结尾）
    String message = method + "\n"
            + url + "\n"
            + timestamp + "\n"
            + nonceStr + "\n"
            + body + "\n";

    // Step 2: SHA256withRSA 签名
    Signature sign = Signature.getInstance("SHA256withRSA");
    sign.initSign(privateKey);
    sign.update(message.getBytes(StandardCharsets.UTF_8));

    // Step 3: Base64 编码
    return Base64.getEncoder().encodeToString(sign.sign());
}
```

#### Python 实现

```python
import time
import string
import random
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

def sign_request(method: str, url: str, body: str, private_key_pem: str) -> tuple:
    """
    计算微信支付 APIv3 请求签名。

    Args:
        method: HTTP 方法（GET/POST/PUT/DELETE）
        url: 请求路径（如 /v3/pay/transactions/jsapi）
        body: 请求体 JSON（GET/DELETE 传空字符串 ""）
        private_key_pem: PEM 格式的商户 API 私钥字符串

    Returns:
        (timestamp, nonce_str, signature) 三元组
    """
    import base64

    # 生成时间戳和随机串
    timestamp = str(int(time.time()))
    nonce_str = ''.join(random.choices(
        string.ascii_letters + string.digits, k=32))

    # Step 1: 构造签名串（五行，每行以 \n 结尾）
    message = f"{method}\n{url}\n{timestamp}\n{nonce_str}\n{body}\n"

    # Step 2: 加载私钥并签名
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode('utf-8'), password=None)
    signature_bytes = private_key.sign(
        message.encode('utf-8'),
        padding.PKCS1v15(),
        hashes.SHA256()
    )

    # Step 3: Base64 编码
    signature = base64.b64encode(signature_bytes).decode('utf-8')
    return timestamp, nonce_str, signature
```

### Step 3: 设置 Authorization 请求头

格式为 `WECHATPAY2-SHA256-RSA2048` 认证类型 + 五个字段：

```
Authorization: WECHATPAY2-SHA256-RSA2048 mchid="商户号",nonce_str="随机串",timestamp="时间戳",serial_no="商户证书序列号",signature="签名值"
```

#### 完整示例

```
Authorization: WECHATPAY2-SHA256-RSA2048 mchid="1900000109",nonce_str="593BEC0C930BF1AFEB40B4A08C8FB242",timestamp="1554208460",serial_no="5157F09EFDC096DE15EBE81A47057A7200000000",signature="JjkSPFVWpTFXqOQ3KjHyPF+h..."
```

#### Java 拼装代码

```java
/**
 * 构造 Authorization 请求头
 */
public static String buildAuthorization(String mchid, String serialNo,
                                        String nonceStr, long timestamp,
                                        String signature) {
    return "WECHATPAY2-SHA256-RSA2048 "
            + "mchid=\"" + mchid + "\","
            + "nonce_str=\"" + nonceStr + "\","
            + "timestamp=\"" + timestamp + "\","
            + "serial_no=\"" + serialNo + "\","
            + "signature=\"" + signature + "\"";
}
```

#### Python 拼装代码

```python
def build_authorization(mchid: str, serial_no: str,
                        nonce_str: str, timestamp: str,
                        signature: str) -> str:
    """构造 Authorization 请求头"""
    return (
        f'WECHATPAY2-SHA256-RSA2048 '
        f'mchid="{mchid}",'
        f'nonce_str="{nonce_str}",'
        f'timestamp="{timestamp}",'
        f'serial_no="{serial_no}",'
        f'signature="{signature}"'
    )
```

---

## 应答签名验证

微信支付的应答和回调通知均携带签名信息，商户**必须验签**后才能信任数据。

### 应答头中的签名字段

| HTTP 头 | 说明 |
|---------|------|
| `Wechatpay-Timestamp` | 应答时间戳（秒） |
| `Wechatpay-Nonce` | 应答随机串 |
| `Wechatpay-Signature` | Base64 编码的签名值 |
| `Wechatpay-Serial` | 微信支付平台证书序列号（用于匹配验签公钥） |

### 验签步骤

1. **检查证书序列号**：用 `Wechatpay-Serial` 值匹配本地缓存的平台证书；不匹配则重新下载证书
2. **构造验签串**（三行，每行以 `\n` 结尾）：

```
应答时间戳\n
应答随机串\n
应答报文主体\n
```

3. **Base64 解码** `Wechatpay-Signature` 得到签名字节
4. **用平台证书公钥** 执行 SHA256withRSA 验签

#### Java 验签代码

```java
import java.security.cert.X509Certificate;

/**
 * 验证微信支付应答签名
 *
 * @param timestamp    Wechatpay-Timestamp 头值
 * @param nonce        Wechatpay-Nonce 头值
 * @param body         应答报文主体（JSON 原文）
 * @param signature    Wechatpay-Signature 头值（Base64 编码）
 * @param certificate  匹配 Wechatpay-Serial 的平台证书
 * @return 验签是否通过
 */
public static boolean verifyResponse(String timestamp, String nonce,
                                     String body, String signature,
                                     X509Certificate certificate)
        throws Exception {
    // 构造验签串（三行）
    String message = timestamp + "\n" + nonce + "\n" + body + "\n";

    Signature sign = Signature.getInstance("SHA256withRSA");
    sign.initVerify(certificate.getPublicKey());
    sign.update(message.getBytes(StandardCharsets.UTF_8));

    return sign.verify(Base64.getDecoder().decode(signature));
}
```

#### Python 验签代码

```python
import base64
from cryptography.hazmat.primitives.asymmetric import padding, utils
from cryptography.hazmat.primitives import hashes
from cryptography.x509 import load_pem_x509_certificate

def verify_response(timestamp: str, nonce: str, body: str,
                    signature: str, certificate_pem: str) -> bool:
    """
    验证微信支付应答签名。

    Args:
        timestamp: Wechatpay-Timestamp 头值
        nonce: Wechatpay-Nonce 头值
        body: 应答报文主体 JSON 原文
        signature: Wechatpay-Signature 头值（Base64 编码）
        certificate_pem: PEM 格式平台证书字符串

    Returns:
        验签是否通过
    """
    message = f"{timestamp}\n{nonce}\n{body}\n"
    cert = load_pem_x509_certificate(certificate_pem.encode('utf-8'))
    public_key = cert.public_key()

    try:
        public_key.verify(
            base64.b64decode(signature),
            message.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return True
    except Exception:
        return False
```

> **关键区别**：请求签名串是**五行**（含 HTTP 方法和 URL），应答验签串是**三行**（时间戳、随机串、报文体）。

---

## 平台证书管理

### 为什么需要平台证书

- 平台证书包含微信支付的公钥，用于**验证应答签名**和**回调通知签名**
- 平台证书有效期 5 年，但微信支付会在到期前进行证书轮换
- 必须实现自动更新机制，否则证书过期后所有验签将失败

### /v3/certificates 接口

```
GET https://api.mch.weixin.qq.com/v3/certificates
```

此接口返回当前可用的所有平台证书（可能有多张，用于轮换过渡期）。

应答示例（关键字段）：

```json
{
  "data": [
    {
      "serial_no": "5157F09EFDC096DE15EBE81A47057A7200000000",
      "effective_time": "2024-01-01T00:00:00+08:00",
      "expire_time": "2029-01-01T00:00:00+08:00",
      "encrypt_certificate": {
        "algorithm": "AEAD_AES_256_GCM",
        "nonce": "eabb3e044577",
        "associated_data": "certificate",
        "ciphertext": "加密后的证书内容..."
      }
    }
  ]
}
```

### AES-256-GCM 解密流程

平台证书密文需要使用 **APIv3 密钥** 通过 AES-256-GCM 算法解密：

```
密钥 = APIv3 密钥（32 字节）
IV   = encrypt_certificate.nonce（12 字节）
AAD  = encrypt_certificate.associated_data
密文 = Base64Decode(encrypt_certificate.ciphertext)
明文 = AES-256-GCM-Decrypt(密钥, IV, AAD, 密文)
```

#### Java 解密代码

```java
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

/**
 * 使用 APIv3 密钥解密平台证书或回调通知
 *
 * @param apiV3Key        APIv3 密钥（32 字节字符串）
 * @param nonce           encrypt_certificate.nonce
 * @param associatedData  encrypt_certificate.associated_data
 * @param ciphertext      encrypt_certificate.ciphertext（Base64 编码）
 * @return 解密后的明文（平台证书 PEM 或回调 JSON）
 */
public static String decryptAesGcm(String apiV3Key, String nonce,
                                   String associatedData, String ciphertext)
        throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    SecretKeySpec key = new SecretKeySpec(
            apiV3Key.getBytes(StandardCharsets.UTF_8), "AES");
    GCMParameterSpec spec = new GCMParameterSpec(
            128, nonce.getBytes(StandardCharsets.UTF_8));

    cipher.init(Cipher.DECRYPT_MODE, key, spec);
    cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));

    byte[] decrypted = cipher.doFinal(
            Base64.getDecoder().decode(ciphertext));
    return new String(decrypted, StandardCharsets.UTF_8);
}
```

#### Python 解密代码

```python
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_aes_gcm(api_v3_key: str, nonce: str,
                    associated_data: str, ciphertext: str) -> str:
    """
    使用 APIv3 密钥解密平台证书或回调通知。

    Args:
        api_v3_key: APIv3 密钥（32 字节字符串）
        nonce: encrypt_certificate.nonce
        associated_data: encrypt_certificate.associated_data
        ciphertext: encrypt_certificate.ciphertext（Base64 编码）

    Returns:
        解密后的明文字符串
    """
    key = api_v3_key.encode('utf-8')
    aes_gcm = AESGCM(key)
    decrypted = aes_gcm.decrypt(
        nonce.encode('utf-8'),
        base64.b64decode(ciphertext),
        associated_data.encode('utf-8')
    )
    return decrypted.decode('utf-8')
```

### 证书缓存与自动轮换策略

1. **首次启动**：调用 `/v3/certificates` 下载并解密所有平台证书，存入内存缓存
2. **定时刷新**：每 12 小时（或自定义间隔）重新拉取证书列表
3. **匹配策略**：验签时按 `Wechatpay-Serial` 头匹配证书；未命中时立即触发一次刷新
4. **平滑轮换**：新旧证书共存期间（通常 1-2 周），缓存中同时保留多张证书

> **推荐**：直接使用官方 SDK，它已内置证书自动更新机制，无需手动管理。

---

## 微信支付公钥模式（推荐）

自 2024 年起，微信支付新增了**公钥模式**，商户可直接使用微信支付公钥验签，无需通过 `/v3/certificates` 接口下载平台证书。

获取方式：
```
商户平台 -> 账户中心 -> API安全 -> 微信支付公钥
```

公钥 ID 格式：`PUB_KEY_ID_0114232134912410000000000000`

**优势**：无需定时拉取证书、无需 AES-GCM 解密，配置更简单、运维更少。

---

## SDK 初始化 -- Java

### 方式一：平台证书自动更新模式（RSAAutoCertificateConfig）

适用于大多数场景，SDK 自动管理平台证书的下载、解密、缓存和轮换。

```java
import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.RSAAutoCertificateConfig;
import com.wechat.pay.java.service.payments.jsapi.JsapiService;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayRequest;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayResponse;
import com.wechat.pay.java.service.payments.jsapi.model.Amount;
import com.wechat.pay.java.service.payments.jsapi.model.Payer;

public class WechatPayExample {

    // ===== 商户配置四要素 =====
    private static final String MERCHANT_ID = "1900000109";
    private static final String MERCHANT_SERIAL_NUMBER =
            "5157F09EFDC096DE15EBE81A47057A7200000000";
    private static final String PRIVATE_KEY_PATH =
            "/path/to/apiclient_key.pem";
    private static final String API_V3_KEY = "your_api_v3_key_32bytes_string!";

    public static void main(String[] args) {
        // 1. 构建配置（自动下载和更新平台证书）
        Config config = new RSAAutoCertificateConfig.Builder()
                .merchantId(MERCHANT_ID)
                .privateKeyFromPath(PRIVATE_KEY_PATH)
                .merchantSerialNumber(MERCHANT_SERIAL_NUMBER)
                .apiV3Key(API_V3_KEY)
                .build();

        // 2. 构建服务（以 JSAPI 支付为例）
        JsapiService service = new JsapiService.Builder()
                .config(config)
                .build();

        // 3. 发起预下单请求
        PrepayRequest request = new PrepayRequest();
        request.setAppid("wx8888888888888888");
        request.setMchid(MERCHANT_ID);
        request.setDescription("测试商品");
        request.setOutTradeNo("ORDER_" + System.currentTimeMillis());
        request.setNotifyUrl("https://example.com/notify");

        Amount amount = new Amount();
        amount.setTotal(1); // 单位：分
        request.setAmount(amount);

        Payer payer = new Payer();
        payer.setOpenid("oUpF8uMuAJO_M2pxb1Q9zNjWeS6o");
        request.setPayer(payer);

        PrepayResponse response = service.prepay(request);
        System.out.println("预下单 prepay_id: " + response.getPrepayId());
    }
}
```

### 方式二：微信支付公钥模式（RSAPublicKeyConfig）-- 推荐

适用于新接入商户，无需自动更新平台证书，直接使用微信支付公钥验签。

```java
import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.RSAPublicKeyConfig;

public class WechatPayPublicKeyExample {

    private static final String MERCHANT_ID = "1900000109";
    private static final String MERCHANT_SERIAL_NUMBER =
            "5157F09EFDC096DE15EBE81A47057A7200000000";
    private static final String PRIVATE_KEY_PATH =
            "/path/to/apiclient_key.pem";
    private static final String API_V3_KEY = "your_api_v3_key_32bytes_string!";
    // 微信支付公钥文件路径（从商户平台下载）
    private static final String PUBLIC_KEY_PATH =
            "/path/to/wechatpay_public_key.pem";
    // 微信支付公钥 ID（从商户平台获取）
    private static final String PUBLIC_KEY_ID =
            "PUB_KEY_ID_0114232134912410000000000000";

    public static void main(String[] args) {
        Config config = new RSAPublicKeyConfig.Builder()
                .merchantId(MERCHANT_ID)
                .privateKeyFromPath(PRIVATE_KEY_PATH)
                .publicKeyFromPath(PUBLIC_KEY_PATH)
                .publicKeyId(PUBLIC_KEY_ID)
                .merchantSerialNumber(MERCHANT_SERIAL_NUMBER)
                .apiV3Key(API_V3_KEY)
                .build();

        // 后续使用方式与 RSAAutoCertificateConfig 完全一致
        // JsapiService service = new JsapiService.Builder()
        //         .config(config).build();
    }
}
```

### 回调通知处理（Java）

```java
import com.wechat.pay.java.core.notification.NotificationConfig;
import com.wechat.pay.java.core.notification.NotificationParser;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.model.Transaction;

/**
 * 处理微信支付回调通知（在 Controller 中使用）
 */
public Transaction handleNotification(
        NotificationConfig config,
        String wechatpayTimestamp,   // 请求头 Wechatpay-Timestamp
        String wechatpayNonce,       // 请求头 Wechatpay-Nonce
        String wechatpaySignature,   // 请求头 Wechatpay-Signature
        String wechatpaySerial,      // 请求头 Wechatpay-Serial
        String requestBody           // 请求体原文
) {
    RequestParam requestParam = new RequestParam.Builder()
            .serialNumber(wechatpaySerial)
            .nonce(wechatpayNonce)
            .signature(wechatpaySignature)
            .timestamp(wechatpayTimestamp)
            .body(requestBody)
            .build();

    NotificationParser parser = new NotificationParser(config);
    // 自动验签 + AES-GCM 解密 + JSON 反序列化
    return parser.parse(requestParam, Transaction.class);
}
```

> **注意**：`RSAAutoCertificateConfig` 同时实现了 `Config` 和 `NotificationConfig` 接口，可以直接用于回调通知解析。

---

## SDK 初始化 -- Python

### 基础初始化

```python
from wechatpayv3 import WeChatPay, WeChatPayType

# ===== 商户配置四要素 =====
MCHID = '1900000109'                     # 商户号
CERT_SERIAL_NO = '5157F09EFDC096DE...'   # 商户证书序列号
APIV3_KEY = 'your_api_v3_key_32bytes!'   # APIv3 密钥（32 字节）
APPID = 'wx8888888888888888'             # 公众号/小程序/APP 的 appid
NOTIFY_URL = 'https://example.com/notify'
CERT_DIR = './certs'                      # 平台证书本地缓存目录

# 读取商户 API 私钥
with open('/path/to/apiclient_key.pem', 'r') as f:
    PRIVATE_KEY = f.read()

# 初始化（平台证书自动下载模式）
wxpay = WeChatPay(
    wechatpay_type=WeChatPayType.NATIVE,  # 支付类型
    mchid=MCHID,
    private_key=PRIVATE_KEY,
    cert_serial_no=CERT_SERIAL_NO,
    apiv3_key=APIV3_KEY,
    appid=APPID,
    notify_url=NOTIFY_URL,
    cert_dir=CERT_DIR,     # SDK 自动下载平台证书到此目录
)
```

### 微信支付公钥模式初始化

```python
# 读取微信支付公钥
with open('/path/to/wechatpay_public_key.pem', 'r') as f:
    PUBLIC_KEY = f.read()

PUBLIC_KEY_ID = 'PUB_KEY_ID_0114232134912410000000000000'

wxpay = WeChatPay(
    wechatpay_type=WeChatPayType.NATIVE,
    mchid=MCHID,
    private_key=PRIVATE_KEY,
    cert_serial_no=CERT_SERIAL_NO,
    apiv3_key=APIV3_KEY,
    appid=APPID,
    notify_url=NOTIFY_URL,
    public_key=PUBLIC_KEY,        # 微信支付公钥内容
    public_key_id=PUBLIC_KEY_ID,  # 微信支付公钥 ID
)
```

### 支付类型枚举

| WeChatPayType | 适用场景 |
|---------------|---------|
| `MINIPROG` | 小程序支付 |
| `JSAPI` | 公众号内 H5 支付 |
| `APP` | APP 支付 |
| `H5` | 外部浏览器 H5 支付 |
| `NATIVE` | 扫码支付 |

### 发起支付（Python 示例）

```python
# Native 支付 -- 下单
from datetime import datetime, timedelta, timezone

out_trade_no = f"ORDER_{int(datetime.now().timestamp())}"
time_expire = (
    datetime.now(timezone(timedelta(hours=8))) + timedelta(hours=2)
).strftime('%Y-%m-%dT%H:%M:%S+08:00')

code, response = wxpay.pay(
    description='测试商品',
    out_trade_no=out_trade_no,
    amount={'total': 1},            # 单位：分
    time_expire=time_expire,
)

if code == 200:
    print(f"支付二维码链接: {response['code_url']}")
else:
    print(f"下单失败: {response}")
```

### 回调通知处理（Python 示例）

```python
from wechatpayv3 import WeChatPay

def handle_notification(headers: dict, body: str) -> dict:
    """
    处理微信支付回调通知。
    headers 须包含 Wechatpay-Timestamp, Wechatpay-Nonce,
    Wechatpay-Signature, Wechatpay-Serial。
    """
    result = wxpay.callback(headers=headers, body=body)
    if result:
        # result 是解密后的通知数据 dict
        trade_state = result.get('trade_state')
        out_trade_no = result.get('out_trade_no')
        if trade_state == 'SUCCESS':
            # 支付成功，更新订单状态
            print(f"订单 {out_trade_no} 支付成功")
        return result
    else:
        raise ValueError("回调验签失败")
```

---

## 应用配置

### appid 与 mchid 关联

一个商户号（mchid）可以关联多个 appid，但每种支付方式要求特定类型的 appid：

| 支付方式 | 需要的 appid 类型 | 关联位置 |
|---------|-----------------|---------|
| JSAPI 支付 | 公众号 appid | 商户平台 -> 产品中心 -> JSAPI支付 -> 关联 AppID |
| 小程序支付 | 小程序 appid | 商户平台 -> 产品中心 -> 小程序支付 -> 关联 AppID |
| APP 支付 | 开放平台 APP appid | 商户平台 -> 产品中心 -> APP支付 -> 关联 AppID |
| Native 支付 | 公众号 appid | 商户平台 -> 产品中心 -> Native支付 |
| H5 支付 | 公众号 appid | 商户平台 -> 产品中心 -> H5支付 |

### notify_url 基础配置

回调通知地址必须满足：
- **HTTPS 协议**（不支持 HTTP）
- **公网可达**（微信支付服务器主动推送）
- **固定路径**（不含动态参数，参数通过请求体传递）
- **端口限制**：仅支持 443 端口
- **响应要求**：收到通知后必须返回 HTTP 200 + `{"code": "SUCCESS", "message": "成功"}`
- **超时与重试**：微信支付等待 5 秒超时，失败后按 15s/15s/30s/3m/10m/20m/30m/30m/30m/60m/3h/3h/3h/6h/6h 间隔重试，共 15 次

```python
# Flask 回调通知端点示例
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/notify', methods=['POST'])
def wechat_pay_notify():
    headers = {
        'Wechatpay-Timestamp': request.headers.get('Wechatpay-Timestamp'),
        'Wechatpay-Nonce': request.headers.get('Wechatpay-Nonce'),
        'Wechatpay-Signature': request.headers.get('Wechatpay-Signature'),
        'Wechatpay-Serial': request.headers.get('Wechatpay-Serial'),
    }
    try:
        result = wxpay.callback(headers=headers, body=request.data.decode())
        if result and result.get('trade_state') == 'SUCCESS':
            # TODO: 更新订单状态（注意幂等性）
            pass
        return jsonify(code='SUCCESS', message='成功'), 200
    except Exception as e:
        return jsonify(code='FAIL', message=str(e)), 500
```

---

## 测试环境

### 微信支付仿真测试系统

微信支付提供了仿真测试系统（沙箱），但有以下**重要限制**：

- **仅支持 APIv2**：仿真系统不支持 APIv3 接口，无法测试 V3 签名流程
- **用例限制**：仿真系统对测试用例（金额等）有严格要求，不符合规定的用例会测试失败
- **功能不完整**：部分 API 在仿真系统中不可用
- **接入方式**：将 API URL 增加 `xdc/apiv2sandbox` 路径层级

### 推荐：小额生产测试方案

由于仿真系统不支持 APIv3，实际开发中推荐使用**生产环境小额测试**：

1. **最小金额**：下单金额设为 1 分钱（`amount.total = 1`）
2. **立即退款**：支付成功后立即调用退款接口全额退款
3. **独立测试号**：使用独立的测试公众号/小程序 + 测试商户号
4. **白名单控制**：仅允许测试人员的 openid 下单
5. **日志完整**：测试期间开启请求/应答全量日志，便于排查签名问题

```python
# 测试完成后立即退款
code, response = wxpay.refund(
    out_trade_no=out_trade_no,
    out_refund_no=f"REFUND_{out_trade_no}",
    amount={'refund': 1, 'total': 1, 'currency': 'CNY'},
    reason='测试退款',
)
```

---

## 常见陷阱

### 1. V2 与 V3 接口混淆

**现象**：签名一直校验失败，怎么调都不对。

**原因**：APIv2（XML + MD5/HMAC-SHA256 + `key` 参数）和 APIv3（JSON + SHA256-RSA2048 + Authorization 头）是两套完全不同的签名体系。混用 V2 密钥调 V3 接口必然失败。

**排查**：确认请求 URL 是否包含 `/v3/` 路径；确认使用的是 APIv3 密钥而非 APIv2 的 `key`。

### 2. 商户证书序列号与平台证书序列号混淆

**现象**：`Authorization` 头中填的 `serial_no` 正确，但验签失败。

**原因**：
- `Authorization` 头的 `serial_no` 应填**商户证书序列号**（标识签名者身份）
- `Wechatpay-Serial` 应答头返回的是**平台证书序列号**（标识验签公钥）
- 两者完全不同，不可混用

### 3. 商户 API 私钥格式错误

**现象**：`InvalidKeySpecException` 或签名值异常。

**原因**：
- 使用了 `apiclient_cert.pem`（证书）而非 `apiclient_key.pem`（私钥）
- 私钥文件被编辑器修改（多了空格、换行、BOM 头）
- 将 PKCS#1 格式（`BEGIN RSA PRIVATE KEY`）和 PKCS#8 格式（`BEGIN PRIVATE KEY`）混用

**验证**：

```bash
# 检查私钥格式是否正确
openssl rsa -in apiclient_key.pem -check -noout
# 应输出：RSA key ok
```

### 4. APIv3 密钥不是 32 字节

**现象**：AES-256-GCM 解密平台证书或回调通知失败。

**原因**：APIv3 密钥必须**恰好 32 字节**（256 位）。少于或多于 32 字节都会导致 AES-256 密钥长度校验失败。

**排查**：

```python
api_v3_key = "your_key_here"
assert len(api_v3_key.encode('utf-8')) == 32, \
    f"APIv3 密钥长度错误: {len(api_v3_key.encode('utf-8'))} 字节，需要 32 字节"
```

### 5. 时钟偏差导致签名过期

**现象**：间歇性签名验证失败，错误码 `SIGN_ERROR`。

**原因**：微信支付会校验请求时间戳与服务器时间的偏差，偏差超过 **5 分钟**会拒绝请求。

**解决**：
- 确保服务器开启 NTP 时间同步
- 检查容器/虚拟机的时区和时钟是否正确
- 日志中记录每次请求的时间戳，便于排查

### 6. GET 请求的签名串 body 不为空

**现象**：GET 请求签名校验失败。

**原因**：GET/DELETE 请求无请求体，签名串第五行应为**空字符串**（但 `\n` 仍然需要）。部分开发者误将 `null`、`"null"` 或查询参数填入第五行。

**正确格式**：

```
GET\n
/v3/pay/transactions/id/420000000?mchid=1900000109\n
1554208460\n
593BEC0C930BF1AFEB40B4A08C8FB242\n
\n
```

注意：最后一行是空行后紧跟 `\n`，共五个 `\n`。

### 7. URL 路径错误（含域名或缺少查询参数）

**现象**：签名串构造看起来正确，但验签仍然失败。

**原因**：签名串的 URL 行必须是**不含域名的绝对路径**，且如果有查询参数，必须包含完整的 query string。

**错误示例**：

```
# 错误：包含了域名
https://api.mch.weixin.qq.com/v3/pay/transactions/id/420000000?mchid=1900000109

# 错误：丢失了查询参数
/v3/pay/transactions/id/420000000

# 正确
/v3/pay/transactions/id/420000000?mchid=1900000109
```

### 8. RSAAutoCertificateConfig 单例问题

**现象**：`IllegalStateException` -- 重复创建 `RSAAutoCertificateConfig` 报错。

**原因**：在 v0.2.10 之前，同一商户号只能创建一个 `RSAAutoCertificateConfig` 实例。v0.2.10+ 已移除此限制，但仍建议将 Config 作为单例管理（避免重复的证书更新定时任务）。

**解决**：在 Spring Boot 中将 Config 注册为 `@Bean`：

```java
@Configuration
public class WechatPayConfig {
    @Bean
    public Config wechatPayConfig() {
        return new RSAAutoCertificateConfig.Builder()
                .merchantId("1900000109")
                .privateKeyFromPath("/path/to/apiclient_key.pem")
                .merchantSerialNumber("5157F09EFDC096DE...")
                .apiV3Key("your_api_v3_key_32bytes_string!")
                .build();
    }
}
```

### 9. 回调通知未做幂等处理

**现象**：同一笔订单被重复处理（重复发货、重复加积分等）。

**原因**：微信支付的回调通知采用**至少一次（at-least-once）**投递策略，同一通知可能推送多次。

**解决**：用 `out_trade_no` 或 `transaction_id` 作为幂等键，数据库层面加唯一约束或使用分布式锁。

### 10. 回调通知返回格式错误导致无限重试

**现象**：持续收到重复的回调通知。

**原因**：回调处理端点必须返回 HTTP 200 + JSON `{"code": "SUCCESS", "message": "成功"}`。返回其他状态码或格式会被视为处理失败，触发重试（最多 15 次，跨度约 24 小时）。

---

## 组合提示

- **wechat-pay-apis**：JSAPI / Native / APP / H5 各支付方式的下单、查询、退款、关单等具体 API 调用
- **wechat-pay-notifications**：回调通知的完整处理流程（验签、解密、业务处理、幂等）
- **payment-security**：跨渠道（支付宝/微信/银联）的签名机制对比、证书管理最佳实践、PCI DSS 合规
- **payment-resilience**：支付系统的超时、重试、幂等、补偿机制设计
- **payment-reconciliation**：微信支付对账文件下载与差异处理
