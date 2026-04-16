---
name: unionpay-onboarding
description: "银联在线支付接入：商户入网、三证书体系（签名/加密/验签）、acp_sdk 配置、签名机制、测试环境。"
tech_stack: [payment, unionpay, backend]
language: [java]
---

# 银联在线支付接入

> 来源：https://open.unionpay.com/tjweb/dev/guide/list  
> 产品文档：https://open.unionpay.com/tjweb/acproduct/list  
> 商户入网：https://open.unionpay.com/tjweb/doc/mchnt/list

## 用途

中国银联全渠道在线支付（网关支付）的商户端接入指南。覆盖从商户入网申请、证书体系配置、SDK 集成到签名验签的完整流程，使开发者能快速完成银联 B2C 网关支付的对接。

## 何时使用

- 新项目需要接入银联在线网关支付（PC / 手机 H5）
- 已有项目从其他支付渠道（支付宝/微信）扩展银联通道
- 排查银联签名校验失败、证书加载异常等问题
- 搭建银联支付测试环境，使用测试商户号和测试卡号验证流程
- 从测试环境迁移到生产环境，需要切换证书和网关地址

## 版本与 SDK

### 协议版本

| 项目 | 值 | 说明 |
|------|-----|------|
| 全渠道协议版本 | `5.1.0` | 请求报文中 `version` 字段固定值 |
| 签名方式 | `01` | 表示 RSA 证书签名（SHA-256） |
| 业务类型（网关支付） | `000201` | B2C 网关支付 |
| 编码 | `UTF-8` | 强烈建议统一使用 UTF-8 |

### Maven 依赖

银联 SDK 未在 Maven Central 正式发布（仅有社区上传版本），**官方推荐从开放平台下载 SDK jar 手动安装到本地仓库**。

```xml
<!-- 方式一：从 Maven Central 获取社区版本（非官方维护） -->
<dependency>
    <groupId>com.unionpay</groupId>
    <artifactId>unionpay-sdk-java</artifactId>
    <version>1.0.0</version>
</dependency>

<!-- 方式二（推荐）：从银联开放平台下载 SDK jar 后安装到本地仓库 -->
<!-- 下载地址：https://open.unionpay.com/tjweb/dev/guide/list -->
<!-- 安装命令： -->
<!--
mvn install:install-file \
  -DgroupId=com.unionpay \
  -DartifactId=acp-sdk \
  -Dversion=6.0.0 \
  -Dpackaging=jar \
  -Dfile=acp-sdk-6.0.0.jar
-->
<dependency>
    <groupId>com.unionpay</groupId>
    <artifactId>acp-sdk</artifactId>
    <version>6.0.0</version>
</dependency>
```

SDK 核心类（`com.unionpay.acp.sdk` 包）：`SDKConfig`（全局配置）、`AcpService`（签名/验签/发送/加解密）、`CertUtil`（证书管理）、`SDKConstants`（常量）。

## 商户入网

### 入网流程

```
1. 注册开放平台账号  →  https://open.unionpay.com
2. 创建应用 / 选择"在线网关支付"产品
3. 提交商户资质（营业执照、法人身份证、银行账户等）
4. 银联审核通过 → 分配商户号（merId）
5. 在"证书管理"中下载三套证书
6. 集成 SDK 并配置证书
7. 使用测试环境联调
8. 联调通过 → 申请上线
```

### 关键标识

| 标识 | 说明 | 示例 |
|------|------|------|
| `merId` | 商户号，15 位数字 | `777290058110097`（测试） |
| `certId` | 证书序列号，SDK 自动从签名证书中提取 | 签名时自动填充 |
| `accessType` | 接入类型，`0` = 直连商户 | 固定 `0` |
| `channelType` | 渠道类型 | `07` = PC，`08` = 手机 |

## 三证书体系

银联采用 **三证书架构**，每个证书承担独立职责，不可混淆：

```
┌─────────────────────────────────────────────────────────────────┐
│                        银联三证书体系                            │
├─────────────────┬──────────────┬────────────────────────────────┤
│  签名证书 (.pfx) │ 加密证书 (.cer) │ 验签证书 (root + middle .cer) │
│  商户私钥        │ 银联公钥       │ 银联根/中级证书               │
│  用途：请求签名   │ 用途：敏感信息  │ 用途：验证银联应答签名         │
│                 │ 加密（卡号等） │                               │
│  格式：PKCS12   │ 格式：X.509   │ 格式：X.509                   │
└─────────────────┴──────────────┴────────────────────────────────┘
```

