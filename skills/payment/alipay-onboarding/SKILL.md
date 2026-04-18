---
name: alipay-onboarding
description: "支付宝开放平台接入：应用创建、密钥配置（公钥证书模式）、SDK 初始化（Java/Python）、沙箱环境。"
tech_stack: [payment, alipay, backend]
language: [java, python]
capability: [payment-gateway]
---

# 支付宝开放平台接入

> 来源：https://opendocs.alipay.com/open/01emu5 (接入指南)、https://opendocs.alipay.com/common/02kdnc (密钥配置)
> 版本基准：alipay-sdk-java 4.40.x.ALL / alipay-sdk-java-v3 3.1.x.ALL；python-alipay-sdk 3.4.0（社区版 fzlee/alipay）；alipay-sdk-python 3.7.x（官方版）

## 用途

支付宝开放平台是蚂蚁集团面向商户和 ISV 开放的支付、营销、数据能力集合。本 skill 覆盖从零接入的完整准备工作：在开放平台创建应用、配置密钥/证书、初始化 SDK 客户端、连通沙箱环境，为后续调用具体支付/营销 API 打下基础。

## 何时使用

- 首次接入支付宝支付，需要在开放平台注册应用并完成密钥配置
- 选择公钥模式还是公钥证书模式，需要理解两者差异
- 在 Java 或 Python 后端服务中初始化 AlipayClient，需要完整可运行的代码
- 使用沙箱环境进行联调测试，需要知道沙箱网关、账号、限制
- 从旧版 RSA1 升级到 RSA2 签名算法，需要迁移指引

## 开放平台应用创建

### 入口

登录 https://open.alipay.com，进入控制台 > 开发者中心 > 应用管理。

### 应用类型

| 类型 | 适用方 | 说明 |
|------|--------|------|
| 自用型应用（网页/移动应用） | 商户自研 | 商户自己开发、自己使用，仅操作自己的商户号 |
| 小程序应用 | 商户/ISV | 运行在支付宝客户端内的小程序 |
| 第三方应用 | ISV（服务商） | 服务商代商户开发，需要商户授权后才能调用商户的接口 |

### 创建流程

1. **创建应用**：控制台点击"创建应用"，选择应用类型，填写应用名称
2. **完善信息**：填写应用简介、应用图标、应用类型等基础信息
3. **添加功能**：在"功能列表"中添加所需能力（如"电脑网站支付"、"APP 支付"、"当面付"等）
4. **配置密钥**：设置接口加签方式（详见下一节）
5. **提交审核**：确认信息无误后点击"上线"提交审核
6. **审核通过**：获得正式 AppID，开始调用线上接口

### 能力签约

添加功能后，部分能力需要单独签约（如"电脑网站支付"需要企业资质）。签约状态在"功能列表"中查看，状态为"已签约"才可调用。

## 密钥配置

### 两种加签模式对比

| 维度 | 公钥模式 | 公钥证书模式（推荐） |
|------|----------|----------------------|
| 安全性 | 基础 | 更高，引入 CA 证书链校验 |
| 适用场景 | 简单集成、无证书管理需求 | 涉及资金类接口、转账、有合规要求 |
| 验签方式 | 用支付宝公钥直接验签 | 从支付宝公钥证书中提取公钥验签 |
| 所需文件 | 应用私钥 + 支付宝公钥 | 应用私钥 + 应用公钥证书 + 支付宝公钥证书 + 支付宝根证书 |
| 资金类 API | 部分不支持 | 全部支持 |
| 官方推荐 | 否 | 是 |

### 密钥生成步骤（公钥证书模式）

1. **下载密钥工具**：从 https://opendocs.alipay.com/common/02kdnc 下载"支付宝开放平台密钥工具"（支持 Windows/macOS）
2. **生成密钥对**：
   - 打开密钥工具，选择"生成密钥"
   - 密钥长度选择 **RSA2（2048位）**（强制，RSA1 已不推荐）
   - 密钥格式选择 **PKCS1**（Java SDK 内部会自动转换为 PKCS8）
   - 点击生成，得到**应用公钥**和**应用私钥**
3. **上传公钥获取证书**：
   - 在开放平台控制台 > 应用详情 > 开发设置 > 接口加签方式 中选择"公钥证书"
   - 上传步骤 2 生成的**应用公钥**
   - 系统自动生成并提供下载三个证书文件：
     - `appCertPublicKey_<AppID>.crt` — 应用公钥证书
     - `alipayCertPublicKey_RSA2.crt` — 支付宝公钥证书
     - `alipayRootCert.crt` — 支付宝根证书
