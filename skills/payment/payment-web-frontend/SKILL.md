---
name: payment-web-frontend
description: "Web 前端支付接入：支付宝/微信支付/银联的 PC 网页、H5、JSAPI 支付集成与结果处理。"
tech_stack: [payment, frontend]
language: [javascript, typescript]
---

# Web 前端支付接入

> 来源：支付宝开放平台文档 (opendocs.alipay.com)、微信支付商户文档中心 (pay.weixin.qq.com)、中国银联开放平台 (open.unionpay.com)

## 用途

在 Web 前端（PC 网页、移动端 H5、微信/支付宝内置浏览器）中集成第三方支付能力，完成从发起支付到结果展示的完整前端链路。

## 何时使用

- PC 网站需要接入支付宝电脑网站支付或微信 Native 扫码支付
- 移动端 H5 页面需要跳转支付宝或唤起微信支付
- 微信公众号 H5 页面需要通过 JSAPI 调起微信支付
- 支付宝内置浏览器 H5 页面需要调用 ap.tradePay
- 支付完成后需要展示支付结果页并轮询订单状态
- 需要处理支付中断、超时、跨浏览器兼容等 UX 问题

---

## 支付宝 Web 接入

### PC 网站支付（电脑网站支付）

**流程**：服务端调用 `alipay.trade.page.pay` 接口 -> 返回一段包含支付参数的 HTML form -> 前端将 form 写入 DOM 并自动提交 -> 浏览器跳转至支付宝收银台 -> 用户完成支付 -> 支付宝通过 `return_url` 同步回跳至商户页面。

**product_code**：`FAST_INSTANT_TRADE_PAY`

```typescript
// 服务端返回的是一段完整的 HTML form 字符串，例如：
// <form action="https://openapi.alipay.com/gateway.do" method="POST">
//   <input type="hidden" name="biz_content" value="..."/>
//   ...
// </form>

/**
 * 将服务端返回的支付宝 form HTML 写入页面并自动提交
 * @param formHtml - 服务端返回的完整 form 表单 HTML 字符串
 */
function submitAlipayForm(formHtml: string): void {
  // 创建一个容器 div，将 form HTML 插入
  const container = document.createElement('div');
  container.innerHTML = formHtml;
  container.style.display = 'none';
  document.body.appendChild(container);

  // 获取 form 元素并自动提交
  const form = container.querySelector('form');
  if (form) {
    form.submit();
  }
}

// 调用示例
async function handleAlipayPCPay(orderId: string): Promise<void> {
  const response = await fetch('/api/payment/alipay/page-pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const { formHtml } = await response.json();
  submitAlipayForm(formHtml);
  // 页面会自动跳转到支付宝收银台，无需后续处理
}
```

**新窗口打开模式**（避免当前页面丢失状态）：

```typescript
function submitAlipayFormInNewWindow(formHtml: string): void {
  // 注意：必须在用户点击事件的同步代码路径中创建窗口，否则会被浏览器拦截
  const newWindow = window.open('about:blank', '_blank');
  if (newWindow) {
    newWindow.document.write(formHtml);
    newWindow.document.close();
    // form 会在新窗口中自动提交
  } else {
    // 弹窗被拦截，降级为当前页面跳转
    submitAlipayForm(formHtml);
  }
}
```

### 手机网站支付（H5）

**流程**：与 PC 网站支付基本一致，区别在于 product_code 和收银台界面为移动端优化。

**product_code**：`QUICK_WAP_WAY`

服务端同样返回 form HTML，前端处理方式完全相同（调用 `submitAlipayForm`）。支付完成后跳回 `return_url`。

**关键差异**：
- 移动端收银台会自动适配屏幕
- 如果用户安装了支付宝 App，收银台页面会提供"打开支付宝 App 支付"的引导
- `return_url` 在移动浏览器中的行为可能受浏览器和系统影响（部分浏览器会在新 Tab 打开）

### 支付宝 JSAPI（支付宝内置浏览器 H5）

**适用场景**：页面在支付宝 App 内的 WebView 中打开时，可直接调用支付宝 JSAPI 唤起支付，体验更流畅。

