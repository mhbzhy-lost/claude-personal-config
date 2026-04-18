---
name: wechat-pay-apis
description: "微信支付下单 API：JSAPI/APP/Native/H5/小程序支付，统一下单、调起支付、查询、关闭与退款。"
tech_stack: [payment, wechat-pay, backend]
language: [java, python]
capability: [payment-gateway]
---

# 微信支付下单 API（V3）

> 来源：https://pay.weixin.qq.com/doc/v3/merchant/4012791856  
> SDK(Java)：https://github.com/wechatpay-apiv3/wechatpay-java  
> SDK(Python)：https://github.com/minibear2021/wechatpayv3

## 用途

微信支付 V3 版下单接口，覆盖 JSAPI（公众号/小程序）、APP、Native（扫码）、H5 四种支付产品。
提供统一下单 -> 调起支付 -> 查询/关闭/退款的完整生命周期管理。

## 何时使用

- 公众号/小程序内发起微信支付（JSAPI / 小程序支付）
- 原生 APP 内调起微信支付（APP 支付）
- PC 端展示二维码让用户扫码付款（Native 支付）
- 手机浏览器 H5 页面唤起微信支付（H5 支付）
- 支付后查询订单状态、关闭未支付订单、发起退款

## API 总览

| 产品 | 端点 | 适用场景 | 返回关键字段 |
|------|------|---------|------------|
| JSAPI | `POST /v3/pay/transactions/jsapi` | 公众号 / 小程序内 | `prepay_id` |
| APP | `POST /v3/pay/transactions/app` | 移动 APP | `prepay_id` |
| Native | `POST /v3/pay/transactions/native` | PC 扫码 | `code_url` |
| H5 | `POST /v3/pay/transactions/h5` | 手机浏览器 | `h5_url` |

请求域名：`https://api.mch.weixin.qq.com`（备域名 `https://api2.mch.weixin.qq.com`）

---

## SDK 初始化

### Java（wechatpay-java）

Maven 依赖：

```xml
<dependency>
    <groupId>com.github.wechatpay-apiv3</groupId>
    <artifactId>wechatpay-java</artifactId>
    <version>0.2.17</version>
</dependency>
```

初始化配置（所有支付产品共用）：

```java
import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.RSAAutoCertificateConfig;

Config config = new RSAAutoCertificateConfig.Builder()
    .merchantId("1900000001")                // 商户号
    .privateKeyFromPath("/path/apiclient_key.pem") // 商户 API 私钥
    .merchantSerialNumber("证书序列号")        // 商户证书序列号
    .apiV3Key("your-api-v3-key")             // APIv3 密钥
    .build();
```

### Python（wechatpayv3）

安装：

```bash
pip install wechatpayv3
```

初始化配置：

```python
from wechatpayv3 import WeChatPay, WeChatPayType

MCHID = '1900000001'           # 商户号
APPID = 'wxd678efh567hg6787'   # 应用 appid
APIV3_KEY = 'your-api-v3-key'  # APIv3 密钥
CERT_SERIAL_NO = '证书序列号'    # 商户证书序列号
NOTIFY_URL = 'https://your.domain/pay/notify'

with open('/path/apiclient_key.pem') as f:
    PRIVATE_KEY = f.read()

wxpay = WeChatPay(
    wechatpay_type=WeChatPayType.NATIVE,  # 按需切换支付类型
    mchid=MCHID,
    private_key=PRIVATE_KEY,
    cert_serial_no=CERT_SERIAL_NO,
    appid=APPID,
    apiv3_key=APIV3_KEY,
    notify_url=NOTIFY_URL,
)
```

---

## 一、JSAPI 支付（公众号）

### 1.1 请求体结构

```json
{
  "appid": "wxd678efh567hg6787",
  "mchid": "1900000001",
  "description": "商品描述",
  "out_trade_no": "20230901123456789",
  "notify_url": "https://your.domain/pay/notify",
  "amount": {
    "total": 100,
    "currency": "CNY"
  },
  "payer": {
    "openid": "oUpF8uMuAJO_M2pxb1Q9zNjWeS6o"
  }
}
```

