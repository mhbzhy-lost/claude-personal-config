---
name: payment-security
description: "支付安全：RSA/RSA2 签名验签、证书管理与轮换、API 密钥安全、PCI DSS 基础、防重放攻击。"
tech_stack: [payment, backend]
---

# 支付安全与签名机制

> 基准版本：支付宝开放平台 v3 / 微信支付 APIv3 / 银联全渠道 5.1.0 -- 截至 2025-05

## 用途

覆盖对接支付宝、微信支付、银联三大渠道时涉及的签名验签、证书管理、密钥轮换、防重放攻击和 PCI DSS 合规基础。帮助开发者在不依赖官方 SDK 时正确实现安全通信，以及在使用 SDK 时理解底层机制以排查签名失败问题。

## 何时使用

- 自研支付网关，需要手动构造签名串并完成签名/验签
- 排查"签名校验失败"类错误，需要理解各渠道的签名串构造规则
- 设计密钥/证书的存储、轮换、监控方案
- 评估系统的 PCI DSS 合规层级与 SAQ 类型
- 实现 API 防重放攻击机制
- 审查支付系统安全架构

## 签名机制总览

### 三大渠道签名算法对比

| 渠道 | 算法 | 签名头/字段 | 签名串构造规则 | 密钥类型 |
|------|------|------------|--------------|---------|
| 支付宝 | SHA256withRSA (RSA2) | `sign` 参数 | 参数按 key ASCII 升序 -> `key1=value1&key2=value2` | RSA 2048 应用私钥 |
| 微信支付 V3 | SHA256-RSA2048 | HTTP `Authorization: WECHATPAY2-SHA256-RSA2048 ...` | 五行文本：HTTP方法\nURL\n时间戳\n随机串\n请求体\n | 商户 API 私钥 (.pem) |
| 银联 | SHA256withRSA | `signature` 字段 | 非空参数排序 -> URL encode -> `&` 拼接 -> SHA256 摘要 -> RSA 签名 | 商户签名证书 (.pfx) |

### 共性流程

1. **构造待签名字符串** -- 各渠道规则不同（见下文详解）
2. **用私钥执行 SHA256withRSA 签名** -- 算法标准，输入不同
3. **Base64 编码签名结果** -- 输出为可传输字符串

验签是反向操作：构造相同的待签名串，用对方公钥验证签名值。

## RSA2 签名与验签（支付宝）

### 签名流程

```
1. 获取所有请求参数（不含 sign、sign_type），过滤值为空的参数
2. 按参数名 ASCII 码升序排序
3. 拼接为 key1=value1&key2=value2 格式（值不做 URL encode）
4. 用应用私钥对拼接串执行 SHA256withRSA 签名
5. Base64 编码得到 sign 值
```

验签反向操作：提取 sign 之外参数按相同规则拼接，用支付宝公钥验证。异步通知中 `sign` 和 `sign_type` 不参与验签。

### Java 示例

```java
public class AlipaySignature {
    /** 签名：过滤空值 -> ASCII 排序 -> 拼接 -> SHA256withRSA -> Base64 */
    public static String sign(Map<String, String> params, String privateKeyBase64) throws Exception {
        String content = buildSignContent(params);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKeyBase64));
        PrivateKey priKey = KeyFactory.getInstance("RSA").generatePrivate(keySpec);
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(priKey);
        sig.update(content.getBytes("UTF-8"));
        return Base64.getEncoder().encodeToString(sig.sign());
    }

    /** 验签：用支付宝公钥验证 */
    public static boolean verify(Map<String, String> params, String sign, String publicKeyBase64) throws Exception {
        String content = buildSignContent(params);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(Base64.getDecoder().decode(publicKeyBase64));
        PublicKey pubKey = KeyFactory.getInstance("RSA").generatePublic(keySpec);
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initVerify(pubKey);
        sig.update(content.getBytes("UTF-8"));
        return sig.verify(Base64.getDecoder().decode(sign));
    }

    private static String buildSignContent(Map<String, String> params) {
        TreeMap<String, String> sorted = new TreeMap<>(params);  // ASCII 升序
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : sorted.entrySet()) {
            if (e.getValue() != null && !e.getValue().isEmpty()) {
                if (sb.length() > 0) sb.append("&");
                sb.append(e.getKey()).append("=").append(e.getValue());  // 不做 URL encode
            }
        }
        return sb.toString();
    }
}
```

