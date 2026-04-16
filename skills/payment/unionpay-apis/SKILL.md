---
name: unionpay-apis
description: "银联支付 API：网关支付、无跳转支付、手机控件支付、二维码支付、交易查询与退货。"
tech_stack: [payment, unionpay, backend]
language: [java]
---

# 银联在线支付 API

> 来源：[中国银联开放平台](https://open.unionpay.com/tjweb/dev/guide/list)
> 版本基准：全渠道平台接口规范 V6.0.0（2024+）

## 用途

银联在线支付 API 是中国银联面向收单机构和商户提供的线上支付能力集，覆盖 PC 网关支付、手机控件支付、无跳转（Token）支付、二维码主扫/被扫等主流线上收款场景。通过银联 Java SDK（AcpService）完成签名、验签、报文组装和 HTTP 通信。

## 何时使用

- PC/Mobile 浏览器端收款：使用**网关支付**（前台跳转银联收银台）
- 移动 APP 原生收款：使用**手机控件支付**（SDK 调起银联支付控件）
- 免密/快捷支付场景：使用**无跳转支付**（Token 模式，用户无需跳转）
- 线下扫码收款线上化：使用**二维码支付**（主扫 C2B / 被扫 B2C）
- 交易结果确认与对账：使用**交易查询**接口
- 全额或部分退款：使用**退货**接口

---

## API 总览表

| 产品 | 接口类型 | txnType | txnSubType | bizType | channelType | 适用场景 |
|------|---------|---------|-----------|---------|------------|---------|
| 网关支付（PC） | 前台 frontTransReq | 01 | 01 | 000201 | 07 | PC/平板浏览器 |
| 网关支付（WAP） | 前台 frontTransReq | 01 | 01 | 000201 | 07 | 手机浏览器 |
| 无跳转支付 | 后台 backTransReq | 01 | 01 | 000301 | 07 | 免密/Token 支付 |
| 手机控件支付 | APP appTransReq | 01 | 01 | 000201 | 08 | 移动 APP |
| 二维码-被扫（B2C） | 后台 backTransReq | 01 | 06 | 000000 | 08 | 用户扫商户码 |
| 二维码-主扫（C2B） | 后台 backTransReq | 01 | 07 | 000000 | 08 | 商户扫用户码 |
| 交易查询 | 查询 queryTrans | 00 | 00 | 000000 | -- | 主动查单 |
| 退货（退款） | 后台 backTransReq | 04 | 00 | 000000 | -- | 全额/部分退款 |
| 消费撤销 | 后台 backTransReq | 31 | 00 | 000000 | -- | 当日撤销 |
| 预授权 | 前台 frontTransReq | 02 | 01 | 000201 | 07 | 酒店/租车预授权 |
| 预授权完成 | 后台 backTransReq | 03 | 01 | 000201 | -- | 预授权扣款 |

---

## 接口端点

| 接口 | 测试环境 | 生产环境 |
|------|---------|---------|
| 前台交易 | `https://gateway.test.95516.com/gateway/api/frontTransReq.do` | `https://gateway.95516.com/gateway/api/frontTransReq.do` |
| 后台交易 | `https://gateway.test.95516.com/gateway/api/backTransReq.do` | `https://gateway.95516.com/gateway/api/backTransReq.do` |
| APP 交易 | `https://gateway.test.95516.com/gateway/api/appTransReq.do` | `https://gateway.95516.com/gateway/api/appTransReq.do` |
| 交易查询 | `https://gateway.test.95516.com/gateway/api/queryTrans.do` | `https://gateway.95516.com/gateway/api/queryTrans.do` |
| 批量交易 | `https://gateway.test.95516.com/gateway/api/batchTransReq.do` | `https://gateway.95516.com/gateway/api/batchTransReq.do` |

> 测试环境与生产环境仅域名不同：`gateway.test.95516.com` vs `gateway.95516.com`。

---

## 公共字段参考表

以下字段在几乎所有交易类型中都需要上送。

| 字段 | 值/格式 | 说明 |
|------|--------|------|
| `version` | `6.0.0` | 接口版本号（当前主流版本） |
| `encoding` | `UTF-8` | 报文编码 |
| `signMethod` | `01` | 签名方式：01=RSA-SHA256 证书方式 |
| `txnType` | 见总览表 | 交易类型 |
| `txnSubType` | 见总览表 | 交易子类型 |
| `bizType` | 见总览表 | 产品业务类型 |
| `channelType` | `07`/`08` | 渠道类型：07=PC/平板，08=手机 |
| `accessType` | `0` | 接入类型：0=商户直连，1=收单机构，2=平台商户 |
| `merId` | 15 位数字 | 商户号（银联分配） |
| `orderId` | 8-40 位字母数字 | 商户订单号（同一商户同一天内不可重复） |
| `txnTime` | `yyyyMMddHHmmss` | 订单发送时间（商户服务器时间） |
| `txnAmt` | 正整数字符串 | 交易金额，**单位：分**（100 = 1 元） |
| `currencyCode` | `156` | 币种：156=人民币 |
| `frontUrl` | HTTPS URL | 前台回调地址（浏览器跳转，仅前台交易需要） |
| `backUrl` | HTTPS URL | 后台通知地址（服务器对服务器，**必填**） |
| `certId` | -- | 签名证书序列号（SDK 自动填充） |
| `signature` | -- | 签名值（SDK 自动填充） |

### 交易类型码完整对照表

| txnType | 含义 | 备注 |
|---------|------|------|
| `00` | 查询交易 | 单笔查询/批量查询 |
| `01` | 消费 | 即时扣款 |
| `02` | 预授权 | 冻结资金 |
| `03` | 预授权完成 | 预授权扣款 |
| `04` | 退货 | 退款（可部分退） |
| `05` | 圈存 | 电子钱包充值 |
| `14` | 退货撤销 | 撤销退货操作 |
| `31` | 消费撤销 | 仅限当日交易 |
| `32` | 预授权撤销 | 释放冻结资金 |
| `33` | 预授权完成撤销 | 撤销预授权扣款 |
| `71` | 余额查询 | 查卡片余额 |
| `72` | 实名认证 | 银行卡四要素验证 |
| `73` | 账单查询 | 信用卡账单 |
| `74` | 账单缴费 | 信用卡还款 |
| `75` | 订购 | 代扣签约 |
| `76` | 退订 | 代扣解约 |
| `77` | 发送短信 | 无跳转支付发验证码 |

---

## 网关支付（PC/Mobile）

网关支付通过前台表单 POST 将用户浏览器重定向到银联收银台页面完成支付。

### 支付流程

```
商户页面 → 生成 HTML 表单(hidden fields) → POST 到银联前台网关
→ 用户在银联页面输入卡号/密码 → 支付完成
→ 浏览器跳转回 frontUrl（前台回调）
→ 银联服务器 POST 到 backUrl（后台通知）
```

### Java 代码示例

```java
import com.unionpay.acp.sdk.AcpService;
import com.unionpay.acp.sdk.SDKConfig;

/**
 * 网关支付 - 前台消费交易
 */
public String gatewayPay(String orderId, String txnAmt) {
    Map<String, String> data = new HashMap<>();

    // --- 公共报文头 ---
    data.put("version", SDKConfig.getConfig().getVersion());   // 6.0.0
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");                               // RSA-SHA256
    data.put("txnType", "01");                                  // 消费
    data.put("txnSubType", "01");                               // 自助消费
    data.put("bizType", "000201");                              // B2C 网关支付
    data.put("channelType", "07");                              // PC/平板

    // --- 商户信息 ---
    data.put("merId", "777290058110048");                       // 商户号
    data.put("accessType", "0");                                // 商户直连
    data.put("orderId", orderId);                               // 商户订单号
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));                                // 订单发送时间
    data.put("txnAmt", txnAmt);                                // 交易金额（分）
    data.put("currencyCode", "156");                            // 人民币

    // --- 回调地址 ---
    data.put("frontUrl", "https://merchant.com/pay/front-callback");  // 前台通知
    data.put("backUrl", "https://merchant.com/pay/back-notify");      // 后台通知

    // 签名（SDK 自动读取证书、计算签名并填充 certId + signature）
    AcpService.sign(data, "UTF-8");

    // 生成自动提交的 HTML 表单
    String frontTransUrl = SDKConfig.getConfig().getFrontTransUrl();
    String html = AcpService.createAutoFormHtml(
            frontTransUrl, data, "UTF-8");

    // 将 html 写入 HttpServletResponse 即可跳转银联收银台
    return html;
}
```

### 前台回调 vs 后台通知

| 特性 | frontUrl（前台回调） | backUrl（后台通知） |
|------|---------------------|-------------------|
| 触发方式 | 浏览器 302 重定向 | 银联服务器 POST |
| 可靠性 | **不可靠**（用户可能关闭页面） | **可靠**（银联重试机制） |
| 用途 | 页面跳转展示支付结果 | 更新订单状态（以此为准） |
| 参数位置 | URL query + form fields | HTTP body（form-urlencoded） |
| 验签 | 必须验签 | 必须验签 |

> **关键原则**：前台回调仅用于展示，**订单状态变更必须以后台通知为准**。

### 后台通知处理

```java
/**
 * 接收银联后台通知（backUrl 对应的接口）
 */
@PostMapping("/pay/back-notify")
public String handleNotify(HttpServletRequest request) {
    Map<String, String> respData = AcpService.getAllRequestParam(request);

    // 1. 验签（必须！不验签直接处理是严重安全漏洞）
    if (!AcpService.validate(respData, "UTF-8")) {
        log.error("银联通知验签失败: {}", respData);
        return "fail";
    }

    String orderId   = respData.get("orderId");
    String respCode  = respData.get("respCode");
    String queryId   = respData.get("queryId");    // 银联交易流水号
    String txnAmt    = respData.get("txnAmt");

    // 2. 判断交易状态
    if ("00".equals(respCode)) {
        // 交易成功 —— 更新订单状态
        orderService.markPaid(orderId, queryId, txnAmt);
    } else if ("03".equals(respCode) || "04".equals(respCode)
            || "05".equals(respCode)) {
        // 交易处理中 —— 需要发起交易查询确认最终状态
        orderService.markPending(orderId);
        queryScheduler.scheduleQuery(orderId);
    } else {
        // 交易失败
        orderService.markFailed(orderId, respCode, respData.get("respMsg"));
    }

    // 3. 必须返回 "ok"，否则银联会持续重发通知
    return "ok";
}
```

---

## 手机控件支付

手机控件支付分为两个阶段：服务端获取 TN（交易流水号），客户端 SDK 使用 TN 调起支付控件。

### 支付流程

```
APP → 请求商户服务端 → 服务端调 appTransReq 获取 TN
→ 返回 TN 给 APP → APP 调银联 SDK startPay(tn)
→ 用户在银联控件中完成支付
→ 银联 POST 到 backUrl（后台通知）
```

### 服务端获取 TN

```java
/**
 * 手机控件支付 - 服务端获取 TN
 */
public String getAppTn(String orderId, String txnAmt) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "01");              // 消费
    data.put("txnSubType", "01");           // 自助消费
    data.put("bizType", "000201");          // B2C 网关支付
    data.put("channelType", "08");          // 手机

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));
    data.put("txnAmt", txnAmt);
    data.put("currencyCode", "156");

    // 控件支付无需 frontUrl，只需 backUrl
    data.put("backUrl", "https://merchant.com/pay/back-notify");

    AcpService.sign(data, "UTF-8");

    // 向银联 APP 交易端点发送请求
    String appTransUrl = SDKConfig.getConfig().getAppTransUrl();
    Map<String, String> respData = AcpService.post(data, appTransUrl, "UTF-8");

    if (respData != null && "00".equals(respData.get("respCode"))) {
        // 返回 TN 给客户端
        return respData.get("tn");
    }
    throw new PayException("获取 TN 失败: " + respData);
}
```

### 客户端调用（Android 示例）

```java
// Android 端使用银联 SDK
UPPayAssistEx.startPay(activity, null, null, tn, "00" /* 00=正式 01=测试 */);
```

```java
// iOS 端使用银联 SDK
[UPPaymentControl startPay:tn
               fromScheme:@"your.app.scheme"
                     mode:@"00"
            viewController:self];
```

---

## 无跳转支付（Token 模式）

无跳转支付允许用户在商户页面直接完成支付，无需跳转银联收银台。适用于已开通（绑卡）的用户进行快捷支付。

### 业务流程

```
1. 开通（绑卡）：用户输入卡号 → 发短信验证码 → 验证通过 → 获取 Token
2. 消费：使用 Token 发起后台消费 → 发短信验证码 → 提交支付
```

### 开通交易（获取 Token）

```java
/**
 * 无跳转支付 - 开通（银联侧 Token）
 */
public Map<String, String> openCard(String orderId, String accNo) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "79");              // 开通交易
    data.put("txnSubType", "00");
    data.put("bizType", "000301");          // 认证支付 2.0
    data.put("channelType", "07");

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));

    // 卡号需加密
    data.put("accNo", AcpService.encryptData(accNo, "UTF-8"));
    data.put("backUrl", "https://merchant.com/pay/back-notify");

    AcpService.sign(data, "UTF-8");

    String backTransUrl = SDKConfig.getConfig().getBackTransUrl();
    return AcpService.post(data, backTransUrl, "UTF-8");
    // 响应中包含 tokenPayData（含 token 信息），保存供后续消费使用
}
```

### Token 消费交易

```java
/**
 * 无跳转支付 - Token 消费
 */
public Map<String, String> tokenPay(String orderId, String txnAmt,
                                     String token, String trId) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "01");              // 消费
    data.put("txnSubType", "01");
    data.put("bizType", "000301");          // 认证支付 2.0
    data.put("channelType", "07");

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));
    data.put("txnAmt", txnAmt);
    data.put("currencyCode", "156");

    // Token 支付数据（JSON 格式）
    String tokenPayData = "{\"token\":\"" + token + "\","
            + "\"trId\":\"" + trId + "\"}";
    data.put("tokenPayData", tokenPayData);

    data.put("backUrl", "https://merchant.com/pay/back-notify");

    AcpService.sign(data, "UTF-8");

    String backTransUrl = SDKConfig.getConfig().getBackTransUrl();
    return AcpService.post(data, backTransUrl, "UTF-8");
}
```

---

## 二维码支付

### 被扫（B2C）- 用户扫商户码

商户生成订单二维码，用户使用云闪付或银联合作 APP 扫码完成支付。

```java
/**
 * 二维码被扫 - 申请消费二维码（用户扫商户码）
 */
public String createQrCode(String orderId, String txnAmt) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "01");              // 消费
    data.put("txnSubType", "07");           // 申请消费二维码
    data.put("bizType", "000000");          // 二维码支付
    data.put("channelType", "08");          // 手机

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));
    data.put("txnAmt", txnAmt);
    data.put("currencyCode", "156");

    data.put("backUrl", "https://merchant.com/pay/back-notify");

    AcpService.sign(data, "UTF-8");

    String backTransUrl = SDKConfig.getConfig().getBackTransUrl();
    Map<String, String> respData = AcpService.post(
            data, backTransUrl, "UTF-8");

    if (respData != null && "00".equals(respData.get("respCode"))) {
        // qrCode 为二维码 URL，商户需将其生成二维码图片展示给用户
        return respData.get("qrCode");
    }
    throw new PayException("生成二维码失败: " + respData);
}
```

### 主扫（C2B）- 商户扫用户码

用户在云闪付 APP 中出示付款码，商户扫描后提交到后台完成扣款。

```java
/**
 * 二维码主扫 - 消费（商户扫用户码）
 */
public Map<String, String> scanUserQr(String orderId, String txnAmt,
                                       String qrNo) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "01");              // 消费
    data.put("txnSubType", "06");           // 二维码消费（主扫）
    data.put("bizType", "000000");          // 二维码支付
    data.put("channelType", "08");          // 手机

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));
    data.put("txnAmt", txnAmt);
    data.put("currencyCode", "156");

    // qrNo 为扫描用户付款码得到的码值（C2B 码，1-20 位数字）
    data.put("qrNo", qrNo);
    data.put("backUrl", "https://merchant.com/pay/back-notify");

    AcpService.sign(data, "UTF-8");

    String backTransUrl = SDKConfig.getConfig().getBackTransUrl();
    return AcpService.post(data, backTransUrl, "UTF-8");
}
```

---

## 交易查询

交易查询用于主动确认交易最终状态，建议在以下场景使用：
- 前台交易：5 分钟内未收到后台通知
- 后台交易：1 秒内未收到响应
- respCode 为 `03`/`04`/`05`（交易处理中）

```java
/**
 * 单笔交易查询
 */
public Map<String, String> queryTransaction(String orderId, String txnTime) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "00");              // 查询
    data.put("txnSubType", "00");
    data.put("bizType", "000000");

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", orderId);           // 原交易订单号
    data.put("txnTime", txnTime);           // 原交易发送时间

    AcpService.sign(data, "UTF-8");

    String queryTransUrl = SDKConfig.getConfig().getSingleQueryUrl();
    Map<String, String> respData = AcpService.post(
            data, queryTransUrl, "UTF-8");

    return respData;
}
```

### 查询响应关键字段

| 字段 | 说明 |
|------|------|
| `respCode` | 查询交易本身的应答码（`00`=查询成功） |
| `origRespCode` | **原交易**的应答码（`00`=支付成功） |
| `origRespMsg` | 原交易的应答描述 |
| `queryId` | 银联交易流水号（退货时需要用到） |
| `traceNo` | 系统跟踪号 |
| `settleAmt` | 清算金额 |
| `settleCurrencyCode` | 清算币种 |
| `settleDate` | 清算日期 |
| `traceTime` | 交易传输时间 |

> **注意**：`respCode` 表示查询请求是否成功，`origRespCode` 才是原始交易的真实状态。判断支付结果应以 `origRespCode` 为准。

### 查询结果判断逻辑

```java
public PayStatus parseQueryResult(Map<String, String> respData) {
    String respCode = respData.get("respCode");

    if (!"00".equals(respCode)) {
        // 查询本身失败，稍后重试
        return PayStatus.QUERY_FAILED;
    }

    String origRespCode = respData.get("origRespCode");
    if ("00".equals(origRespCode)) {
        return PayStatus.SUCCESS;
    } else if ("03".equals(origRespCode) || "04".equals(origRespCode)
            || "05".equals(origRespCode)) {
        // 仍在处理中，继续轮询
        return PayStatus.PROCESSING;
    } else {
        // 明确失败
        return PayStatus.FAILED;
    }
}
```

---

## 退货（退款）

退货使用后台交易 `backTransReq`，txnType=`04`。支持**全额退货**和**部分退货**，需通过 `origQryId` 关联原消费交易。

### Java 代码示例

```java
/**
 * 退货（退款）
 * @param origQryId 原消费交易的 queryId（从支付通知或查询接口获取）
 * @param refundOrderId 退货订单号（商户自行生成，不可与原订单号相同）
 * @param refundAmt 退货金额（分），不能超过原交易金额
 */
public Map<String, String> refund(String origQryId, String refundOrderId,
                                   String refundAmt) {
    Map<String, String> data = new HashMap<>();

    data.put("version", SDKConfig.getConfig().getVersion());
    data.put("encoding", "UTF-8");
    data.put("signMethod", "01");
    data.put("txnType", "04");              // 退货
    data.put("txnSubType", "00");
    data.put("bizType", "000000");

    data.put("merId", "777290058110048");
    data.put("accessType", "0");
    data.put("orderId", refundOrderId);     // 退货订单号（新生成）
    data.put("txnTime", new SimpleDateFormat("yyyyMMddHHmmss")
            .format(new Date()));
    data.put("txnAmt", refundAmt);          // 退货金额（分）
    data.put("currencyCode", "156");

    // 关联原交易
    data.put("origQryId", origQryId);
    data.put("backUrl", "https://merchant.com/pay/refund-notify");

    AcpService.sign(data, "UTF-8");

    String backTransUrl = SDKConfig.getConfig().getBackTransUrl();
    return AcpService.post(data, backTransUrl, "UTF-8");
}
```

### 退货要点

- **origQryId 必填**：来自原消费交易的 `queryId`，在支付成功的后台通知或交易查询响应中获取
- **部分退货**：`txnAmt` 填写需退金额（单位分），可多次退货，累计不超过原交易金额
- **退货订单号**：`orderId` 必须是新生成的订单号，不能复用原消费订单号
- **退货时效**：一般在原交易后 1 年内可发起退货（具体取决于收单机构配置）
- **退货结果**：退货为异步处理，需通过后台通知或主动查询确认退货结果

---

## 签名与验签

银联全渠道采用 **RSA-SHA256** 证书签名方式。

### 证书体系

| 证书 | 格式 | 用途 |
|------|------|------|
| 签名证书 | `.pfx`（PKCS12） | 商户请求签名（私钥） |
| 验签中级证书 | `.cer` | 验证银联响应签名（公钥链） |
| 验签根证书 | `.cer` | 证书链根节点 |
| 加密证书 | `.cer` | 敏感信息加密（如卡号） |

### SDK 配置文件（acp_sdk.properties）

```properties
# 签名证书（PKCS12 格式）
acpsdk.signCert.path=/path/to/certs/acp_test_sign.pfx
acpsdk.signCert.pwd=000000
acpsdk.signCert.type=PKCS12

# 验签中级证书
acpsdk.middleCert.path=/path/to/certs/acp_test_middle.cer

# 验签根证书
acpsdk.rootCert.path=/path/to/certs/acp_test_root.cer

# 敏感信息加密证书（无跳转支付加密卡号用）
acpsdk.encryptCert.path=/path/to/certs/acp_test_enc.cer

# 签名方式：01=RSA  11=SM2（国密）
acpsdk.signMethod=01

# 接口版本
acpsdk.version=6.0.0

# 前台交易请求地址
acpsdk.frontTransUrl=https://gateway.test.95516.com/gateway/api/frontTransReq.do

# 后台交易请求地址
acpsdk.backTransUrl=https://gateway.test.95516.com/gateway/api/backTransReq.do

# APP 交易请求地址
acpsdk.appTransUrl=https://gateway.test.95516.com/gateway/api/appTransReq.do

# 单笔查询请求地址
acpsdk.singleQueryUrl=https://gateway.test.95516.com/gateway/api/queryTrans.do
```

### 签名流程（SDK 内部逻辑）

```
1. 取报文中 signature 以外的所有字段
2. 按字段名 ASCII 排序，拼接为 key1=value1&key2=value2&...
3. 对拼接串做 SHA-256 摘要
4. 用商户签名私钥对摘要做 RSA 签名
5. 签名结果 Base64 编码后填入 signature 字段
6. certId 字段自动填充证书序列号
```

### 验签流程

```java
// SDK 封装了验签，一行调用即可
boolean valid = AcpService.validate(respData, "UTF-8");
if (!valid) {
    throw new SecurityException("银联响应验签失败");
}
```

---

## 常见陷阱

### 1. orderId 唯一性约束

orderId 在**同一商户号、同一交易日**内必须唯一。重复的 orderId 会被银联拒绝。建议使用 "日期 + 业务序号" 的组合策略，如 `20240101000001`。

### 2. txnAmt 单位是分，不是元

`txnAmt` 的单位是**分**（cent），且必须为**不带小数点的正整数字符串**。1 元 = `"100"`，0.01 元 = `"1"`。传入 `"1.00"` 或 `"100.00"` 会导致交易失败。

### 3. txnTime 时区问题

`txnTime` 必须使用**北京时间**（UTC+8），格式 `yyyyMMddHHmmss`。服务器如果部署在海外或使用 UTC 时区，需要显式指定时区：

```java
SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMddHHmmss");
sdf.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
String txnTime = sdf.format(new Date());
```

### 4. frontUrl 回调不可靠

前台回调（frontUrl）依赖浏览器重定向，用户可能在支付完成后直接关闭页面，导致前台回调永远不会触发。**绝对不要**以前台回调作为订单状态变更的依据，必须以后台通知（backUrl）为准。

### 5. 后台通知 backUrl 不能带查询参数

`backUrl` 如果包含 `?` 参数（如 `http://host/notify?type=pay&channel=unionpay`），银联回调时会将交易参数追加到 URL 中。在验签前必须将自定义参数剥离，否则**验签一定失败**。最佳实践：`backUrl` 使用纯净路径，不带任何查询参数。

### 6. 退货的 origQryId 不是 orderId

退货接口需要传入原交易的 `queryId`（银联交易流水号），不是商户的 `orderId`。`queryId` 只能从支付成功的后台通知或交易查询响应中获取。务必在支付成功时持久化 `queryId`。

### 7. 测试环境与生产环境证书不通用

测试环境和生产环境使用**完全不同的证书**。上线前必须替换为生产证书，同时修改 `acp_sdk.properties` 中的网关地址（去掉 `.test`）。使用测试证书访问生产环境会得到签名错误。

### 8. 查询接口的双层应答码

交易查询接口返回的 `respCode` 表示查询本身是否成功，`origRespCode` 才是原交易状态。常见错误是只判断 `respCode=00` 就认为支付成功，忽略了 `origRespCode` 可能是失败状态。

### 9. 消费撤销 vs 退货的区别

消费撤销（txnType=`31`）仅限**当天**的交易，且只能全额撤销。跨天的退款必须使用退货（txnType=`04`），退货支持部分金额退回。混用会导致交易被拒。

### 10. 编码一致性

请求中的 `encoding` 字段值、`AcpService.sign()` 的编码参数、HTTP 请求的 Content-Type 编码三者必须一致（统一使用 `UTF-8`）。编码不一致会导致签名不匹配。

---

## 响应码速查

| respCode | 含义 | 处理方式 |
|----------|------|---------|
| `00` | 成功 | 交易完成 |
| `01` | 交易失败 | 提示用户失败并记录 |
| `03` | 交易处理中 | 发起查询确认 |
| `04` | 交易处理中 | 发起查询确认 |
| `05` | 交易处理中 | 发起查询确认 |
| `12` | 交易重复 | 检查 orderId 是否重复 |
| `34` | 无此交易 | 检查查询参数 |
| `39` | 超时 | 发起查询确认 |
| `54` | 卡过期 | 提示用户换卡 |
| `55` | 密码错 | 提示用户重试 |
| `61` | 超出限额 | 提示用户降低金额 |

> **核心原则**：`00` 为明确成功，`03`/`04`/`05` 必须走查询确认，其他非 `00` 均视为失败或需要查询。

---

## SDK 初始化

```java
import com.unionpay.acp.sdk.SDKConfig;

/**
 * 应用启动时初始化银联 SDK（仅执行一次）
 */
@PostConstruct
public void initUnionPaySdk() {
    // 方式一：从 classpath 加载
    SDKConfig.getConfig().loadPropertiesFromSrc();

    // 方式二：从指定路径加载
    // SDKConfig.getConfig().loadPropertiesFromPath("/etc/unionpay/acp_sdk.properties");
}
```

---

## 组合提示

- **与 payment-gateway skill 搭配**：银联作为支付渠道之一接入统一支付网关时，参考 `payment-gateway` 中的订单状态机和幂等设计
- **与 payment-security skill 搭配**：银联的证书管理、敏感信息加密与通用支付安全实践互补
- **与 payment-reconciliation skill 搭配**：银联提供每日对账文件下载接口，配合 `payment-reconciliation` 中的对账流程
- **与 payment-resilience skill 搭配**：银联后台交易的超时重试、查询补偿策略，参考 `payment-resilience` 中的弹性设计
- **与 unionpay-onboarding skill 搭配**：初次接入银联时的商户入网、证书申请、测试环境配置流程