必填字段：`appid`、`mchid`、`description`、`out_trade_no`、`notify_url`、`amount.total`、`payer.openid`。

可选字段：`time_expire`（支付截止时间 RFC3339）、`attach`（附加数据）、`goods_tag`、`detail`（商品详情）、`scene_info`（场景信息）、`settle_info`（结算信息）。

### 1.2 Java 示例

```java
import com.wechat.pay.java.service.payments.jsapi.JsapiServiceExtension;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayRequest;
import com.wechat.pay.java.service.payments.jsapi.model.Amount;
import com.wechat.pay.java.service.payments.jsapi.model.Payer;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayWithRequestPaymentResponse;

// 构建服务（推荐使用 Extension，自动处理二次签名）
JsapiServiceExtension service = new JsapiServiceExtension.Builder()
    .config(config)
    .build();

// 构建请求
Amount amount = new Amount();
amount.setTotal(100);  // 单位：分
amount.setCurrency("CNY");

Payer payer = new Payer();
payer.setOpenid("oUpF8uMuAJO_M2pxb1Q9zNjWeS6o");

PrepayRequest request = new PrepayRequest();
request.setAppid("wxd678efh567hg6787");
request.setMchid("1900000001");
request.setDescription("商品描述");
request.setOutTradeNo("20230901123456789");
request.setNotifyUrl("https://your.domain/pay/notify");
request.setAmount(amount);
request.setPayer(payer);

// 下单并获取调起支付参数（包含二次签名）
PrepayWithRequestPaymentResponse response = service.prepayWithRequestPayment(request);
// response 包含：appId, timeStamp, nonceStr, packageVal, signType, paySign
```

### 1.3 Python 示例

```python
import json

# 下单
code, resp = wxpay.pay(
    description='商品描述',
    out_trade_no='20230901123456789',
    amount={'total': 100, 'currency': 'CNY'},
    pay_type=WeChatPayType.JSAPI,
    payer={'openid': 'oUpF8uMuAJO_M2pxb1Q9zNjWeS6o'},
)

if code == 200:
    prepay_id = json.loads(resp)['prepay_id']
    # 需要自行构造二次签名（见下文）
```

### 1.4 JSAPI 二次签名与调起支付（重点）

拿到 `prepay_id` 后，前端需要通过 `WeixinJSBridge.invoke` 调起支付，但支付参数中的 `paySign` 必须由后端使用商户私钥进行二次签名。

**第一步：构造签名串**

签名串共 4 行，每行以 `\n` 结尾（包括最后一行）：

```
appId\n
timeStamp\n
nonceStr\n
package\n
```

具体示例：

```
wxd678efh567hg6787\n
1414561699\n
5K8264ILTKCH16CQ2502SI8ZNMTM67VS\n
prepay_id=wx201410272009395522657a690389285100\n
```

**第二步：用商户私钥做 SHA256withRSA 签名**

Java 手动签名（如果不用 Extension）：

```java
import java.security.Signature;
import java.util.Base64;

String signStr = String.format("%s\n%s\n%s\n%s\n",
    appId, timeStamp, nonceStr, "prepay_id=" + prepayId);

Signature sign = Signature.getInstance("SHA256withRSA");
sign.initSign(merchantPrivateKey);
sign.update(signStr.getBytes("UTF-8"));
String paySign = Base64.getEncoder().encodeToString(sign.sign());
```

Python 手动签名：

```python
import time
import string
import random
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
import base64

timestamp = str(int(time.time()))
nonce_str = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
package = f'prepay_id={prepay_id}'

# 构造签名串
sign_str = f'{APPID}\n{timestamp}\n{nonce_str}\n{package}\n'

# 加载私钥并签名
private_key = serialization.load_pem_private_key(
    PRIVATE_KEY.encode(), password=None
)
signature = private_key.sign(
    sign_str.encode('utf-8'),
    padding.PKCS1v15(),
    hashes.SHA256()
)
pay_sign = base64.b64encode(signature).decode()
```