4. **保存文件**：将应用私钥和三个证书文件妥善保存至服务端安全目录

### 密钥格式说明

| 格式 | 说明 | 使用方 |
|------|------|--------|
| PKCS1 | `-----BEGIN RSA PRIVATE KEY-----` 开头 | 密钥工具默认输出、Python SDK 常用 |
| PKCS8 | `-----BEGIN PRIVATE KEY-----` 开头 | Java SDK 要求的格式 |

密钥工具可在两种格式间转换。Java SDK v2 的 `DefaultAlipayClient` 接收 PKCS8 格式私钥字符串（去掉头尾和换行的纯 Base64）。

## SDK 依赖

### Java — 官方 SDK v2（经典版，稳定首选）

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.alipay.sdk</groupId>
    <artifactId>alipay-sdk-java</artifactId>
    <version>4.40.145.ALL</version>
</dependency>
```

> 注意：版本号持续更新，请在 https://mvnrepository.com/artifact/com.alipay.sdk/alipay-sdk-java 查看最新版本。
> 4.34.0 之前的版本存在 Fastjson 安全漏洞，务必升级至 4.34.0+。

### Java — 官方 SDK v3（新一代，模型化 API）

```xml
<dependency>
    <groupId>com.alipay.sdk</groupId>
    <artifactId>alipay-sdk-java-v3</artifactId>
    <version>3.1.62.ALL</version>
</dependency>
```

v3 SDK 将每个 API 封装为独立的 Model + Client 方法，写法更接近 RESTful 风格。新项目可优先考虑 v3，但目前社区示例和教程以 v2 居多。

### Python — 社区版（fzlee/alipay，推荐）

```bash
pip install python-alipay-sdk
# 当前最新版本：3.4.0（2025-11-16 发布）
# 依赖 pycryptodome
```

### Python — 官方版

```bash
pip install alipay-sdk-python
# 当前最新版本：3.7.779
```

官方版 API 风格与 Java SDK 一致（逐接口调用），社区版封装更 Pythonic，文档更友好，在 Python 生态中使用率更高。

## SDK 初始化 -- Java（证书模式）

### 完整代码（v2 SDK，CertAlipayRequest）

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.CertAlipayRequest;
import com.alipay.api.DefaultAlipayClient;
import com.alipay.api.AlipayApiException;

public class AlipayClientFactory {

    private static volatile AlipayClient client;

    /**
     * 获取证书模式的 AlipayClient 单例
     * 证书文件请放在服务端安全目录，禁止打包到前端资源
     */
    public static AlipayClient getInstance() throws AlipayApiException {
        if (client == null) {
            synchronized (AlipayClientFactory.class) {
                if (client == null) {
                    CertAlipayRequest certParams = new CertAlipayRequest();

                    // 网关地址（生产环境）
                    certParams.setServerUrl("https://openapi.alipay.com/gateway.do");
                    // 应用 AppID
                    certParams.setAppId("2021000000000001");
                    // 应用私钥（PKCS8 格式，去掉头尾和换行的纯 Base64 字符串）
                    certParams.setPrivateKey("MIIEvgIBADANBgkqh...<省略>...==");
                    // 请求格式
                    certParams.setFormat("json");
                    // 字符集
                    certParams.setCharset("UTF-8");
                    // 签名算法（强制 RSA2）
                    certParams.setSignType("RSA2");

                    // 三个证书文件的绝对路径
                    certParams.setCertPath("/path/to/appCertPublicKey_2021000000000001.crt");
                    certParams.setAlipayPublicCertPath("/path/to/alipayCertPublicKey_RSA2.crt");
                    certParams.setRootCertPath("/path/to/alipayRootCert.crt");

                    client = new DefaultAlipayClient(certParams);
                }
            }
        }
        return client;
    }
}
```

### 使用 Client 调用接口

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradePagePayRequest;
import com.alipay.api.response.AlipayTradePagePayResponse;

public class PayService {

    public String createPagePay(String outTradeNo, String totalAmount, String subject)
            throws AlipayApiException {
        AlipayClient client = AlipayClientFactory.getInstance();

        AlipayTradePagePayRequest request = new AlipayTradePagePayRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setReturnUrl("https://yourdomain.com/pay/success");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"product_code\":\"FAST_INSTANT_TRADE_PAY\"" +
            "}");