**前置条件**：
1. 引入支付宝 JSAPI SDK
2. 服务端调用 `alipay.trade.create` 接口获取 `trade_no`（支付宝交易号）
3. 页面在支付宝浏览器内打开

```html
<!-- 引入支付宝 JSAPI SDK -->
<script src="https://gw.alipayobjects.com/as/g/h5-lib/alipayjsapi/3.1.1/alipayjsapi.inc.min.js"></script>
```

```typescript
/**
 * 支付宝 JSAPI 支付
 * @param tradeNO - 服务端通过 alipay.trade.create 获取的支付宝交易号
 */
function alipayJSAPIPay(tradeNO: string): Promise<{ resultCode: string }> {
  return new Promise((resolve) => {
    ap.tradePay(
      { tradeNO },
      (result: { resultCode: string }) => {
        resolve(result);
      }
    );
  });
}

// resultCode 含义：
// '9000' - 支付成功
// '8000' - 正在处理中（可能已扣款，需查询确认）
// '4000' - 支付失败
// '5000' - 重复请求
// '6001' - 用户中途取消
// '6002' - 网络连接出错
// '6004' - 支付结果未知（需查询确认）

async function handleAlipayJSAPIPay(orderId: string): Promise<void> {
  // 1. 向服务端请求创建支付宝交易，获取 trade_no
  const response = await fetch('/api/payment/alipay/trade-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const { tradeNO } = await response.json();

  // 2. 调用 JSAPI 发起支付
  const result = await alipayJSAPIPay(tradeNO);

  // 3. 根据 resultCode 展示结果（但不以此作为最终判断）
  if (result.resultCode === '9000') {
    // 跳转到结果页，启动轮询确认
    navigateToResultPage(orderId);
  } else if (['8000', '6004'].includes(result.resultCode)) {
    // 结果不确定，也跳结果页轮询
    navigateToResultPage(orderId);
  } else {
    // 用户取消或失败
    showPaymentFailed(result.resultCode);
  }
}
```

**环境检测**：

```typescript
/** 检测当前是否在支付宝浏览器内 */
function isAlipayBrowser(): boolean {
  return /AlipayClient/i.test(navigator.userAgent);
}
```

---

## 微信支付 Web 接入

### JSAPI 支付（微信公众号内 H5）

**适用场景**：在微信内置浏览器中打开的 H5 页面，通过 WeixinJSBridge 或 JSSDK 调起微信支付。

**前置条件**：
1. 用户通过 OAuth2 授权获取 openid
2. 服务端使用 openid 调用统一下单接口获取 prepay_id
3. 服务端对支付参数签名后返回前端
4. 页面在微信浏览器中打开

**OAuth2 获取 openid（简述）**：

```typescript
/**
 * 微信 OAuth2 授权获取 code（静默授权 snsapi_base 即可获取 openid）
 */
function wechatOAuth2Redirect(appId: string, redirectUri: string): void {
  const encodedUri = encodeURIComponent(redirectUri);
  const url =
    `https://open.weixin.qq.com/connect/oauth2/authorize` +
    `?appid=${appId}` +
    `&redirect_uri=${encodedUri}` +
    `&response_type=code` +
    `&scope=snsapi_base` +  // snsapi_base 静默授权，只能拿 openid
    `&state=STATE` +
    `#wechat_redirect`;
  window.location.href = url;
}

// 用户同意授权后微信会重定向到 redirect_uri?code=CODE&state=STATE
// 前端从 URL 取 code 传给服务端，服务端用 code 换 openid
```

**方式一：WeixinJSBridge（推荐，无需额外引入 SDK）**

```typescript
interface WechatPayParams {
  appId: string;
  timeStamp: string;   // 注意大小写：timeStamp（不是 timestamp）
  nonceStr: string;
  package: string;     // 格式：prepay_id=wx20170101...
  signType: string;    // 'MD5' | 'HMAC-SHA256' | 'RSA'
  paySign: string;
}