**第三步：前端调起支付**

```javascript
// 公众号内通过 WeixinJSBridge 调起
WeixinJSBridge.invoke('getBrandWCPayRequest', {
    appId: 'wxd678efh567hg6787',
    timeStamp: '1414561699',
    nonceStr: '5K8264ILTKCH16CQ2502SI8ZNMTM67VS',
    package: 'prepay_id=wx201410272009395522657a690389285100',
    signType: 'RSA',       // 固定值 RSA
    paySign: 'Base64编码的签名值'
}, function(res) {
    if (res.err_msg === 'get_brand_wcpay_request:ok') {
        // 支付成功，建议后端查询订单确认
    }
});
```

---

## 二、APP 支付

### 2.1 请求体结构

与 JSAPI 相同，但**不需要 `payer` 字段**：

```json
{
  "appid": "wxd678efh567hg6787",
  "mchid": "1900000001",
  "description": "商品描述",
  "out_trade_no": "20230901123456789",
  "notify_url": "https://your.domain/pay/notify",
  "amount": {
    "total": 100,
    "currency": "CNY"
  }
}
```

### 2.2 Java 示例

```java
import com.wechat.pay.java.service.payments.app.AppServiceExtension;
import com.wechat.pay.java.service.payments.app.model.PrepayRequest;
import com.wechat.pay.java.service.payments.app.model.Amount;
import com.wechat.pay.java.service.payments.app.model.PrepayWithRequestPaymentResponse;

AppServiceExtension service = new AppServiceExtension.Builder()
    .config(config)
    .build();

Amount amount = new Amount();
amount.setTotal(100);
amount.setCurrency("CNY");

PrepayRequest request = new PrepayRequest();
request.setAppid("wxd678efh567hg6787");
request.setMchid("1900000001");
request.setDescription("商品描述");
request.setOutTradeNo("20230901123456789");
request.setNotifyUrl("https://your.domain/pay/notify");
request.setAmount(amount);

// 下单并获取调起支付参数（自动处理二次签名）
PrepayWithRequestPaymentResponse response = service.prepayWithRequestPayment(request);
// response 包含：appId, partnerId, prepayId, packageValue, nonceStr, timestamp, sign
```

### 2.3 Python 示例

```python
code, resp = wxpay.pay(
    description='商品描述',
    out_trade_no='20230901123456789',
    amount={'total': 100, 'currency': 'CNY'},
    pay_type=WeChatPayType.APP,
)

if code == 200:
    prepay_id = json.loads(resp)['prepay_id']
    # 构造 APP 调起参数（见下文二次签名）
```

### 2.4 APP 二次签名与调起参数（重点）

**签名串构造**（4 行，每行 `\n` 结尾）：

```
appId\n
timeStamp\n
nonceStr\n
prepay_id\n
```

注意：APP 签名串的第 4 行直接是 `prepay_id` 值，而非 `prepay_id=xxx`。

Python 签名逻辑与 JSAPI 一致，仅第 4 行不同：

```python
sign_str = f'{APPID}\n{timestamp}\n{nonce_str}\n{prepay_id}\n'
# 后续签名逻辑与 JSAPI 相同
```

**Android/iOS 调起参数**：

```
appId:      wxd678efh567hg6787       // 微信开放平台审核通过的 appid
partnerId:  1900000001               // 商户号
prepayId:   wx201410272009395522...   // 预支付交易会话标识
package:    Sign=WXPay               // 固定值
nonceStr:   5K8264ILTKCH16CQ2502...  // 随机字符串
timeStamp:  1414561699               // 时间戳（秒）
sign:       Base64编码的签名值         // SHA256withRSA 签名
```

Android 示例（微信 SDK）：