### Python 示例

```python
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
import base64

def build_sign_content(params: dict) -> str:
    filtered = {k: v for k, v in params.items()
                if v is not None and v != "" and k not in ("sign", "sign_type")}
    return "&".join(f"{k}={filtered[k]}" for k in sorted(filtered.keys()))

def rsa2_sign(params: dict, private_key_pem: bytes) -> str:
    content = build_sign_content(params).encode("utf-8")
    key = serialization.load_pem_private_key(private_key_pem, password=None)
    return base64.b64encode(key.sign(content, padding.PKCS1v15(), hashes.SHA256())).decode()

def rsa2_verify(params: dict, sign: str, public_key_pem: bytes) -> bool:
    content = build_sign_content(params).encode("utf-8")
    key = serialization.load_pem_public_key(public_key_pem)
    try:
        key.verify(base64.b64decode(sign), content, padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False
```

## 微信支付 V3 签名机制详解

### 签名串构造

签名串由 **五行文本** 组成，每行以 `\n` 结束（包括最后一行）：

```
HTTP请求方法\n
URL（含查询串，不含域名）\n
请求时间戳（秒级 Unix timestamp）\n
请求随机串（32 字符）\n
请求体（GET 请求为空字符串）\n
```

**示例**（POST 下单）：`POST\n/v3/pay/transactions/jsapi\n1554208460\n593BEC0C930BF1AFEB40B4A08C8FB242\n{"appid":"wx8888","mchid":"1900009191"}\n`

### Authorization 头格式

```
Authorization: WECHATPAY2-SHA256-RSA2048 mchid="商户号",nonce_str="随机串",timestamp="时间戳",serial_no="商户证书序列号",signature="签名值"
```

五个字段无顺序要求，用逗号分隔。`serial_no` 用于微信支付识别用哪个公钥验签。

### 应答签名验证

```
1. 从响应头获取 Wechatpay-Timestamp、Wechatpay-Nonce
2. 构造验签串：时间戳\n随机串\n应答体\n
3. 从 Wechatpay-Serial 获取平台证书序列号，匹配对应证书
4. 用平台证书公钥验证 Wechatpay-Signature
```

### Java 示例

```java
public class WechatPayV3Signature {
    /** 签名：五行文本 -> SHA256withRSA -> Base64 */
    public static String[] sign(String method, String url, String body,
                                PrivateKey privateKey) throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String nonceStr = UUID.randomUUID().toString().replace("-", "").toUpperCase();
        String message = method + "\n" + url + "\n" + timestamp + "\n"
                + nonceStr + "\n" + body + "\n";  // 末尾必须有 \n
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(privateKey);
        sig.update(message.getBytes(StandardCharsets.UTF_8));
        return new String[]{timestamp, nonceStr, Base64.getEncoder().encodeToString(sig.sign())};
    }

    /** 构造 Authorization 头 */
    public static String buildAuth(String mchid, String serialNo, String[] signResult) {
        return "WECHATPAY2-SHA256-RSA2048 mchid=\"" + mchid + "\",nonce_str=\""
                + signResult[1] + "\",timestamp=\"" + signResult[0] + "\",serial_no=\""
                + serialNo + "\",signature=\"" + signResult[2] + "\"";
    }

    /** 验证应答签名 */
    public static boolean verify(String timestamp, String nonce, String body,
                                 String signature, PublicKey publicKey) throws Exception {
        String message = timestamp + "\n" + nonce + "\n" + body + "\n";
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initVerify(publicKey);
        sig.update(message.getBytes(StandardCharsets.UTF_8));
        return sig.verify(Base64.getDecoder().decode(signature));
    }
}
```

### Python 示例

```python
import time, uuid, base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

def wechat_v3_sign(method: str, url: str, body: str, private_key_pem: bytes):
    ts, nonce = str(int(time.time())), uuid.uuid4().hex.upper()
    message = f"{method}\n{url}\n{ts}\n{nonce}\n{body}\n"
    key = serialization.load_pem_private_key(private_key_pem, password=None)
    sig = base64.b64encode(key.sign(message.encode(), padding.PKCS1v15(), hashes.SHA256())).decode()
    return ts, nonce, sig

def wechat_v3_verify(timestamp: str, nonce: str, body: str, signature: str, pub_pem: bytes) -> bool:
    message = f"{timestamp}\n{nonce}\n{body}\n"
    key = serialization.load_pem_public_key(pub_pem)
    try:
        key.verify(base64.b64decode(signature), message.encode(), padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False
```