function invokeWechatPay(params: WechatPayParams): Promise<string> {
  return new Promise((resolve, reject) => {
    function onBridgeReady() {
      WeixinJSBridge.invoke(
        'getBrandWCPayRequest',
        {
          appId: params.appId,
          timeStamp: params.timeStamp,
          nonceStr: params.nonceStr,
          package: params.package,
          signType: params.signType,
          paySign: params.paySign,
        },
        (res: { err_msg: string }) => {
          // err_msg 的值：
          // 'get_brand_wcpay_request:ok'     - 支付成功
          // 'get_brand_wcpay_request:cancel'  - 用户取消
          // 'get_brand_wcpay_request:fail'    - 支付失败
          if (res.err_msg === 'get_brand_wcpay_request:ok') {
            resolve('success');
          } else if (res.err_msg === 'get_brand_wcpay_request:cancel') {
            resolve('cancel');
          } else {
            reject(new Error(res.err_msg));
          }
        }
      );
    }

    if (typeof WeixinJSBridge === 'undefined') {
      document.addEventListener('WeixinJSBridgeReady', onBridgeReady, false);
    } else {
      onBridgeReady();
    }
  });
}
```

**方式二：JSSDK wx.chooseWXPay（对 WeixinJSBridge 的封装）**

```typescript
// 需先引入 <script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script>
// 并完成 wx.config 注入

// 注意：wx.chooseWXPay 不需要 appId 参数，且时间戳字段名是 timestamp（全小写）
wx.chooseWXPay({
  timestamp: params.timeStamp, // 全小写，与 WeixinJSBridge 不同
  nonceStr: params.nonceStr,
  package: params.package,
  signType: params.signType,
  paySign: params.paySign,
  success(res: { errMsg: string }) {
    // res.errMsg 格式：'chooseWXPay:ok'（驼峰式，非下划线式）
    navigateToResultPage(orderId);
  },
  fail(res: { errMsg: string }) {
    showPaymentFailed(res.errMsg);
  },
});
```

**两种方式的区别**：

| 对比项 | WeixinJSBridge | wx.chooseWXPay (JSSDK) |
|--------|----------------|----------------------|
| 需要引入 SDK | 否，微信浏览器内置 | 是，需引入 jweixin.js |
| 需要 wx.config | 否 | 是，需要 ticket 签名 |
| appId 参数 | 需要 | 不需要 |
| 时间戳字段名 | timeStamp（驼峰） | timestamp（全小写） |
| 回调格式 | err_msg（下划线） | errMsg（驼峰） |
| 成功标识 | get_brand_wcpay_request:ok | chooseWXPay:ok |

**推荐 WeixinJSBridge**：无需额外 SDK、无需 wx.config 步骤，减少出错环节。

### H5 支付（非微信浏览器）

**适用场景**：在手机浏览器（非微信内）中唤起微信 App 完成支付。

**流程**：前端将订单信息传给服务端 -> 服务端调用微信 H5 下单接口获取 `h5_url` -> 前端通过 `location.href` 跳转到 `h5_url` -> 微信 App 被唤起 -> 用户完成支付 -> 微信跳回 `redirect_url`。

```typescript
async function handleWechatH5Pay(orderId: string): Promise<void> {
  const response = await fetch('/api/payment/wechat/h5-pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      // redirect_url：支付完成后微信跳回的页面
      redirectUrl: `${window.location.origin}/payment/result?orderId=${orderId}`,
    }),
  });
  const { h5Url } = await response.json();

  // 直接跳转，不能用 window.open（会被拦截）
  window.location.href = h5Url;
}
```

**关键配置**：
- 商户后台必须配置 **Referer 域名白名单**，微信会校验发起 H5 支付请求的页面 Referer
- `redirect_url` 的域名必须在商户后台配置的域名范围内
- `h5_url` 有效期约 5 分钟，过期需重新获取

### Native 扫码支付（PC 网页）

**适用场景**：PC 网站展示微信支付二维码，用户用微信扫码完成支付。

**流程**：服务端调用统一下单接口获取 `code_url` -> 前端用二维码库将 `code_url` 渲染为 QR Code -> 用户扫码支付 -> 前端轮询服务端订单状态。

```typescript
import QRCode from 'qrcode';
// 安装：npm install qrcode @types/qrcode