        // 证书模式必须使用 certificateExecute
        AlipayTradePagePayResponse response = client.certificateExecute(request);
        if (response.isSuccess()) {
            return response.getBody(); // 返回 form 表单 HTML
        }
        throw new RuntimeException("下单失败: " + response.getSubMsg());
    }
}
```

> 关键：证书模式调用接口时必须使用 `client.certificateExecute(request)`，不能用普通的 `client.execute(request)`，否则签名验证会失败。

### 公钥模式初始化（对比参考）

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.DefaultAlipayClient;

// 公钥模式：参数更少，但安全性较低，部分资金类接口不支持
AlipayClient client = new DefaultAlipayClient(
    "https://openapi.alipay.com/gateway.do",  // 网关
    "2021000000000001",                         // AppID
    "MIIEvgIBADANBgkqh...",                     // 应用私钥（PKCS8）
    "json",                                      // 格式
    "UTF-8",                                     // 字符集
    "MIIBIjANBgkqhkiG9...",                     // 支付宝公钥（非证书）
    "RSA2"                                       // 签名类型
);
// 公钥模式使用 client.execute(request) 即可
```

## SDK 初始化 -- Python（证书模式）

### 社区版 python-alipay-sdk（fzlee/alipay）

```python
from alipay import AliPay, DCAliPay
from alipay.utils import AliPayConfig

def create_alipay_client_public_key() -> AliPay:
    """公钥模式初始化（简单场景）"""
    with open("/path/to/app_private_key.pem", "r") as f:
        app_private_key_string = f.read()
    with open("/path/to/alipay_public_key.pem", "r") as f:
        alipay_public_key_string = f.read()

    alipay = AliPay(
        appid="2021000000000001",
        app_notify_url="https://yourdomain.com/api/alipay/notify",
        app_private_key_string=app_private_key_string,
        alipay_public_key_string=alipay_public_key_string,
        sign_type="RSA2",  # 强制 RSA2
        debug=False,        # False=生产环境，True=沙箱环境
        verbose=False,
        config=AliPayConfig(timeout=15),
    )
    return alipay


def create_alipay_client_cert() -> DCAliPay:
    """公钥证书模式初始化（推荐）"""
    with open("/path/to/app_private_key.pem", "r") as f:
        app_private_key_string = f.read()

    alipay = DCAliPay(
        appid="2021000000000001",
        app_notify_url="https://yourdomain.com/api/alipay/notify",
        app_private_key_string=app_private_key_string,
        # 证书模式：传入三个证书的文件内容字符串
        app_public_key_cert_string=open("/path/to/appCertPublicKey_2021000000000001.crt").read(),
        alipay_public_key_cert_string=open("/path/to/alipayCertPublicKey_RSA2.crt").read(),
        alipay_root_cert_string=open("/path/to/alipayRootCert.crt").read(),
        sign_type="RSA2",
        debug=False,
        config=AliPayConfig(timeout=15),
    )
    return alipay
```

### 调用示例（电脑网站支付）

```python
from alipay import DCAliPay

alipay: DCAliPay = create_alipay_client_cert()

# 生成支付页面 URL
order_string = alipay.api_alipay_trade_page_pay(
    out_trade_no="202604161234567890",
    total_amount="88.88",
    subject="测试订单",
    return_url="https://yourdomain.com/pay/success",
    notify_url="https://yourdomain.com/api/alipay/notify",
)

# 拼接完整支付链接
pay_url = f"https://openapi.alipay.com/gateway.do?{order_string}"
print(f"请跳转到: {pay_url}")
```

### 社区版 debug 模式说明

`debug=True` 时，SDK 自动将网关切换为沙箱地址。无需手动修改 URL。

```python
# 沙箱环境
alipay = AliPay(
    appid="沙箱AppID",
    # ...其他参数...
    debug=True,  # 自动使用沙箱网关
)
```

## 沙箱环境

### 基础信息

| 项目 | 值 |
|------|-----|
| 沙箱网关 | `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |
| 生产网关 | `https://openapi.alipay.com/gateway.do` |
| 沙箱入口 | 开放平台控制台 > 开发工具 > 沙箱 |
| 沙箱 AppID | 系统自动分配，与正式 AppID 不同 |
| 沙箱账号 | 系统提供买家/卖家测试账号，含虚拟余额 |
| 支持的能力 | 电脑网站支付、APP 支付、当面付、手机网站支付等基础支付能力 |