```java
IWXAPI api = WXAPIFactory.createWXAPI(context, "wxd678efh567hg6787");
PayReq req = new PayReq();
req.appId       = "wxd678efh567hg6787";
req.partnerId   = "1900000001";
req.prepayId    = response.getPrepayId();
req.packageValue = "Sign=WXPay";
req.nonceStr    = response.getNonceStr();
req.timeStamp   = response.getTimestamp();
req.sign        = response.getSign();
api.sendReq(req);
```

---

## 三、Native 支付（扫码）

### 3.1 请求体结构

与 APP 下单相同，**不需要 `payer` 字段**。

### 3.2 Java 示例

```java
import com.wechat.pay.java.service.payments.nativepay.NativePayService;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayRequest;
import com.wechat.pay.java.service.payments.nativepay.model.Amount;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayResponse;

NativePayService service = new NativePayService.Builder()
    .config(config)
    .build();

Amount amount = new Amount();
amount.setTotal(100);
amount.setCurrency("CNY");

PrepayRequest request = new PrepayRequest();
request.setAppid("wxd678efh567hg6787");
request.setMchid("1900000001");
request.setDescription("商品描述");
request.setOutTradeNo("20230901123456789");
request.setNotifyUrl("https://your.domain/pay/notify");
request.setAmount(amount);

PrepayResponse response = service.prepay(request);
String codeUrl = response.getCodeUrl();
// 将 codeUrl 生成二维码展示给用户扫码
```

### 3.3 Python 示例

```python
wxpay_native = WeChatPay(
    wechatpay_type=WeChatPayType.NATIVE,
    mchid=MCHID, private_key=PRIVATE_KEY,
    cert_serial_no=CERT_SERIAL_NO, appid=APPID,
    apiv3_key=APIV3_KEY, notify_url=NOTIFY_URL,
)

code, resp = wxpay_native.pay(
    description='商品描述',
    out_trade_no='20230901123456789',
    amount={'total': 100, 'currency': 'CNY'},
    pay_type=WeChatPayType.NATIVE,
)

if code == 200:
    code_url = json.loads(resp)['code_url']
    # 用 qrcode 库将 code_url 转为二维码图片
    import qrcode
    img = qrcode.make(code_url)
    img.save('pay_qrcode.png')
```

### 3.4 调起方式

Native 支付**不需要二次签名**。将返回的 `code_url`（如 `weixin://wxpay/bizpayurl?pr=xxx`）生成二维码，用户打开微信扫码即可支付。

`code_url` 有效期为 **2 小时**，过期需重新下单。

---

## 四、H5 支付

### 4.1 请求体结构

不需要 `payer` 字段，但**必须传 `scene_info`**：

```json
{
  "appid": "wxd678efh567hg6787",
  "mchid": "1900000001",
  "description": "商品描述",
  "out_trade_no": "20230901123456789",
  "notify_url": "https://your.domain/pay/notify",
  "amount": {
    "total": 100,
    "currency": "CNY"
  },
  "scene_info": {
    "payer_client_ip": "14.23.150.211",
    "h5_info": {
      "type": "Wap"
    }
  }
}
```

`scene_info.payer_client_ip` 和 `scene_info.h5_info.type` 为**必填**。`type` 可选值：`iOS`、`Android`、`Wap`。

### 4.2 Java 示例

```java
import com.wechat.pay.java.service.payments.h5.H5Service;
import com.wechat.pay.java.service.payments.h5.model.PrepayRequest;
import com.wechat.pay.java.service.payments.h5.model.Amount;
import com.wechat.pay.java.service.payments.h5.model.SceneInfo;
import com.wechat.pay.java.service.payments.h5.model.H5Info;
import com.wechat.pay.java.service.payments.h5.model.PrepayResponse;

H5Service service = new H5Service.Builder()
    .config(config)
    .build();

Amount amount = new Amount();
amount.setTotal(100);
amount.setCurrency("CNY");

H5Info h5Info = new H5Info();
h5Info.setType("Wap");

SceneInfo sceneInfo = new SceneInfo();
sceneInfo.setPayerClientIp("14.23.150.211");
sceneInfo.setH5Info(h5Info);

PrepayRequest request = new PrepayRequest();
request.setAppid("wxd678efh567hg6787");
request.setMchid("1900000001");
request.setDescription("商品描述");
request.setOutTradeNo("20230901123456789");
request.setNotifyUrl("https://your.domain/pay/notify");
request.setAmount(amount);
request.setSceneInfo(sceneInfo);

PrepayResponse response = service.prepay(request);
String h5Url = response.getH5Url();
// 前端直接 302 跳转到 h5Url
```