## 银联签名机制

### 签名流程（两步哈希）

```
1. 获取所有非空参数（不含 signature），按 key ASCII 升序排序
2. 拼接为 key1=value1&key2=value2（值需要 URL encode）
3. 对拼接串做 SHA-256 摘要 -> 十六进制小写字符串
4. 用 .pfx 私钥对摘要字符串做 RSA 签名 -> Base64 编码
```

**与支付宝关键区别**：

| 差异点 | 支付宝 | 银联 |
|--------|--------|------|
| 签名输入 | 直接对拼接串签名 | 先 SHA256 摘要再签名 |
| 值编码 | 不做 URL encode | 需 URL encode |
| 密钥格式 | PEM 私钥 | .pfx (PKCS#12) |
| 过滤字段 | sign, sign_type | signature |

### Java 示例

```java
public class UnionPaySignature {
    public static String sign(Map<String, String> params, String pfxPath, String pfxPwd) throws Exception {
        // 1. 排序 + URL encode + 拼接
        TreeMap<String, String> sorted = new TreeMap<>(params);
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : sorted.entrySet()) {
            if (e.getValue() != null && !e.getValue().isEmpty()) {
                if (sb.length() > 0) sb.append("&");
                sb.append(e.getKey()).append("=").append(URLEncoder.encode(e.getValue(), "UTF-8"));
            }
        }
        // 2. SHA-256 摘要 -> 十六进制
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes("UTF-8"));
        String hexHash = bytesToHex(hash);
        // 3. 从 .pfx 提取私钥
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(new FileInputStream(pfxPath), pfxPwd.toCharArray());
        String alias = ks.aliases().nextElement();
        PrivateKey pk = (PrivateKey) ks.getKey(alias, pfxPwd.toCharArray());
        // 4. 对摘要十六进制字符串做 RSA 签名
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(pk);
        sig.update(hexHash.getBytes("UTF-8"));
        return Base64.getEncoder().encodeToString(sig.sign());
    }
}
```

### Python 示例

```python
import hashlib, base64, urllib.parse
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

def unionpay_sign(params: dict, pfx_data: bytes, pfx_password: bytes) -> str:
    filtered = {k: v for k, v in params.items() if v and k != "signature"}
    content = "&".join(f"{k}={urllib.parse.quote(str(filtered[k]),safe='')}" for k in sorted(filtered))
    hex_hash = hashlib.sha256(content.encode()).hexdigest()
    private_key, _, _ = pkcs12.load_key_and_certificates(pfx_data, pfx_password)
    sig = private_key.sign(hex_hash.encode(), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode()
```

## 证书管理

### 证书类型一览

| 渠道 | 证书/密钥 | 格式 | 用途 |
|------|----------|------|------|
| **支付宝** | 应用私钥 | PEM | 签名请求 |
| | 应用公钥 | PEM | 上传至开放平台换取支付宝公钥 |
| | 支付宝公钥 | PEM | 验证响应/通知签名 |
| | 应用公钥证书 | .crt | 证书模式：含公钥+证书链 |
| | 支付宝公钥证书 | .crt | 证书模式验签 |
| | 支付宝根证书 | .crt | 验证证书链 |
| **微信支付** | 商户 API 私钥 | .pem | 签名请求 |
| | 商户 API 证书 | .pem | 含公钥，序列号用于 serial_no |
| | 平台证书 | .pem | 验签（通过 API 下载） |
| **银联** | 商户签名证书 | .pfx | 签名（含私钥，密码保护） |
| | 银联验签证书 | .cer | 验证响应签名 |
| | 银联根证书 | .cer | 验证证书链 |
| | 银联加密证书 | .cer | 敏感信息加密（如卡号） |

### 存储最佳实践

```
推荐（高到低）：
1. KMS（AWS/阿里云/腾讯云）—— 私钥不离 HSM，签名在 KMS 完成
2. Vault / K8s Secrets —— 启动注入，内存持有，不落盘
3. 加密文件系统 —— 权限 600，磁盘加密

禁止：提交代码仓库 | 硬编码源码 | IM 传输明文 | 日志打印密钥
```

### 证书有效期监控

每日 cron 检查所有证书到期时间，30 天内紧急告警，90 天内预警。推送到钉钉/企微/邮件。

## 密钥轮换

### 双密钥滚动策略

```
T0: 仅旧密钥 -> T1: 生成新密钥对，上传新公钥（保留旧）
T2: 灰度切换（新私钥签名，新旧公钥都能验签）
T3: 观察期 ≥ 72h -> T4: 删除旧公钥，完成
```

### 支付宝密钥轮换

1. 本地生成新 RSA 2048 密钥对
2. 开放平台上传新公钥（旧公钥保留）
3. 获取对应新支付宝公钥
4. 代码切换：新私钥签名 + 新公钥验签（保留旧公钥 fallback）
5. 72h 无异常后删除旧公钥

**证书模式**：切换后一周内可回退，超时不可逆。首次即用证书模式的不允许降级。

### 微信支付证书轮换

平台证书由微信主动轮换，商户被动适应：

1. 定期调用 `GET /v3/certificates`（间隔 ≤ 12h）
2. 用 APIv3 密钥 + AES-256-GCM 解密证书内容
3. 以 `serial_no` 为 key 缓存多份证书
4. 验签时按 `Wechatpay-Serial` 头匹配证书，未命中则刷新

```python
# 微信平台证书缓存管理（伪代码）
class WechatCertManager:
    def __init__(self):
        self._certs = {}  # {serial_no: certificate}
        self._last_refresh = 0

    def get_cert(self, serial_no: str):
        if serial_no not in self._certs:
            self._refresh()
        return self._certs.get(serial_no)

    def _refresh(self):
        if time.time() - self._last_refresh < 60:  # 防刷新风暴
            return
        for item in call_api("GET", "/v3/certificates")["data"]:
            pem = aes_gcm_decrypt(item["encrypt_certificate"], api_v3_key)
            self._certs[item["serial_no"]] = load_certificate(pem)
        self._last_refresh = time.time()
```

### 银联证书轮换

在商户服务网站申请新 .pfx -> 下载 -> 更新配置中的路径和密码。验签证书更换时重新下载 .cer。注意 .pfx 含私钥，传输存储必须加密。

## 防重放攻击

### 核心三要素

| 机制 | 作用 | 实现 |
|------|------|------|
| **时间戳** | 限制有效时间窗口 | `|server_time - request_time| <= 5min` |
| **随机串 (nonce)** | 保证唯一性 | Redis `SET NX` + TTL |
| **签名** | 防参数篡改 | 覆盖 timestamp + nonce + 业务参数 |

三者缺一不可：无时间戳则 nonce 需永久存储；无 nonce 则窗口内可重放；无签名则可伪造前两者。

### 实现方案

```python
import time, redis
redis_client = redis.Redis()
REPLAY_WINDOW = 300  # 5 分钟

def check_replay(timestamp: str, nonce: str, signature: str) -> bool:
    """返回 True 表示合法。校验顺序：签名 -> 时间戳 -> nonce"""
    if not verify_signature(signature):
        return False
    if abs(int(time.time()) - int(timestamp)) > REPLAY_WINDOW:
        return False
    # SET NX：key 不存在才设置成功，TTL 到期自动清理
    return bool(redis_client.set(f"nonce:{nonce}", "1", nx=True, ex=REPLAY_WINDOW))
```

### 各渠道内建机制

- **微信 V3**：签名串含 timestamp + nonce_str，微信侧校验时间偏差
- **支付宝**：签名含 `timestamp` 参数（`yyyy-MM-dd HH:mm:ss` 格式），异步通知 `notify_id` 可接口验真
- **银联**：`txnTime` 交易时间纳入签名，后台校验时间合理性

### 高并发优化

1. **Redis Cluster 分片**：按 nonce 哈希避免单点瓶颈
2. **Lua 原子操作**：timestamp 校验 + SET NX 合并一条命令
3. **Bloom Filter 前置**：本地快速排除已知 nonce，命中后再查 Redis
4. **精确 TTL**：`TTL = REPLAY_WINDOW - (server_time - request_time)`

## PCI DSS 基础

### 4.0 核心要求（12 条 / 6 类）

| 类别 | # | 要求 |
|------|---|------|
| 构建安全网络 | 1 | 安装维护网络安全控制 |
| | 2 | 所有系统组件应用安全配置 |
| 保护账户数据 | 3 | 保护存储的账户数据 |
| | 4 | 强加密保护传输中的持卡人数据 |
| 漏洞管理 | 5 | 防恶意软件 |
| | 6 | 安全开发和维护 |
| 强访问控制 | 7 | 按需限制访问 |
| | 8 | 身份认证 |
| | 9 | 限制物理访问 |
| 监控测试 | 10 | 记录监控所有访问 |
| | 11 | 定期安全测试 |
| 安全策略 | 12 | 维护信息安全策略 |

### 商户合规层级

| 层级 | 年交易量 | 要求 |
|------|---------|------|
| Level 1 | > 600 万 | QSA 外部审计 + ROC + ASV 扫描 |
| Level 2 | 100-600 万 | SAQ 自评 + ASV 扫描 |
| Level 3 | 2-100 万 | SAQ 自评 + ASV 扫描 |
| Level 4 | < 2 万 | SAQ 自评 |

### SAQ 类型

| 类型 | 场景 | 要求量 | 典型案例 |
|------|------|--------|---------|
| **A** | 支付完全托管，不接触卡号 | ~24 | 跳转支付宝/微信收银台 |
| **A-EP** | 控制支付页面但不处理卡号 | ~140 | 嵌入 JS SDK |
| **B** | 独立刷卡终端，无电子存储 | ~41 | 线下 POS |
| **C** | 联网支付终端 | ~160 | 带网络 POS |
| **D** | 不满足其他类型 | ~300+ | 自建支付系统 |

### 数据处理规则

| 数据类型 | 存储 | 显示 | 备注 |
|---------|------|------|------|
| PAN（主账号） | 加密存储 | 仅后 4 位 | AES-256 等 |
| CVV/CVC | **禁止** | **禁止** | 授权后立即销毁 |
| 磁道数据 | **禁止** | **禁止** | 加密也不允许 |
| 持卡人姓名 | 可存储 | 可显示 | 需保护 |
| 有效期 | 可存储 | 可脱敏 | 若存储需保护 |

### 令牌化（Tokenization）

用不可逆 token 替代真实卡号，缩小 PCI 范围。仅令牌化服务本身需合规，使用 token 的系统不在审计范围内。

### 对接三方支付的合规定位

通过支付宝/微信/银联收单的商户不直接处理卡号，通常属于 **SAQ A**（跳转模式）或 **SAQ A-EP**（嵌入模式）。仍需关注：TLS 1.2+、日志脱敏、访问控制。

## 常见陷阱

1. **支付宝签名值做了 URL encode**：签名时参数值 **不做** URL encode，直接用原始值拼接。这是最常见的签名失败原因。银联则相反，需要 URL encode。

2. **微信签名串末尾缺换行符**：五行每行以 `\n` 结尾，包括最后一行。遗漏末尾 `\n` 导致签名失败。

3. **微信 GET 请求 body 用了 null**：GET 无 body 时签名串 body 部分为空串（两个连续 `\n`），不是 `null` 也不能省略。

4. **字符编码不一致**：签名验签必须同一编码（UTF-8）。异步通知验签时编码不匹配是常见问题。

5. **证书序列号未动态匹配**：微信轮换平台证书后，未按 `Wechatpay-Serial` 匹配证书导致验签失败。

6. **银联 .pfx 密码/过期**：密码错报 `keystore` 异常；过期直接拒签。测试与生产证书不同。

7. **时间戳格式混用**：支付宝 `yyyy-MM-dd HH:mm:ss`，微信 Unix 秒级时间戳，格式搞混导致签名错误。

8. **RSA 密钥格式**：PEM 头尾标记和换行必须正确。PKCS#1 (`BEGIN RSA PRIVATE KEY`) 和 PKCS#8 (`BEGIN PRIVATE KEY`) 不同，Java 默认 PKCS#8。

9. **验签用错公钥**：签名用自己私钥，验签用**对方公钥**。支付宝验签用支付宝公钥，微信验签用平台证书公钥。

10. **异步通知未幂等**：通知可能重复。必须用订单号做幂等键，避免重复发货/加款。

11. **日志泄露密钥**：调试时将私钥写入日志。生产只允许打印待签名串用于比对，严禁打印密钥。

## 组合提示

- **payment-gateway**：支付网关整体架构，签名验签是网关核心安全层
- **alipay-onboarding**：支付宝接入流程，密钥配置与沙箱环境搭建
- **wechat-pay-onboarding**：微信支付接入，商户证书申请与平台证书下载
- **unionpay-onboarding**：银联接入流程，.pfx 证书申请与测试环境配置