### 签名证书（.pfx）

- **格式**：PKCS12（.pfx 文件）
- **内容**：商户私钥 + 公钥证书
- **用途**：对请求报文做 SHA256withRSA 签名
- **来源**：商户在开放平台"证书管理"中生成并下载
- **密码**：下载时设置的证书保护密码（测试环境固定 `000000`）
- **安全要求**：仅部署在服务端，**绝对不能暴露到前端或日志中**

```
测试环境文件名示例：acp_test_sign.pfx
生产环境文件名示例：PM_700000000000001_acp.pfx
```

### 加密证书（.cer）

- **格式**：X.509（.cer 文件）
- **内容**：银联公钥
- **用途**：加密敏感信息（卡号、PIN、手机号等）
- **来源**：银联开放平台下载
- **更新机制**：银联会定期更新加密公钥，SDK 支持通过"加密公钥更新查询接口"自动更新

```
测试环境文件名示例：acp_test_enc.cer
```

### 验签证书（root.cer + middle.cer）

- **格式**：X.509（.cer 文件）
- **内容**：银联根证书 + 中级证书
- **用途**：验证银联返回报文的签名合法性
- **来源**：SDK 包中自带，也可从开放平台下载
- **验证链**：根证书 → 中级证书 → 银联签名公钥（从应答中获取）

```
测试环境文件名示例：
  acp_test_root.cer     -- 根证书
  acp_test_middle.cer   -- 中级证书
```

### 证书密码管理

禁止硬编码证书密码。推荐从环境变量 `System.getenv("UNIONPAY_CERT_PWD")` 或 Spring `@Value("${unionpay.cert.password}")` 注入。

**证书目录结构建议**：`certs/unionpay/test/` 和 `certs/unionpay/prod/` 分环境存放，部署时用绝对路径引用。

## acp_sdk.properties 配置

以下是完整配置文件示例，包含所有关键字段：

```properties
##############################################
# 银联全渠道 SDK 配置文件 -- 测试环境
##############################################

# ========== 基本参数 ==========
# 报文版本号（固定 5.1.0，勿改）
acpsdk.version=5.1.0
# 签名方式：01=RSA证书签名（SHA-256）
acpsdk.signMethod=01
# 是否多商户模式（true=单商户，false=多商户）
acpsdk.singleMode=true

# ========== 签名证书（商户私钥 .pfx） ==========
# 证书路径（建议使用绝对路径；classpath 路径需在 SDK 初始化前确认可达）
acpsdk.signCert.path=/app/certs/unionpay/acp_test_sign.pfx
# 证书密码（测试环境固定 000000，生产环境为商户自定义密码）
acpsdk.signCert.pwd=000000
# 证书类型（固定 PKCS12）
acpsdk.signCert.type=PKCS12

# ========== 加密证书（银联公钥 .cer） ==========
# 敏感信息加密证书路径（用于加密卡号、PIN、手机号等）
acpsdk.encryptCert.path=/app/certs/unionpay/acp_test_enc.cer

# ========== 验签证书（银联根证书 + 中级证书） ==========
# 中级证书路径
acpsdk.middleCert.path=/app/certs/unionpay/acp_test_middle.cer
# 根证书路径
acpsdk.rootCert.path=/app/certs/unionpay/acp_test_root.cer

# ========== 交易请求地址（测试环境） ==========
# 前台交易请求地址（用户浏览器跳转）
acpsdk.frontTransUrl=https://gateway.test.95516.com/gateway/api/frontTransReq.do
# 后台交易请求地址（服务端直连）
acpsdk.backTransUrl=https://gateway.test.95516.com/gateway/api/backTransReq.do
# APP 交易请求地址
acpsdk.appTransUrl=https://gateway.test.95516.com/gateway/api/appTransReq.do
# 单笔查询地址
acpsdk.singleQueryUrl=https://gateway.test.95516.com/gateway/api/queryTrans.do
# 批量交易地址
acpsdk.batchTransUrl=https://gateway.test.95516.com/gateway/api/batchTrans.do
# 文件传输地址（对账文件下载等）
acpsdk.fileTransUrl=https://filedownload.test.95516.com/
# 有卡交易地址
acpsdk.cardTransUrl=https://gateway.test.95516.com/gateway/api/cardTransReq.do
# JNDI 名称（在 WebLogic 等容器中使用，可留空）
acpsdk.jndi.name=

# ========== 安全验证开关 ==========
# 是否验证验签证书的 CN（测试环境 false，生产环境必须 true）
acpsdk.ifValidateCNName=false
# 是否验证 HTTPS 服务端证书（测试环境 false，生产环境必须 true）
acpsdk.ifValidateRemoteCert=false
```