async function showWechatQRCode(orderId: string): Promise<void> {
  // 1. 获取 code_url
  const response = await fetch('/api/payment/wechat/native-pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const { codeUrl } = await response.json();

  // 2. 生成二维码到 canvas
  const canvas = document.getElementById('qrcode-canvas') as HTMLCanvasElement;
  await QRCode.toCanvas(canvas, codeUrl, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // 3. 启动轮询
  startPaymentPolling(orderId);
}

// 也可以生成 Data URL 用于 <img> 展示
async function generateQRCodeDataURL(codeUrl: string): Promise<string> {
  return QRCode.toDataURL(codeUrl, { width: 256, margin: 2 });
}
```

---

## 银联 Web 接入

### 网关支付

**流程**：服务端构造包含交易信息和签名的表单参数 -> 前端将参数以 form POST 方式提交到银联网关 -> 银联展示支付页面 -> 用户完成支付 -> 银联通过 `frontUrl` 重定向回商户前端页面。

**银联网关地址**：
- 测试：`https://gateway.test.95516.com/gateway/api/frontTransReq.do`
- 生产：`https://gateway.95516.com/gateway/api/frontTransReq.do`

```typescript
interface UnionPayFormData {
  /** 银联网关地址 */
  gatewayUrl: string;
  /** 表单字段键值对（已由服务端签名） */
  formFields: Record<string, string>;
}

/**
 * 动态创建 form 并提交到银联网关
 */
function submitUnionPayForm(data: UnionPayFormData): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = data.gatewayUrl;
  form.style.display = 'none';

  // 将所有字段添加为 hidden input
  for (const [key, value] of Object.entries(data.formFields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

// 调用示例
async function handleUnionPay(orderId: string): Promise<void> {
  const response = await fetch('/api/payment/unionpay/front-pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const formData: UnionPayFormData = await response.json();
  submitUnionPayForm(formData);
}
```

**关键字段说明**：

| 字段 | 含义 |
|------|------|
| `version` | 版本号，固定 `5.1.0` |
| `encoding` | 编码，固定 `UTF-8` |
| `txnType` | 交易类型，`01` 为消费 |
| `txnSubType` | 交易子类，`01` 为自助消费 |
| `bizType` | 业务类型，`000201` 为 B2C 网关支付 |
| `channelType` | 渠道类型，`07` 为互联网 |
| `frontUrl` | 前台回调地址（用户浏览器回跳） |
| `backUrl` | 后台通知地址（服务端异步通知） |
| `orderId` | 商户订单号 |
| `txnAmt` | 交易金额，单位分 |
| `txnTime` | 订单发送时间，格式 `YYYYMMDDHHmmss` |
| `signature` | 签名值（服务端计算） |
| `signMethod` | 签名方式，`01` 为 RSA-SHA256 |

**与支付宝 form 提交的区别**：
- 支付宝：服务端返回完整 form HTML，前端直接写入 DOM 提交
- 银联：服务端返回字段键值对，前端构造 form 并提交到银联网关地址
- 两者本质相同：都是 form POST 跳转到第三方支付页面

---

## 通用处理

### 支付结果页轮询

**核心原则**：前端展示的支付结果仅为用户提示，不可作为业务判定。必须查询服务端接口获取经后端确认的订单状态。

```typescript
interface OrderStatus {
  status: 'PAYING' | 'PAID' | 'CLOSED' | 'PAY_FAILED';
  message?: string;
}

/**
 * 渐进式轮询订单状态
 * 间隔策略：2s -> 2s -> 3s -> 3s -> 5s -> 5s -> 10s...（最长 5 分钟）
 */
function startPaymentPolling(
  orderId: string,
  callbacks: {
    onSuccess: (status: OrderStatus) => void;
    onFailed: (status: OrderStatus) => void;
    onTimeout: () => void;
    onStatusUpdate?: (status: OrderStatus) => void;
  }
): () => void {
  const intervals = [2000, 2000, 3000, 3000, 5000, 5000, 10000];
  const MAX_DURATION = 5 * 60 * 1000; // 5 分钟
  let currentIndex = 0;
  let elapsed = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let aborted = false;

  async function poll() {
    if (aborted) return;

    try {
      const response = await fetch(`/api/orders/${orderId}/status`);
      const status: OrderStatus = await response.json();

      callbacks.onStatusUpdate?.(status);

      if (status.status === 'PAID') {
        callbacks.onSuccess(status);
        return;
      }

      if (status.status === 'PAY_FAILED' || status.status === 'CLOSED') {
        callbacks.onFailed(status);
        return;
      }

      // 仍在支付中，继续轮询
      const interval = intervals[Math.min(currentIndex, intervals.length - 1)];
      elapsed += interval;

      if (elapsed >= MAX_DURATION) {
        callbacks.onTimeout();
        return;
      }

      currentIndex++;
      timer = setTimeout(poll, interval);
    } catch (error) {
      // 网络错误时继续轮询，不中断
      const interval = intervals[Math.min(currentIndex, intervals.length - 1)];
      elapsed += interval;

      if (elapsed >= MAX_DURATION) {
        callbacks.onTimeout();
        return;
      }

      currentIndex++;
      timer = setTimeout(poll, interval);
    }
  }

  // 首次轮询延迟 2 秒（给支付渠道回调留时间）
  timer = setTimeout(poll, 2000);

  // 返回取消函数
  return () => {
    aborted = true;
    if (timer) clearTimeout(timer);
  };
}

// 使用示例
const cancelPolling = startPaymentPolling('ORDER_123', {
  onSuccess: (status) => {
    showSuccessPage();
  },
  onFailed: (status) => {
    showFailedPage(status.message);
  },
  onTimeout: () => {
    showPendingPage(); // "支付处理中，请稍后在订单列表查看"
  },
});

// 用户离开页面时取消轮询
window.addEventListener('beforeunload', cancelPolling);
```

### return_url / redirect_url 同步回跳处理

```typescript
/**
 * 支付结果页入口逻辑
 * 用户从支付宝 return_url / 微信 redirect_url 回跳后执行
 */
function handlePaymentReturnPage(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId') || urlParams.get('out_trade_no');

  if (!orderId) {
    showError('缺少订单信息');
    return;
  }

  // 立即展示"支付结果确认中..."的加载状态
  showLoadingState('正在确认支付结果...');

  // 启动轮询
  startPaymentPolling(orderId, {
    onSuccess: () => showSuccessPage(),
    onFailed: (status) => showFailedPage(status.message),
    onTimeout: () => showPendingPage(),
  });
}
```

### 支付中断与超时 UX

```typescript
interface PaymentTimerOptions {
  /** 支付超时时间，单位毫秒，通常与服务端订单超时一致 */
  timeout: number;
  /** 倒计时回调，参数为剩余秒数 */
  onTick: (remainingSeconds: number) => void;
  /** 超时回调 */
  onExpired: () => void;
}

/**
 * 支付倒计时管理
 * 场景：扫码支付页面展示剩余支付时间
 */
function createPaymentTimer(options: PaymentTimerOptions): { cancel: () => void } {
  const { timeout, onTick, onExpired } = options;
  let remaining = Math.floor(timeout / 1000);

  const timer = setInterval(() => {
    remaining--;
    onTick(remaining);

    if (remaining <= 0) {
      clearInterval(timer);
      onExpired();
    }
  }, 1000);

  return {
    cancel: () => clearInterval(timer),
  };
}

// 使用示例：15 分钟支付倒计时
const timer = createPaymentTimer({
  timeout: 15 * 60 * 1000,
  onTick: (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    updateCountdownDisplay(`${min}:${sec.toString().padStart(2, '0')}`);
  },
  onExpired: () => {
    showOrderExpired(); // "订单已超时，请重新下单"
    cancelPolling();
  },
});
```

### 环境检测工具函数

```typescript
/** 检测是否在微信浏览器内 */
function isWechatBrowser(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 检测是否在支付宝浏览器内 */
function isAlipayBrowser(): boolean {
  return /AlipayClient/i.test(navigator.userAgent);
}

/** 检测是否移动端 */
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * 根据环境自动选择支付方式
 * 用于聚合支付场景，同一个下单页面适配不同环境
 */
function detectPaymentMethod(channel: 'alipay' | 'wechat'): string {
  if (channel === 'alipay') {
    if (isAlipayBrowser()) return 'ALIPAY_JSAPI';
    if (isMobile()) return 'ALIPAY_WAP';       // 手机网站支付
    return 'ALIPAY_PAGE';                       // PC 网站支付
  }

  if (channel === 'wechat') {
    if (isWechatBrowser()) return 'WECHAT_JSAPI';
    if (isMobile()) return 'WECHAT_H5';
    return 'WECHAT_NATIVE';                     // PC 扫码支付
  }

  return 'UNKNOWN';
}
```

---

## 关键 API 摘要

| 支付方式 | 前端核心动作 | 关键参数/接口 |
|----------|-------------|-------------|
| 支付宝 PC 网站支付 | form HTML 写入 DOM 并提交 | product_code: `FAST_INSTANT_TRADE_PAY` |
| 支付宝手机网站支付 | form HTML 写入 DOM 并提交 | product_code: `QUICK_WAP_WAY` |
| 支付宝 JSAPI | `ap.tradePay({ tradeNO })` | resultCode: 9000/8000/6001/6004 |
| 微信 JSAPI | `WeixinJSBridge.invoke('getBrandWCPayRequest', ...)` | err_msg: get_brand_wcpay_request:ok/cancel/fail |
| 微信 JSSDK | `wx.chooseWXPay({...})` | errMsg: chooseWXPay:ok |
| 微信 H5 | `location.href = h5Url` | redirect_url 回跳 |
| 微信 Native | QRCode 渲染 code_url + 轮询 | qrcode.js / qrcode 库 |
| 银联网关 | 动态构造 form POST 到银联网关 | frontUrl 前台回跳、signature 签名 |

---

## 常见陷阱

### 1. 将前端同步回调作为支付成功的依据

**错误**：收到 `get_brand_wcpay_request:ok` 或 `resultCode === '9000'` 后直接调用发货接口。

**正确**：前端结果仅用于 UI 展示引导，真正的支付确认必须由服务端通过异步通知（notify_url）或主动查单确认。用户可以篡改前端逻辑，同步回调也可能丢失。

### 2. Safari / iOS 弹窗拦截

在 Safari 中，如果 `window.open()` 不在用户点击事件的同步调用栈中（例如在 async/await 之后调用），会被浏览器拦截。

**解决方案**：先在同步路径中创建窗口 (`window.open('about:blank')`)，再在异步回调中写入内容。

```typescript
// 错误示范
async function pay() {
  const res = await fetch('/api/pay');  // async 操作
  const data = await res.json();
  window.open(data.url);                // 被 Safari 拦截！
}

// 正确做法
function pay() {
  const newWin = window.open('about:blank', '_blank');  // 同步创建
  fetch('/api/pay')
    .then(res => res.json())
    .then(data => {
      if (newWin) {
        newWin.location.href = data.url;                // 异步写入
      }
    });
}
```

### 3. 微信 JSAPI 的 timeStamp 大小写

`WeixinJSBridge.invoke` 要求字段名为 `timeStamp`（驼峰），而 `wx.chooseWXPay` 要求 `timestamp`（全小写）。混淆会导致签名校验失败，报 `invalid signature` 错误，且无明确错误提示。

### 4. 微信 H5 支付 Referer 校验失败

微信 H5 支付会校验请求来源页面的 Referer 域名是否在商户后台配置的白名单中。常见错误：
- 域名未备案
- 配置了 `www.example.com` 但实际请求来自 `m.example.com`
- SPA 应用的 Referer 可能是入口页面而非当前路由对应的域名

**现象**：页面能跳转但提示"商家参数格式有误，请联系商家解决"。

### 5. 银联 form 表单编码问题

银联网关要求 form 编码为 UTF-8，如果页面 meta 声明的编码不一致或服务端返回的字段值包含非 UTF-8 字符，会导致签名校验失败。确保：
- 页面 `<meta charset="UTF-8">`
- form 的 `accept-charset="UTF-8"`
- 服务端返回的所有字段值均为 UTF-8 编码

### 6. 轮询未设置上限导致持续请求

如果轮询逻辑没有设置超时上限和页面离开清理，用户打开多个标签页或在后台长时间运行时，会产生大量无效请求，甚至触发服务端限流。

**必须实现**：
- 最大轮询时长（建议 5 分钟）
- `beforeunload` / `visibilitychange` 事件中停止轮询
- 组件卸载时（如 React useEffect 清理函数）取消轮询

```typescript
// React 组件中的轮询清理
useEffect(() => {
  const cancel = startPaymentPolling(orderId, callbacks);
  return () => cancel();
}, [orderId]);
```

### 7. 支付宝 form 重复提交

用户网络慢时可能多次点击支付按钮，导致创建多个 form 并重复提交。

**解决方案**：
- 点击后立即禁用按钮 + 展示 loading 状态
- 使用防重标记（如 flag 变量或按钮 disabled 属性）
- 服务端通过幂等键保证不会创建重复订单

```typescript
let isSubmitting = false;

async function handlePay(): Promise<void> {
  if (isSubmitting) return;
  isSubmitting = true;
  showLoading();

  try {
    await handleAlipayPCPay(orderId);
  } catch (error) {
    isSubmitting = false;
    hideLoading();
    showError('支付发起失败，请重试');
  }
  // 注意：支付宝 form 提交成功后页面会跳转，不需要重置状态
}
```

### 8. 微信内不能使用微信 H5 支付

微信 H5 支付（mweb）只能在非微信浏览器中使用。如果在微信浏览器内调用 H5 支付的 URL，会报错"请在微信外打开订单，进行支付"。微信浏览器内必须使用 JSAPI 支付。反之，非微信浏览器不能使用 JSAPI。务必通过环境检测选择正确的支付方式。

### 9. code_url 二维码过期不刷新

微信 Native 支付的 `code_url` 有效期约 2 小时，但实际场景中订单可能 15-30 分钟就超时关闭。如果前端只在页面加载时生成一次二维码，用户扫码时订单可能已关闭。

**解决方案**：二维码页面同时展示倒计时，超时后提示用户刷新或自动重新获取 `code_url`。

---

## 注意事项

- **金额单位**：支付宝金额单位为元（字符串，如 `"0.01"`），微信和银联金额单位为分（整数，如 `1`）。前端展示时注意转换，但不要在前端做金额计算传给服务端（精度问题），金额应由服务端控制。
- **HTTPS 强制**：三家支付渠道均要求支付页面和回调页面使用 HTTPS。HTTP 页面发起支付会被直接拒绝或出现安全警告。
- **CSP 策略**：如果项目配置了 Content-Security-Policy，需要将支付宝网关 (`openapi.alipay.com`)、微信支付相关域名 (`wx.tenpay.com`, `pay.weixin.qq.com`) 加入 `form-action` 和 `frame-src` 白名单。
- **SPA 路由兼容**：使用 hash 路由（`#/path`）作为 return_url 时，部分渠道会丢弃 `#` 后面的内容。建议 return_url 使用独立的非 SPA 页面，或使用 history 模式路由。
- **多标签页冲突**：PC 网站支付在新窗口打开收银台后，用户可能在新窗口完成支付后不关闭、直接回到原标签页。原标签页应通过轮询感知支付完成并更新 UI。

---

## 组合提示

- **alipay-apis**：支付宝服务端 API 对接（统一下单、退款、查单），配合本 skill 的前端表单提交/JSAPI 调用
- **wechat-pay-apis**：微信支付服务端 API 对接（统一下单、H5 下单、退款），为前端提供 prepay_id、h5_url、code_url
- **unionpay-apis**：银联服务端 API 对接（消费接口、签名验签），为前端提供签名后的表单字段
- **payment-resilience**：支付容错与弱网处理，包括幂等重试、补单机制、支付结果最终一致性方案，与前端轮询逻辑互补
