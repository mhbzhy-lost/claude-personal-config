---
name: alipay-apis
description: "支付宝支付 API：统一收单（APP/当面付/手机网站/电脑网站）、订单查询、关闭、退款与退款查询。"
tech_stack: [payment, alipay, backend]
language: [java, python]
capability: [payment-gateway]
---

# 支付宝统一收单 API

> 来源：https://opendocs.alipay.com/apis/api_1 (统一收单 API 列表)
> 版本基准：alipay-sdk-java 4.40.x.ALL（v2）；python-alipay-sdk 3.4.0（社区版 fzlee/alipay）
> 前置依赖：`alipay-onboarding`（应用创建、密钥配置、SDK 初始化）

## 用途

覆盖支付宝统一收单的全部核心 API：五种支付产品的下单接口、订单查询、订单关闭、退款与退款查询。每种产品附带独立完整的 Java/Python 代码示例。

## 何时使用

- 在移动 APP 内发起支付宝支付（APP 支付）
- 线下门店商户生成二维码让用户扫码付款（当面付-扫码）
- 线下门店商户扫用户支付宝付款码（当面付-条码）
- 手机浏览器 H5 页面内发起支付（手机网站支付）
- PC 浏览器网页内发起支付（电脑网站支付）
- 查询订单支付状态、关闭未支付订单、发起全额/部分退款

## API 总览

| 产品 | API 名称 | product_code | 适用场景 | 返回形式 |
|------|---------|-------------|---------|---------|
| APP 支付 | alipay.trade.app.pay | QUICK_MSECURITY_PAY | 移动 APP 内 | order string（客户端 SDK 调起） |
| 当面付-扫码 | alipay.trade.precreate | FACE_TO_FACE_PAYMENT | 商户生成二维码 | qr_code（二维码链接） |
| 当面付-条码 | alipay.trade.pay | FACE_TO_FACE_PAYMENT | 商户扫用户条码 | 同步返回支付结果 JSON |
| 手机网站支付 | alipay.trade.wap.pay | QUICK_WAP_WAY | 手机浏览器 H5 | form HTML（自动提交跳转收银台） |
| 电脑网站支付 | alipay.trade.page.pay | FAST_INSTANT_TRADE_PAY | PC 浏览器 | form HTML（自动提交跳转收银台） |

辅助 API：

| API 名称 | 用途 |
|---------|------|
| alipay.trade.query | 订单查询（支付状态轮询） |
| alipay.trade.close | 关闭未支付订单 |
| alipay.trade.refund | 退款（全额/部分） |
| alipay.trade.fastpay.refund.query | 退款结果查询 |

## 公共请求参数速查

以下参数在各支付 API 中通用，通过 `request.setNotifyUrl()` / `request.setReturnUrl()` 或 biz_content 设置：

| 参数 | 说明 | 设置方式 |
|------|------|---------|
| notify_url | 异步通知地址，支付成功后支付宝 POST 回调 | `request.setNotifyUrl(url)` |
| return_url | 同步跳转地址，支付完成后浏览器跳转（仅 WAP/PAGE） | `request.setReturnUrl(url)` |
| timeout_express | 订单超时关闭时间 | biz_content 字段 |
| product_code | 产品码，每种产品固定值（见总览表） | biz_content 字段（必填） |

### timeout_express 取值

| 产品 | 默认值 | 可选范围 | 说明 |
|------|--------|---------|------|
| APP 支付 | 30m | 1m ~ 15d | 超时未支付自动关闭 |
| 当面付 | 5m | 1m ~ 120m | 线下场景超时较短 |
| 手机网站支付 | 30m | 1m ~ 15d | — |
| 电脑网站支付 | 15d | 1m ~ 15d | 默认较长 |

格式：数字 + 单位（m=分钟，h=小时，d=天）。示例：`"90m"`、`"2h"`、`"1d"`。

### product_code 映射表