**生产环境差异**：域名改为 `gateway.95516.com`（去掉 `.test`）、`filedownload.95516.com`；`ifValidateCNName` 和 `ifValidateRemoteCert` 必须改为 `true`。

## 签名机制

### SHA-256 + RSA 签名流程

```
1. 收集所有非空参数（排除 signature 字段本身）
2. 按参数名 ASCII 码升序排序
3. 拼接为 key1=value1&key2=value2 格式（值做 URL encode）
4. 对拼接串做 SHA-256 摘要 → 得到 32 字节哈希
5. 用商户签名私钥（.pfx 中）对哈希做 RSA 签名
6. Base64 编码签名结果 → 赋值给 signature 字段
```

### SDK 签名/验签 API

```java
// 签名：SDK 自动完成排序→拼接→SHA256摘要→RSA签名→Base64，并设置 certId 和 signature
Map<String, String> signedParams = AcpService.sign(contentData, "UTF-8");

// 验签：验证银联返回报文签名（内部处理证书链验证）
boolean valid = AcpService.validate(respData, "UTF-8");
```

## SDK 初始化 -- Java

### Spring Boot 集成

```java
import com.unionpay.acp.sdk.SDKConfig;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** 应用启动时加载 acp_sdk.properties（必须放在 classpath 根路径） */
@Component
public class UnionPaySdkInitializer implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        SDKConfig.getConfig().loadPropertiesFromSrc();
    }
}
```

### 网关支付（前台消费）完整示例

```java
import com.unionpay.acp.sdk.AcpService;
import com.unionpay.acp.sdk.SDKConfig;
import com.unionpay.acp.sdk.SDKConstants;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Service
public class UnionPayService {

    /** 前台网关消费 -- 返回自动提交的 HTML 表单，前端渲染后跳转银联收银台 */
    public String createFrontOrder(String orderId, String txnAmt,
                                   String frontUrl, String backUrl) {

        Map<String, String> contentData = new HashMap<>();

        // === 报文头 ===
        contentData.put("version", "5.1.0");           // 版本号（固定）
        contentData.put("encoding", "UTF-8");           // 编码
        contentData.put("signMethod", "01");            // 签名方式（RSA）
        contentData.put("txnType", "01");               // 交易类型：01=消费
        contentData.put("txnSubType", "01");            // 交易子类型：01=自助消费
        contentData.put("bizType", "000201");            // 业务类型：B2C网关支付
        contentData.put("channelType", "07");            // 渠道类型：07=PC

        // === 商户信息 ===
        contentData.put("merId", "777290058110097");     // 商户号
        contentData.put("accessType", "0");              // 接入类型：0=直连商户
        contentData.put("orderId", orderId);             // 商户订单号
        contentData.put("txnAmt", txnAmt);               // 交易金额（分）
        contentData.put("currencyCode", "156");          // 交易币种：156=人民币

        // === 时间与通知 ===
        contentData.put("txnTime",
                new SimpleDateFormat("yyyyMMddHHmmss").format(new Date()));
        contentData.put("frontUrl", frontUrl);           // 前台通知地址
        contentData.put("backUrl", backUrl);             // 后台通知地址

        // === 签名（SDK 自动填充 certId 和 signature） ===
        Map<String, String> signedData =
                AcpService.sign(contentData, "UTF-8");

        // === 生成自动提交的 HTML 表单 ===
        String requestFrontUrl =
                SDKConfig.getConfig().getFrontRequestUrl();
        String html = AcpService.createAutoFormHtml(
                requestFrontUrl, signedData, "UTF-8");

        return html;
    }

    /** 处理银联后台异步通知 -- 必须先验签 */
    public boolean handleBackNotify(Map<String, String> notifyParams) {
        if (!AcpService.validate(notifyParams, "UTF-8")) {
            return false; // 验签失败，拒绝处理
        }
        String respCode = notifyParams.get("respCode");
        String queryId  = notifyParams.get("queryId");  // 银联流水号
        if ("00".equals(respCode)) {
            // TODO: 更新订单状态，respCode=00 表示交易成功
            return true;
        }
        return false;
    }

    /** 主动查询订单状态（对账 / 超时补查） */
    public Map<String, String> queryOrder(String orderId, String txnTime) {

        Map<String, String> data = new HashMap<>();
        data.put("version", "5.1.0");
        data.put("encoding", "UTF-8");
        data.put("signMethod", "01");
        data.put("txnType", "00");                   // 00=查询
        data.put("txnSubType", "00");
        data.put("bizType", "000201");
        data.put("merId", "777290058110097");
        data.put("accessType", "0");
        data.put("orderId", orderId);
        data.put("txnTime", txnTime);

        Map<String, String> signedData = AcpService.sign(data, "UTF-8");

        String queryUrl = SDKConfig.getConfig().getSingleQueryUrl();
        Map<String, String> respData =
                AcpService.post(signedData, queryUrl, "UTF-8");

        if (respData != null
                && AcpService.validate(respData, "UTF-8")) {
            return respData;
        }
        return null;
    }
}
```