### 沙箱 vs 生产差异

| 维度 | 沙箱 | 生产 |
|------|------|------|
| 资金流转 | 虚拟资金，不产生真实交易 | 真实资金 |
| 接口覆盖 | 仅支持部分核心支付接口 | 全量接口 |
| 限流策略 | 更严格的频率限制 | 标准限流 |
| 证书/密钥 | 沙箱有独立密钥配置，与生产隔离 | 正式密钥 |
| 返回码/业务逻辑 | 可能与生产有细微差异 | 以线上为准 |
| 数据持久性 | 沙箱数据可能被定期清理 | 永久保留 |

### Java 沙箱初始化示例

```java
CertAlipayRequest certParams = new CertAlipayRequest();
// 关键差异：网关地址改为沙箱
certParams.setServerUrl("https://openapi-sandbox.dl.alipaydev.com/gateway.do");
// 使用沙箱 AppID
certParams.setAppId("沙箱AppID");
// 使用沙箱环境的密钥和证书
certParams.setPrivateKey("沙箱应用私钥");
certParams.setCertPath("/path/to/sandbox/appCertPublicKey.crt");
certParams.setAlipayPublicCertPath("/path/to/sandbox/alipayCertPublicKey_RSA2.crt");
certParams.setRootCertPath("/path/to/sandbox/alipayRootCert.crt");
certParams.setFormat("json");
certParams.setCharset("UTF-8");
certParams.setSignType("RSA2");

AlipayClient sandboxClient = new DefaultAlipayClient(certParams);
```

### 推荐做法：通过配置切换环境

```java
// application.yml
alipay:
  app-id: ${ALIPAY_APP_ID}
  private-key: ${ALIPAY_PRIVATE_KEY}
  gateway: ${ALIPAY_GATEWAY:https://openapi.alipay.com/gateway.do}
  cert-path: ${ALIPAY_CERT_PATH}
  alipay-cert-path: ${ALIPAY_PUBLIC_CERT_PATH}
  root-cert-path: ${ALIPAY_ROOT_CERT_PATH}
```

通过环境变量或 Spring Profile 切换沙箱/生产，避免硬编码网关地址。

## 签名模式详解

### RSA2 强制要求

支付宝已强制要求使用 **RSA2（SHA256withRSA）** 签名算法。RSA1（SHA1withRSA）已被弃用，新应用无法选择 RSA1，老应用也应尽快升级。

| 属性 | RSA1（已弃用） | RSA2（当前标准） |
|------|----------------|------------------|
| 算法 | SHA1withRSA | SHA256withRSA |
| 密钥长度 | 1024 位 | 2048 位 |
| sign_type 参数 | RSA | RSA2 |
| 安全性 | 低（已被破解风险） | 高 |

### 签名串构造规则

1. **筛选**：去除 `sign` 和 `sign_type` 参数，去除值为空的参数
2. **排序**：将剩余参数按参数名 ASCII 码从小到大排序（字典序）
3. **拼接**：使用 `key1=value1&key2=value2&...` 格式拼接（不做 URL Encode）
4. **签名**：使用应用私钥对拼接串进行 SHA256withRSA 签名
5. **编码**：将签名结果进行 Base64 编码，得到 `sign` 参数值

### 验签流程

1. 从响应中提取 `sign` 值
2. 提取待验签内容（响应 JSON 中去掉 `sign` 和 `sign_type` 后的原始字符串）
3. 公钥模式：用支付宝公钥验签；证书模式：从支付宝公钥证书提取公钥验签
4. 比对签名是否一致

> SDK 已封装签名和验签逻辑，正常使用 SDK 无需手动实现。但理解原理有助于排查签名失败问题。

## 关键 API 摘要（初始化相关）