| 产品 | product_code | 必填 |
|------|-------------|------|
| APP 支付 | `QUICK_MSECURITY_PAY` | 是 |
| 当面付-扫码 | `FACE_TO_FACE_PAYMENT` | 是 |
| 当面付-条码 | `FACE_TO_FACE_PAYMENT` | 是 |
| 手机网站支付 | `QUICK_WAP_WAY` | 是 |
| 电脑网站支付 | `FAST_INSTANT_TRADE_PAY` | 是 |

---

## APP 支付 -- alipay.trade.app.pay

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 是 | 商户订单号，字母/数字/下划线，商户侧唯一 |
| total_amount | String(11) | 是 | 订单总金额，单位元，精确到小数点后两位，范围 [0.01, 100000000] |
| subject | String(256) | 是 | 订单标题 |
| product_code | String(64) | 是 | 固定值 `QUICK_MSECURITY_PAY` |
| body | String(128) | 否 | 订单描述 |
| timeout_express | String(6) | 否 | 超时时间，默认 30m |
| passback_params | String(512) | 否 | 回传参数，异步通知时原样返回，需 URL Encode |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeAppPayRequest;
import com.alipay.api.response.AlipayTradeAppPayResponse;

public class AppPayService {

    private final AlipayClient alipayClient; // 通过 alipay-onboarding 初始化

    /**
     * 创建 APP 支付订单，返回 order string 给客户端
     */
    public String createAppPayOrder(String outTradeNo, String totalAmount, String subject)
            throws Exception {
        AlipayTradeAppPayRequest request = new AlipayTradeAppPayRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"product_code\":\"QUICK_MSECURITY_PAY\"," +
            "\"timeout_express\":\"30m\"" +
            "}");