### 4.3 Python 示例

```python
wxpay_h5 = WeChatPay(
    wechatpay_type=WeChatPayType.H5,
    mchid=MCHID, private_key=PRIVATE_KEY,
    cert_serial_no=CERT_SERIAL_NO, appid=APPID,
    apiv3_key=APIV3_KEY, notify_url=NOTIFY_URL,
)

code, resp = wxpay_h5.pay(
    description='商品描述',
    out_trade_no='20230901123456789',
    amount={'total': 100, 'currency': 'CNY'},
    pay_type=WeChatPayType.H5,
    scene_info={
        'payer_client_ip': '14.23.150.211',
        'h5_info': {'type': 'Wap'}
    },
)

if code == 200:
    h5_url = json.loads(resp)['h5_url']
    # 返回给前端，302 跳转即可
```

### 4.4 调起方式

H5 支付**不需要二次签名**。后端将 `h5_url` 返回给前端，前端通过 HTTP 302 跳转到该 URL 即可唤起微信支付。

`h5_url` 有效期为 **5 分钟**，过期需重新下单。

支付完成后微信会跳转到商户在微信支付后台配置的 H5 支付域名下的页面，可通过 `h5_url` 后追加 `&redirect_url=xxx`（需 URL 编码）指定回跳地址。

---

## 五、小程序支付

### 5.1 下单接口

小程序支付与 JSAPI 使用**相同的下单端点** `POST /v3/pay/transactions/jsapi`，请求体结构完全一致。

关键区别：`appid` 需填**小程序的 appid**（非公众号），`payer.openid` 是用户在该小程序下的 openid。

### 5.2 获取 openid

```javascript
// 小程序端
wx.login({
  success(res) {
    // 将 res.code 发给后端，后端调用 auth.code2Session 换取 openid
  }
});
```

后端用 code 换取 openid：

```
GET https://api.weixin.qq.com/sns/jscode2session
    ?appid=小程序appid
    &secret=小程序secret
    &js_code=登录code
    &grant_type=authorization_code
```

### 5.3 调起支付

二次签名构造方式与 JSAPI 完全相同，但前端使用 `wx.requestPayment` 而非 `WeixinJSBridge`：

```javascript
wx.requestPayment({
  timeStamp: '1414561699',
  nonceStr: '5K8264ILTKCH16CQ2502SI8ZNMTM67VS',
  package: 'prepay_id=wx201410272009395522657a690389285100',
  signType: 'RSA',
  paySign: 'Base64编码的签名值',
  success(res) {
    // 支付成功
  },
  fail(res) {
    // 用户取消或支付失败
  }
});
```

注意：`wx.requestPayment` **不需要传 appId** 参数，小程序运行时会自动使用当前小程序的 appid。但后端二次签名时仍需使用小程序 appid 参与签名。

---

## 六、订单查询

### 6.1 按微信支付订单号查询

```
GET /v3/pay/transactions/id/{transaction_id}?mchid=1900000001
```

### 6.2 按商户订单号查询

```
GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid=1900000001
```

### 6.3 响应状态枚举

| 状态 | 含义 |
|------|------|
| `SUCCESS` | 支付成功 |
| `REFUND` | 转入退款 |
| `NOTPAY` | 未支付 |
| `CLOSED` | 已关闭 |
| `REVOKED` | 已撤销（仅付款码） |
| `USERPAYING` | 用户支付中（仅付款码） |
| `PAYERROR` | 支付失败 |