### Controller 要点

```java
@RestController
@RequestMapping("/api/pay/unionpay")
public class UnionPayController {
    @Autowired private UnionPayService unionPayService;

    /** 后台通知入口 -- 必须返回 "ok" 文本 */
    @PostMapping("/notify")
    public String backNotify(HttpServletRequest request) {
        Map<String, String> params = new HashMap<>();
        Enumeration<String> names = request.getParameterNames();
        while (names.hasMoreElements()) {
            String n = names.nextElement();
            params.put(n, request.getParameter(n));
        }
        unionPayService.handleBackNotify(params);
        return "ok";  // 验签通过即返回 ok，否则银联持续重推
    }
}
```

## 测试环境

### 测试网关地址

| 用途 | 地址 |
|------|------|
| 前台交易 | `https://gateway.test.95516.com/gateway/api/frontTransReq.do` |
| 后台交易 | `https://gateway.test.95516.com/gateway/api/backTransReq.do` |
| APP 交易 | `https://gateway.test.95516.com/gateway/api/appTransReq.do` |
| 单笔查询 | `https://gateway.test.95516.com/gateway/api/queryTrans.do` |
| 文件下载 | `https://filedownload.test.95516.com/` |

> 备用 IP 地址（DNS 无法解析时使用）：`https://101.231.204.80:5000/gateway/api/...`

### 测试商户号

| 商户号 | 用途 |
|--------|------|
| `777290058110097` | 测试商户号（网关支付） |
| `777290058112538` | 测试商户号（备用） |

测试证书密码统一为 `000000`。

### 测试卡号

| 卡号 | 卡类型 | 发卡行 | 说明 |
|------|--------|--------|------|
| `6221558812340000` | 贷记卡（信用卡） | 平安银行 | 常用测试卡 |
| `6216261000000000018` | 借记卡（储蓄卡） | 平安银行 | 常用测试卡 |
| `6222600100001232067` | 借记卡 | 工商银行 | 备用 |

**测试卡统一信息**：

| 字段 | 值 |
|------|-----|
| 持卡人姓名 | `全渠道` |
| 身份证号 | `341126197709218366` |
| 手机号 | `13552535506` |
| 密码 | `123456`（借记卡需要） |
| 短信验证码 | `111111`（6 个 1） |
| CVN2（信用卡背面） | `123` |
| 有效期（信用卡） | `1233`（MMYY 格式，即 2033 年 12 月） |

### 测试与生产差异对照

| 项目 | 测试环境 | 生产环境 |
|------|---------|---------|
| 网关域名 | `gateway.test.95516.com` | `gateway.95516.com` |
| 签名证书 | `acp_test_sign.pfx`（密码 `000000`） | 从 CFCA 下载的正式证书 |
| 加密证书 | `acp_test_enc.cer` | 生产加密公钥证书 |
| 验签证书 | 测试根/中级证书 | 生产根/中级证书 |
| 商户号 | `777290058110097` | 银联分配的正式商户号 |
| `ifValidateCNName` | `false` | **`true`（必须）** |
| `ifValidateRemoteCert` | `false` | **`true`（必须）** |
| 交易资金 | 不扣款 | 真实扣款 |