| 类/方法 | 说明 |
|---------|------|
| `CertAlipayRequest` | 证书模式配置对象，设置网关、AppID、私钥、证书路径 |
| `DefaultAlipayClient(CertAlipayRequest)` | 证书模式构造 AlipayClient |
| `DefaultAlipayClient(url, appId, privateKey, format, charset, publicKey, signType)` | 公钥模式构造 |
| `client.certificateExecute(request)` | 证书模式执行 API 调用（**必须用此方法**） |
| `client.execute(request)` | 公钥模式执行 API 调用 |
| `request.setBizContent(json)` | 设置业务参数 JSON |
| `request.setNotifyUrl(url)` | 设置异步通知地址 |
| `request.setReturnUrl(url)` | 设置同步跳转地址 |
| `DCAliPay(...)` | Python 社区版证书模式客户端类 |
| `AliPay(...)` | Python 社区版公钥模式客户端类 |

## 常见陷阱

### 1. 证书模式用了 execute() 而非 certificateExecute()

证书模式初始化的 AlipayClient，调用接口时必须使用 `certificateExecute()`。如果误用 `execute()` 会返回签名验证失败（`INVALID_SIGNATURE`）。这是最高频的接入错误。

### 2. 私钥格式不匹配

Java SDK 要求 **PKCS8** 格式私钥（`-----BEGIN PRIVATE KEY-----`），而密钥工具默认生成 PKCS1 格式（`-----BEGIN RSA PRIVATE KEY-----`）。传入 PKCS1 格式会报 `RSA private key format error`。Python 社区版 SDK 则两种格式都支持。

### 3. 私钥字符串包含头尾和换行

Java SDK 的 `setPrivateKey()` 要求传入**纯 Base64 字符串**，不含 `-----BEGIN...-----` 头尾行和换行符。如果直接读取 PEM 文件内容传入会报错。

```java
// 错误 -- 包含 PEM 头尾
certParams.setPrivateKey("-----BEGIN PRIVATE KEY-----\nMIIEvg...");

// 正确 -- 纯 Base64
certParams.setPrivateKey("MIIEvgIBADANBgkqhkiG9w0BAQ...");
```

### 4. 沙箱密钥和生产密钥混用

沙箱环境和生产环境各有独立的 AppID、密钥、证书。用生产密钥调沙箱网关（或反之）会返回 `INVALID_APP_ID` 或签名失败。切环境时必须**同时切换**网关地址、AppID、密钥和证书文件。

### 5. 字符集不一致

请求中 `charset=UTF-8` 但服务端实际使用 GBK 编码（或反之），会导致中文参数签名不匹配。建议全链路统一使用 **UTF-8**。SDK 初始化时设置的 charset 必须与业务代码编码一致。

### 6. 证书文件过期未更新

支付宝公钥证书有有效期。证书到期后接口调用会失败。开放平台会在证书到期前通知更新，收到通知后需要：
- 登录控制台下载新证书
- 替换服务器上的旧证书文件
- 重启应用使新证书生效

自动化方案：可使用 SDK 提供的证书自动更新能力（v2 SDK 4.35+ 支持 `certAutoUpdate` 参数）。

### 7. SDK 版本过低存在安全漏洞

alipay-sdk-java 4.34.0 之前的版本依赖了存在安全漏洞的 Fastjson 版本。务必确认 SDK 版本 >= 4.34.0。同时，v2 SDK 的 2.8.0.ALL 之前版本无法兼容接口新版本，建议升级至 2.9.0.ALL 以上。

### 8. 沙箱环境能力有限

沙箱仅支持基础支付能力（当面付、APP 支付、网页支付等），不支持花呗分期、信用授权等高级产品。如果在沙箱调用不支持的接口，会返回 `SYSTEM_ERROR` 或 `METHOD_NOT_EXIST`。另外沙箱数据可能被定期清理。

### 9. notify_url 必须为公网可达地址

异步通知地址（notify_url）必须是支付宝服务器能访问到的公网 HTTPS 地址。本地开发时需要使用内网穿透工具。注意：沙箱环境同样要求 notify_url 公网可达。

### 10. 签名串中参数值不做 URL Encode

构造待签名字符串时，参数值使用原始值拼接，**不做 URL Encode**。Encode 后再签名会导致验签失败。SDK 内部已正确处理此逻辑，但如果自行拼接签名串需特别注意。

## 组合提示

| 场景 | 相关 Skill |
|------|-----------|
| 接入完成后调用支付/退款/查询接口 | `alipay-apis` |
| 处理支付宝异步通知（回调验签、幂等处理） | `alipay-notifications` |
| 支付系统安全设计（密钥管理、防重放、金额校验） | `payment-security` |
| 统一支付网关架构（订单状态机、幂等性、多渠道抽象） | `payment-gateway` |