### 6.4 Java 示例

```java
import com.wechat.pay.java.service.payments.jsapi.JsapiServiceExtension;
import com.wechat.pay.java.service.payments.jsapi.model.QueryOrderByOutTradeNoRequest;
import com.wechat.pay.java.service.payments.model.Transaction;

JsapiServiceExtension service = new JsapiServiceExtension.Builder()
    .config(config)
    .build();

QueryOrderByOutTradeNoRequest request = new QueryOrderByOutTradeNoRequest();
request.setMchid("1900000001");
request.setOutTradeNo("20230901123456789");

Transaction transaction = service.queryOrderByOutTradeNo(request);
String tradeState = transaction.getTradeState().name(); // SUCCESS, NOTPAY 等
String transactionId = transaction.getTransactionId();
```

### 6.5 Python 示例

```python
code, resp = wxpay.query(
    out_trade_no='20230901123456789',
)

if code == 200:
    result = json.loads(resp)
    trade_state = result['trade_state']      # SUCCESS / NOTPAY / CLOSED ...
    transaction_id = result.get('transaction_id')
```

---

## 七、关闭订单

关闭**未支付**的订单，使其不能再被支付。

```
POST /v3/pay/transactions/out-trade-no/{out_trade_no}/close
```

请求体只需 `mchid`：

```json
{ "mchid": "1900000001" }
```

成功响应：`204 No Content`（无响应体）。

### Java 示例

```java
import com.wechat.pay.java.service.payments.jsapi.model.CloseOrderRequest;

CloseOrderRequest request = new CloseOrderRequest();
request.setMchid("1900000001");
request.setOutTradeNo("20230901123456789");

service.closeOrder(request);
// 无异常即成功（204）
```

### Python 示例

```python
code, resp = wxpay.close(
    out_trade_no='20230901123456789',
)
# code == 204 表示成功
```

---

## 八、退款

### 8.1 申请退款

```
POST /v3/refund/domestic/refunds
```

请求体：

```json
{
  "out_trade_no": "20230901123456789",
  "out_refund_no": "R20230901000001",
  "reason": "商品退货",
  "notify_url": "https://your.domain/refund/notify",
  "amount": {
    "refund": 50,
    "total": 100,
    "currency": "CNY"
  }
}
```

关键字段说明：
- `out_refund_no`：商户退款单号，**幂等键**，同一退款单号重复调用返回相同结果
- `amount.refund`：退款金额（分），可小于 `amount.total` 实现**部分退款**
- `amount.total`：原订单金额（分）
- 也可用 `transaction_id`（微信支付订单号）代替 `out_trade_no`

### 8.2 Java 示例

```java
import com.wechat.pay.java.service.refund.RefundService;
import com.wechat.pay.java.service.refund.model.CreateRequest;
import com.wechat.pay.java.service.refund.model.AmountReq;
import com.wechat.pay.java.service.refund.model.Refund;

RefundService refundService = new RefundService.Builder()
    .config(config)
    .build();

AmountReq amount = new AmountReq();
amount.setRefund(50L);   // 退款金额（分）
amount.setTotal(100L);   // 原订单金额（分）
amount.setCurrency("CNY");

CreateRequest request = new CreateRequest();
request.setOutTradeNo("20230901123456789");
request.setOutRefundNo("R20230901000001");
request.setReason("商品退货");
request.setNotifyUrl("https://your.domain/refund/notify");
request.setAmount(amount);

Refund refund = refundService.create(request);
String status = refund.getStatus().name(); // SUCCESS, PROCESSING, ABNORMAL, CLOSED
```

### 8.3 Python 示例

```python
code, resp = wxpay.refund(
    out_refund_no='R20230901000001',
    amount={'refund': 50, 'total': 100, 'currency': 'CNY'},
    out_trade_no='20230901123456789',
    reason='商品退货',
)

if code in (200, 201):
    result = json.loads(resp)
    refund_status = result['status']  # SUCCESS / PROCESSING / ABNORMAL / CLOSED
```