## 常见陷阱

### 1. 证书路径加载失败

SDK 通过 `SDKConfig.getConfig().loadPropertiesFromSrc()` 从 classpath 加载 `acp_sdk.properties`，但 **Spring Boot 打 fat jar 后 classpath 路径行为变化**，可能导致证书路径找不到文件。

**解决方案**：证书文件使用**绝对路径**；或在部署时将证书文件放在 jar 包外的固定目录，通过 `-Dacpsdk.signCert.path=/app/certs/xxx.pfx` 覆盖。

### 2. 编码不一致导致签名失败

签名串构造时的编码必须与 `encoding` 参数一致。如果项目中部分模块使用 GBK、部分使用 UTF-8，会导致签名串不一致。

**解决方案**：统一全项目为 UTF-8。acp_sdk.properties、Java 源文件、请求参数编码、Servlet 容器编码全部统一为 UTF-8。

### 3. 金额单位是"分"不是"元"

`txnAmt` 字段单位为**分**。1 元 = `100`，不是 `1` 也不是 `1.00`。传错单位会导致实际扣款金额与预期不符（测试环境不扣款，很容易忽略此问题到生产才暴露）。

### 4. orderId 格式限制

商户订单号 `orderId` 长度 8-40 位，只能包含数字和字母，**不能包含短横线 `-`、下划线 `_` 等特殊字符**。不符合规则的订单号会被银联网关直接拒绝。

### 5. 后台通知必须返回 "ok"

银联后台通知（backUrl）在商户端返回非 `ok` 文本时，会持续重推（间隔递增，最多 5 次）。**即使业务处理失败，只要验签通过就应该返回 `ok`**，业务失败靠自己的重试/补偿机制处理。

### 6. 前台通知不可靠，不能作为支付成功依据

前台通知（frontUrl）是浏览器 302 跳转，**用户关闭浏览器、网络断开都会导致前台通知丢失**。支付结果必须以后台通知（backUrl）或主动查询为准。

### 7. 测试环境证书在生产环境无法使用

测试证书和生产证书是**完全不同的密钥对**。测试环境调通后上线前必须替换为从 CFCA 下载的正式证书，同时更换网关地址和商户号。忘记替换是最常见的上线事故之一。

### 8. 多商户号时 singleMode 必须设为 false

如果同一个应用对接多个银联商户号（如不同业务线使用不同商户号），必须在 acp_sdk.properties 中设置 `acpsdk.singleMode=false`，并在代码中传入不同的证书路径和密码：

```java
// 多商户模式签名
Map<String, String> signed = AcpService.signByCertInfo(
    contentData,
    "/path/to/merchant_A.pfx",   // 商户 A 的证书路径
    "certPassword",               // 商户 A 的证书密码
    "UTF-8"
);
```

### 9. 加密公钥需要定期更新

银联会定期轮换加密公钥。如果不更新加密证书，敏感信息加密会使用过期的公钥，导致银联侧解密失败。SDK 提供了加密公钥更新查询接口，建议在定时任务中调用。

### 10. 验签时不要手动验证，使用 SDK 方法

银联验签涉及证书链验证（根证书 → 中级证书 → 签名证书），手动实现容易出错。务必使用 `AcpService.validate()` 方法，它会处理证书链验证和签名校验的全部逻辑。

### 11. txnTime 格式和时区

`txnTime` 必须是 `yyyyMMddHHmmss` 格式（14 位数字），使用东八区（UTC+8）时间。服务器部署在海外时需要注意时区设置，否则银联可能因时间偏差过大拒绝交易。

## 组合提示

| 相关 Skill | 用途 |
|------------|------|
| `payment-security` | RSA/SHA-256 签名验签原理、证书管理最佳实践、PCI DSS 合规要求 |
| `unionpay-apis` | 银联各交易接口详细字段说明（消费、退货、撤销、预授权等） |
| `payment-gateway` | 支付网关架构设计、多渠道路由、幂等性保障、异步通知处理模式 |
| `payment-reconciliation` | 银联对账文件下载与解析、资金核对流程 |
| `payment-resilience` | 支付超时重试策略、补偿机制、掉单恢复 |