        // 证书模式用 certificateExecute，公钥模式用 sdkExecute
        AlipayTradeAppPayResponse response = alipayClient.sdkExecute(request);
        if (response.isSuccess()) {
            // 返回 order string，客户端用此字符串调起支付宝 SDK
            return response.getBody();
        }
        throw new RuntimeException("APP下单失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
from alipay import AliPay  # python-alipay-sdk (fzlee/alipay)

alipay_client: AliPay  # 通过 alipay-onboarding 初始化

def create_app_pay_order(out_trade_no: str, total_amount: str, subject: str) -> str:
    """创建 APP 支付订单，返回 order string"""
    order_string = alipay_client.api_alipay_trade_app_pay(
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        subject=subject,
        notify_url="https://yourdomain.com/api/alipay/notify",
    )
    # order_string 是已签名的请求参数字符串
    # 客户端（iOS/Android）直接用此字符串调起支付宝 SDK
    return order_string
```

### 客户端使用返回值

APP 支付返回的是 **order string**（已签名的请求参数字符串），不是 URL。客户端需调用支付宝客户端 SDK：
- **Android**：调用 `PayTask.payV2(orderString, true)` — 参见 `payment-android-sdk`
- **iOS**：调用 `AlipaySDK.defaultService().payOrder(orderString, ...)` — 参见 `payment-ios-sdk`
- 客户端 SDK 拉起支付宝 APP 或支付宝 H5 收银台完成支付

---

## 当面付-扫码支付 -- alipay.trade.precreate

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 是 | 商户订单号 |
| total_amount | String(11) | 是 | 订单金额（元） |
| subject | String(256) | 是 | 订单标题 |
| product_code | String(64) | 否 | `FACE_TO_FACE_PAYMENT`（当面付默认值） |
| timeout_express | String(6) | 否 | 超时时间，默认 5m |
| store_id | String(32) | 否 | 门店编号 |
| terminal_id | String(32) | 否 | 终端编号 |

### 响应关键字段

| 字段 | 说明 |
|------|------|
| qr_code | 二维码链接（如 `https://qr.alipay.com/bax00...`），需要商户侧生成二维码图片 |
| out_trade_no | 商户订单号 |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradePrecreateRequest;
import com.alipay.api.response.AlipayTradePrecreateResponse;

public class QrCodePayService {

    private final AlipayClient alipayClient;

    /**
     * 预下单获取二维码链接
     */
    public String createQrCodeOrder(String outTradeNo, String totalAmount, String subject)
            throws Exception {
        AlipayTradePrecreateRequest request = new AlipayTradePrecreateRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"timeout_express\":\"5m\"" +
            "}");

        AlipayTradePrecreateResponse response = alipayClient.certificateExecute(request);
        if (response.isSuccess()) {
            // 返回二维码链接，商户侧用 ZXing 等库生成二维码图片展示给用户
            return response.getQrCode();
        }
        throw new RuntimeException("预下单失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def create_qr_code_order(out_trade_no: str, total_amount: str, subject: str) -> str:
    """预下单获取二维码链接"""
    result = alipay_client.api_alipay_trade_precreate(
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        subject=subject,
        notify_url="https://yourdomain.com/api/alipay/notify",
    )
    # result 是字典，包含 qr_code 字段
    # 用 qrcode 库将 result["qr_code"] 生成二维码图片
    return result["qr_code"]
```

### 客户端使用

商户后端拿到 `qr_code` 后，使用二维码生成库（Java: ZXing / Python: qrcode）将链接渲染为二维码图片，展示在收银屏上供用户扫码。用户扫码后在支付宝 APP 内完成支付，支付结果通过 notify_url 异步通知。

---

## 当面付-条码支付 -- alipay.trade.pay

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 是 | 商户订单号 |
| total_amount | String(11) | 是 | 订单金额（元） |
| subject | String(256) | 是 | 订单标题 |
| scene | String(32) | 是 | 支付场景，固定值 `bar_code`（条码支付） |
| auth_code | String(32) | 是 | 用户付款码值（用户支付宝 APP 上的 25~30 位数字） |
| product_code | String(64) | 否 | `FACE_TO_FACE_PAYMENT` |
| timeout_express | String(6) | 否 | 超时时间，默认 5m |
| store_id | String(32) | 否 | 门店编号 |
| terminal_id | String(32) | 否 | 终端编号 |

### 响应关键字段

| 字段 | 说明 |
|------|------|
| trade_no | 支付宝交易号 |
| out_trade_no | 商户订单号 |
| total_amount | 交易金额 |
| trade_status | 仅在条码支付需要关注，值可能为空（需轮询查询） |

> 条码支付是**同步接口**：如果用户余额充足且无需密码，会直接返回支付成功；如果需要用户输密码，则同步返回 `code=10003`（等待用户付款），需要轮询 `alipay.trade.query` 获取最终结果。

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradePayRequest;
import com.alipay.api.response.AlipayTradePayResponse;

public class BarCodePayService {

    private final AlipayClient alipayClient;

    /**
     * 条码支付（商户扫用户付款码）
     * @param authCode 用户付款码（25~30 位数字）
     */
    public AlipayTradePayResponse barCodePay(String outTradeNo, String totalAmount,
                                              String subject, String authCode)
            throws Exception {
        AlipayTradePayRequest request = new AlipayTradePayRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"scene\":\"bar_code\"," +
            "\"auth_code\":\"" + authCode + "\"," +
            "\"timeout_express\":\"5m\"" +
            "}");

        AlipayTradePayResponse response = alipayClient.certificateExecute(request);

        if ("10000".equals(response.getCode())) {
            // 支付成功（免密小额场景）
            return response;
        } else if ("10003".equals(response.getCode())) {
            // 等待用户输入密码，需轮询 alipay.trade.query
            // 建议轮询策略：每隔 5 秒查询一次，最多查询 6 次（共 30 秒）
            return response;
        } else {
            throw new RuntimeException("条码支付失败: " + response.getSubMsg());
        }
    }
}
```

### Python 示例

```python
def bar_code_pay(out_trade_no: str, total_amount: str, subject: str, auth_code: str) -> dict:
    """条码支付（商户扫用户付款码）"""
    result = alipay_client.api_alipay_trade_pay(
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        subject=subject,
        scene="bar_code",
        auth_code=auth_code,
        notify_url="https://yourdomain.com/api/alipay/notify",
    )
    # result 是字典
    # code == "10000": 支付成功
    # code == "10003": 等待用户输密码，需轮询 trade_query
    return result
```

---

## 手机网站支付 -- alipay.trade.wap.pay

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 是 | 商户订单号 |
| total_amount | String(11) | 是 | 订单金额（元） |
| subject | String(256) | 是 | 订单标题 |
| product_code | String(64) | 是 | 固定值 `QUICK_WAP_WAY` |
| body | String(128) | 否 | 订单描述 |
| timeout_express | String(6) | 否 | 超时时间，默认 30m |
| quit_url | String(400) | 否 | 用户付款中途退出后的跳转地址（仅 WAP 有效） |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeWapPayRequest;
import com.alipay.api.response.AlipayTradeWapPayResponse;

public class WapPayService {

    private final AlipayClient alipayClient;

    /**
     * 手机网站支付，返回自动提交的 form HTML
     */
    public String createWapPayForm(String outTradeNo, String totalAmount, String subject)
            throws Exception {
        AlipayTradeWapPayRequest request = new AlipayTradeWapPayRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setReturnUrl("https://yourdomain.com/pay/success");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"product_code\":\"QUICK_WAP_WAY\"," +
            "\"timeout_express\":\"30m\"," +
            "\"quit_url\":\"https://yourdomain.com/pay/cancelled\"" +
            "}");

        AlipayTradeWapPayResponse response = alipayClient.pageExecute(request);
        if (response.isSuccess()) {
            // 返回 form 表单 HTML，前端直接渲染即可自动跳转到支付宝收银台
            return response.getBody();
        }
        throw new RuntimeException("WAP下单失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def create_wap_pay_url(out_trade_no: str, total_amount: str, subject: str) -> str:
    """手机网站支付，返回支付跳转 URL"""
    order_string = alipay_client.api_alipay_trade_wap_pay(
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        subject=subject,
        return_url="https://yourdomain.com/pay/success",
        notify_url="https://yourdomain.com/api/alipay/notify",
    )
    # 拼接完整支付 URL，前端 302 重定向到此地址
    pay_url = f"https://openapi.alipay.com/gateway.do?{order_string}"
    return pay_url
```

### 客户端使用

- **Java 返回 form HTML**：后端将 form HTML 写入 HTTP 响应（Content-Type: text/html），浏览器渲染后自动 POST 提交到支付宝收银台
- **Python 返回 URL**：后端 302 重定向到拼接的 pay_url，或前端 `window.location.href = pay_url`
- 支付完成后浏览器跳转到 return_url（仅作展示，不能作为支付成功依据）
- 支付结果以 notify_url 异步通知为准

---

## 电脑网站支付 -- alipay.trade.page.pay

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 是 | 商户订单号 |
| total_amount | String(11) | 是 | 订单金额（元） |
| subject | String(256) | 是 | 订单标题 |
| product_code | String(64) | 是 | 固定值 `FAST_INSTANT_TRADE_PAY` |
| body | String(128) | 否 | 订单描述 |
| timeout_express | String(6) | 否 | 超时时间，默认 15d |
| qr_pay_mode | String(2) | 否 | PC 扫码支付方式：0=订单码直接展示，1=前置模式，2=跳转模式，3=迷你模式，4=嵌入模式 |
| qrcode_width | Number | 否 | 自定义二维码宽度（仅 qr_pay_mode=4 时有效） |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradePagePayRequest;
import com.alipay.api.response.AlipayTradePagePayResponse;

public class PagePayService {

    private final AlipayClient alipayClient;

    /**
     * 电脑网站支付，返回自动提交的 form HTML
     */
    public String createPagePayForm(String outTradeNo, String totalAmount, String subject)
            throws Exception {
        AlipayTradePagePayRequest request = new AlipayTradePagePayRequest();
        request.setNotifyUrl("https://yourdomain.com/api/alipay/notify");
        request.setReturnUrl("https://yourdomain.com/pay/success");
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"total_amount\":\"" + totalAmount + "\"," +
            "\"subject\":\"" + subject + "\"," +
            "\"product_code\":\"FAST_INSTANT_TRADE_PAY\"" +
            "}");

        AlipayTradePagePayResponse response = alipayClient.pageExecute(request);
        if (response.isSuccess()) {
            // 返回 form 表单 HTML
            return response.getBody();
        }
        throw new RuntimeException("PC下单失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def create_page_pay_url(out_trade_no: str, total_amount: str, subject: str) -> str:
    """电脑网站支付，返回支付跳转 URL"""
    order_string = alipay_client.api_alipay_trade_page_pay(
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        subject=subject,
        return_url="https://yourdomain.com/pay/success",
        notify_url="https://yourdomain.com/api/alipay/notify",
    )
    pay_url = f"https://openapi.alipay.com/gateway.do?{order_string}"
    return pay_url
```

### 客户端使用

与手机网站支付相同：Java 返回 form HTML 直接输出给浏览器，Python 返回 URL 做 302 跳转。用户在支付宝收银台页面扫码或登录账户完成支付。

---

## 订单查询 -- alipay.trade.query

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 二选一 | 商户订单号 |
| trade_no | String(64) | 二选一 | 支付宝交易号（优先级高于 out_trade_no） |

### 响应关键字段

| 字段 | 说明 |
|------|------|
| trade_status | 交易状态（见下表） |
| trade_no | 支付宝交易号 |
| out_trade_no | 商户订单号 |
| total_amount | 订单金额 |
| buyer_logon_id | 买家支付宝账号（脱敏） |
| send_pay_date | 交易付款时间 |

### trade_status 状态值

| 状态值 | 含义 | 触发通知 | 说明 |
|--------|------|---------|------|
| WAIT_BUYER_PAY | 等待买家付款 | 否 | 订单已创建，用户尚未付款 |
| TRADE_SUCCESS | 交易支付成功 | 是 | 用户已付款，可退款 |
| TRADE_CLOSED | 交易关闭 | 是 | 未付款超时关闭，或全额退款后关闭 |
| TRADE_FINISHED | 交易完结 | 是 | 交易成功且不可退款（超出退款期限） |

> TRADE_SUCCESS 与 TRADE_FINISHED 的区别：TRADE_SUCCESS 状态下可以发起退款；TRADE_FINISHED 表示已过退款期限，不再接受退款。

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeQueryRequest;
import com.alipay.api.response.AlipayTradeQueryResponse;

public class TradeQueryService {

    private final AlipayClient alipayClient;

    /**
     * 查询订单状态
     */
    public AlipayTradeQueryResponse queryTrade(String outTradeNo) throws Exception {
        AlipayTradeQueryRequest request = new AlipayTradeQueryRequest();
        request.setBizContent("{\"out_trade_no\":\"" + outTradeNo + "\"}");

        AlipayTradeQueryResponse response = alipayClient.certificateExecute(request);
        if (response.isSuccess()) {
            // response.getTradeStatus() 返回 WAIT_BUYER_PAY / TRADE_SUCCESS 等
            return response;
        }
        throw new RuntimeException("查询失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def query_trade(out_trade_no: str) -> dict:
    """查询订单支付状态"""
    result = alipay_client.api_alipay_trade_query(out_trade_no=out_trade_no)
    # result 是字典
    # result["trade_status"]: "WAIT_BUYER_PAY" / "TRADE_SUCCESS" / "TRADE_CLOSED" / "TRADE_FINISHED"
    return result
```

### 轮询策略（条码支付场景）

条码支付返回 `code=10003`（等待用户付款）时，需轮询查询：

```java
// 推荐轮询策略：5 秒间隔，最多 6 次（30 秒总超时）
for (int i = 0; i < 6; i++) {
    Thread.sleep(5000);
    AlipayTradeQueryResponse queryResp = queryTrade(outTradeNo);
    String status = queryResp.getTradeStatus();
    if ("TRADE_SUCCESS".equals(status) || "TRADE_FINISHED".equals(status)) {
        // 支付成功
        return queryResp;
    }
    if ("TRADE_CLOSED".equals(status)) {
        // 交易关闭
        throw new RuntimeException("交易已关闭");
    }
}
// 超时仍未支付，调用 alipay.trade.cancel 撤销交易
```

---

## 订单关闭 -- alipay.trade.close

### 前提条件

- 仅对**未付款**的订单有效（trade_status = WAIT_BUYER_PAY）
- 已支付的订单不能关闭，只能退款

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 二选一 | 商户订单号 |
| trade_no | String(64) | 二选一 | 支付宝交易号（优先级更高） |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeCloseRequest;
import com.alipay.api.response.AlipayTradeCloseResponse;

public class TradeCloseService {

    private final AlipayClient alipayClient;

    public void closeTrade(String outTradeNo) throws Exception {
        AlipayTradeCloseRequest request = new AlipayTradeCloseRequest();
        request.setBizContent("{\"out_trade_no\":\"" + outTradeNo + "\"}");

        AlipayTradeCloseResponse response = alipayClient.certificateExecute(request);
        if (!response.isSuccess()) {
            // 常见错误：ACQ.TRADE_STATUS_ERROR -- 订单已支付，不能关闭
            throw new RuntimeException("关闭订单失败: " + response.getSubMsg());
        }
    }
}
```

### Python 示例

```python
def close_trade(out_trade_no: str) -> dict:
    """关闭未支付订单"""
    result = alipay_client.api_alipay_trade_close(out_trade_no=out_trade_no)
    # 成功返回 {"code": "10000", "msg": "Success", ...}
    # 失败时 sub_code 为 ACQ.TRADE_STATUS_ERROR 表示订单已支付不可关闭
    return result
```

---

## 退款 -- alipay.trade.refund

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 二选一 | 商户订单号 |
| trade_no | String(64) | 二选一 | 支付宝交易号 |
| refund_amount | String(11) | 是 | 退款金额（元），不能超过订单金额 |
| out_request_no | String(64) | 部分退款必填 | 退款请求号，同一笔交易多次退款时必须唯一（幂等键） |
| refund_reason | String(256) | 否 | 退款原因 |

### 全额退款 vs 部分退款

| 场景 | out_request_no | refund_amount | 说明 |
|------|----------------|---------------|------|
| 全额退款 | 可不传 | 等于订单金额 | 退款后订单状态变为 TRADE_CLOSED |
| 部分退款 | **必传，且每次不同** | 小于订单金额 | 可多次部分退款，累计不超过订单金额 |
| 重复请求 | 与上次相同 | 与上次相同 | 支付宝幂等处理，不会重复退款 |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeRefundRequest;
import com.alipay.api.response.AlipayTradeRefundResponse;

public class RefundService {

    private final AlipayClient alipayClient;

    /**
     * 发起退款（支持全额和部分退款）
     * @param outRequestNo 退款请求号（部分退款必传，全额退款可为 null）
     */
    public AlipayTradeRefundResponse refund(String outTradeNo, String refundAmount,
                                             String refundReason, String outRequestNo)
            throws Exception {
        AlipayTradeRefundRequest request = new AlipayTradeRefundRequest();

        StringBuilder bizContent = new StringBuilder();
        bizContent.append("{");
        bizContent.append("\"out_trade_no\":\"").append(outTradeNo).append("\",");
        bizContent.append("\"refund_amount\":\"").append(refundAmount).append("\"");
        if (refundReason != null) {
            bizContent.append(",\"refund_reason\":\"").append(refundReason).append("\"");
        }
        if (outRequestNo != null) {
            bizContent.append(",\"out_request_no\":\"").append(outRequestNo).append("\"");
        }
        bizContent.append("}");
        request.setBizContent(bizContent.toString());

        AlipayTradeRefundResponse response = alipayClient.certificateExecute(request);
        if (response.isSuccess()) {
            // response.getFundChange() == "Y" 表示资金变动成功
            return response;
        }
        throw new RuntimeException("退款失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def refund(out_trade_no: str, refund_amount: str,
           refund_reason: str = None, out_request_no: str = None) -> dict:
    """发起退款"""
    kwargs = {
        "out_trade_no": out_trade_no,
        "refund_amount": refund_amount,
    }
    if refund_reason:
        kwargs["refund_reason"] = refund_reason
    if out_request_no:
        kwargs["out_request_no"] = out_request_no

    result = alipay_client.api_alipay_trade_refund(**kwargs)
    # result["fund_change"] == "Y" 表示退款成功
    # result["fund_change"] == "N" 表示资金未变动（可能是重复请求但参数不一致）
    return result
```

---

## 退款查询 -- alipay.trade.fastpay.refund.query

### 核心请求参数（biz_content）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| out_trade_no | String(64) | 二选一 | 商户订单号 |
| trade_no | String(64) | 二选一 | 支付宝交易号 |
| out_request_no | String(64) | 是 | 退款请求号（退款时传入的 out_request_no） |

### 响应关键字段

| 字段 | 说明 |
|------|------|
| refund_amount | 本次退款金额 |
| total_amount | 订单总金额 |
| refund_status | 退款状态：`REFUND_SUCCESS`（退款成功）；若字段为空或不存在则表示退款未成功 |
| out_request_no | 退款请求号 |
| refund_reason | 退款原因 |

### Java 示例

```java
import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradeFastpayRefundQueryRequest;
import com.alipay.api.response.AlipayTradeFastpayRefundQueryResponse;

public class RefundQueryService {

    private final AlipayClient alipayClient;

    /**
     * 查询退款状态
     * @param outRequestNo 退款时使用的 out_request_no；全额退款未传 out_request_no 时传 out_trade_no
     */
    public AlipayTradeFastpayRefundQueryResponse queryRefund(String outTradeNo,
                                                              String outRequestNo)
            throws Exception {
        AlipayTradeFastpayRefundQueryRequest request = new AlipayTradeFastpayRefundQueryRequest();
        request.setBizContent("{" +
            "\"out_trade_no\":\"" + outTradeNo + "\"," +
            "\"out_request_no\":\"" + outRequestNo + "\"" +
            "}");

        AlipayTradeFastpayRefundQueryResponse response = alipayClient.certificateExecute(request);
        if (response.isSuccess()) {
            // 注意：refund_status 为空或不存在时表示退款未成功
            return response;
        }
        throw new RuntimeException("退款查询失败: " + response.getSubMsg());
    }
}
```

### Python 示例

```python
def query_refund(out_trade_no: str, out_request_no: str) -> dict:
    """查询退款状态"""
    result = alipay_client.api_alipay_trade_fastpay_refund_query(
        out_trade_no=out_trade_no,
        out_request_no=out_request_no,
    )
    # result.get("refund_status") == "REFUND_SUCCESS" 表示退款成功
    # 若 refund_status 不存在或为空，表示退款未成功
    return result
```

---

## 常见陷阱

### 1. product_code 传错或未传

每种支付产品有固定的 product_code，传错会返回 `ACQ.INVALID_PARAMETER`。常见错误：APP 支付传了 `FAST_INSTANT_TRADE_PAY`（这是电脑网站支付的），或当面付传了 `QUICK_MSECURITY_PAY`。务必对照总览表中的映射关系。

### 2. 条码支付 code=10003 未做轮询

`alipay.trade.pay`（条码支付）在用户需要输入密码时返回 `code=10003`（等待用户付款），此时**不是失败**。如果不做轮询就直接报错，会导致用户已付款但商户系统未感知。正确做法：收到 10003 后轮询 `alipay.trade.query`，超时后调用 `alipay.trade.cancel` 撤销。

### 3. WAP/PAGE 支付用了 execute() 而非 pageExecute()

手机网站支付（wap.pay）和电脑网站支付（page.pay）的响应是 form HTML，必须使用 `client.pageExecute(request)` 获取。如果误用 `client.execute(request)` 或 `client.certificateExecute(request)`，会返回空响应或报错。APP 支付则使用 `client.sdkExecute(request)` 获取 order string。

### 4. return_url 当作支付成功依据

`return_url` 是支付完成后浏览器同步跳转的地址，仅用于展示"支付成功"页面。**不能作为支付成功的判断依据**，因为：用户可能直接访问该 URL、网络中断导致未跳转、跳转参数可被篡改。必须以 `notify_url` 异步通知或主动查询 `alipay.trade.query` 为准。

### 5. 部分退款未传 out_request_no

全额退款可以不传 `out_request_no`（默认使用 out_trade_no），但**部分退款必须传 out_request_no 且每次不同**。如果部分退款不传 out_request_no，支付宝会用 out_trade_no 作为退款请求号，导致第二次部分退款被当作重复请求而不执行。

### 6. 退款查询时 out_request_no 传错

调用 `alipay.trade.fastpay.refund.query` 时，`out_request_no` 必须与退款时传入的值完全一致。全额退款时如果退款接口没传 out_request_no，查询时需传 `out_trade_no` 作为 out_request_no。传错会导致查询成功但无退款详情返回。

### 7. total_amount 精度问题

金额字段要求精确到小数点后两位，如 `"0.01"`、`"88.00"`。传入 `"0.1"` 虽然不报错，但部分场景下可能因精度不一致导致签名验证失败或金额校验异常。建议统一使用 `String.format("%.2f", amount)` 格式化。

### 8. notify_url 必须返回纯文本 "success"

异步通知处理完成后，必须在 HTTP 响应体中返回纯文本 `success`（7 个小写字符，无引号、无 HTML 标签、无 BOM 头）。否则支付宝会持续重发通知，最多 8 次，持续 25 小时。常见错误：返回 `"success"` 带引号、返回 HTML 页面、返回 JSON `{"code":"success"}`。

### 9. biz_content JSON 拼接导致注入

直接用字符串拼接 biz_content 时，如果 subject 或 body 包含双引号或特殊字符，会破坏 JSON 结构。建议使用 JSON 库（如 Jackson、Gson、json 模块）构造 biz_content，而非手动字符串拼接。本文示例为简洁采用拼接方式，生产代码应使用 JSON 序列化。

### 10. 沙箱与生产的 gateway 混用

调试时用沙箱 gateway + 沙箱 AppID，上线时忘记切换为生产 gateway 会导致 `INVALID_APP_ID`。建议通过环境变量或配置文件管理 gateway 地址，参见 `alipay-onboarding` 中的环境切换方案。

## 组合提示

| 场景 | 相关 Skill |
|------|-----------|
| 首次接入：应用创建、密钥配置、SDK 初始化 | `alipay-onboarding` |
| 处理支付宝异步通知（验签、幂等、状态机） | `alipay-notifications` |
| 支付网关架构（订单状态机、多渠道抽象、幂等设计） | `payment-gateway` |
| iOS 客户端调起 APP 支付 | `payment-ios-sdk` |
| Android 客户端调起 APP 支付 | `payment-android-sdk` |
| 前端支付页面集成（form 提交、跳转、结果展示） | `payment-web-frontend` |