### 8.4 查询退款

```
GET /v3/refund/domestic/refunds/{out_refund_no}
```

Java：

```java
import com.wechat.pay.java.service.refund.model.QueryByOutRefundNoRequest;

QueryByOutRefundNoRequest request = new QueryByOutRefundNoRequest();
request.setOutRefundNo("R20230901000001");

Refund refund = refundService.queryByOutRefundNo(request);
```

Python：

```python
code, resp = wxpay.query_refund(
    out_refund_no='R20230901000001',
)
```

### 8.5 退款状态枚举

| 状态 | 含义 |
|------|------|
| `SUCCESS` | 退款成功 |
| `CLOSED` | 退款关闭 |
| `PROCESSING` | 退款处理中 |
| `ABNORMAL` | 退款异常（需人工介入） |

---

## 常见陷阱

1. **openid 与 appid 不匹配**：JSAPI/小程序支付的 `payer.openid` 必须是用户在对应 `appid`（公众号或小程序）下的 openid。用错 appid 对应的 openid 会返回"openid与appid不匹配"错误。公众号和小程序的 openid 不通用，即使同一用户。

2. **二次签名错误**：最常见的签名失败原因：
   - 签名串末尾缺少最后一个 `\n`
   - JSAPI 第 4 行应为 `prepay_id=xxx`，APP 第 4 行应为 `prepay_id` 值本身
   - `timeStamp` 是字符串类型的秒级时间戳，不是毫秒
   - 签名用的 appid 与下单时的 appid 不一致

3. **金额单位是分**：`amount.total` 和 `amount.refund` 的单位是**分**（整数），不是元。100 = 1 元。传入浮点数或元为单位会导致金额错误。

4. **H5 域名白名单**：H5 支付必须在微信支付商户平台配置 H5 支付域名（"支付授权目录"），未配置的域名发起 H5 支付会返回"商家参数格式有误，请联系商家解决"。

5. **out_trade_no 唯一性**：商户订单号在同一商户号下必须唯一。重复的订单号（即使金额不同）会返回"商户订单号重复"。建议使用时间戳+业务ID+随机数组合。

6. **prepay_id / code_url / h5_url 有效期**：
   - `prepay_id`：2 小时
   - `code_url`：2 小时
   - `h5_url`：5 分钟
   过期后必须用**原参数**重新调用下单接口获取新值。

7. **notify_url 要求**：回调地址必须是 HTTPS 且外网可访问，不能带端口号（非标准端口），不能有路径参数。微信服务器无法访问到回调地址会导致收不到支付通知。

8. **H5 支付 scene_info 必填**：H5 下单必须传 `scene_info.payer_client_ip` 和 `scene_info.h5_info.type`，否则返回参数错误。IP 地址需为用户真实客户端 IP。

9. **退款总额限制**：单笔订单的累计退款金额不能超过原订单金额。多次部分退款时需注意已退金额累加值。

10. **小程序支付 appid 混淆**：小程序支付用的是小程序的 appid（wx 开头），不是公众号的 appid。下单时 `appid` 字段、获取 openid 的 appid、二次签名用的 appid 三者必须一致。

---

## 组合提示

- **支付通知**：搭配 `wechat-pay-notifications` skill 处理异步支付结果回调（签名验证、解密通知体）
- **商户入驻**：搭配 `wechat-pay-onboarding` skill 完成商户号申请、密钥/证书配置
- **支付安全**：搭配 `payment-security` skill 了解密钥管理、防重放、幂等设计
- **对账**：搭配 `payment-reconciliation` skill 处理账单下载与差异对账
- **容错**：搭配 `payment-resilience` skill 实现支付超时重试、补偿机制、掉单处理
- **前端集成**：搭配 `payment-web-frontend` skill 处理前端支付 UI 流程与状态管理
