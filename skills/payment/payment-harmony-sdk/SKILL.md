---
name: payment-harmony-sdk
description: "鸿蒙支付接入：华为 IAP Kit/Payment Kit、支付宝/微信鸿蒙适配、ArkWeb H5 降级方案。"
tech_stack: [payment, harmonyos, mobile-native]
language: [arkts]
capability: [payment-gateway, native-device]
---

# 鸿蒙支付接入指南

> 来源：华为 IAP Kit 官方文档 https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/iap-overview
> 微信开放平台鸿蒙手册 https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/ohos.html
> 支付宝 OHPM SDK https://ohpm.openharmony.cn/#/cn/detail/@cashier_alipay/cashiersdk
> 版本基准：HarmonyOS NEXT 5.0+ / API 12+

## 用途

为鸿蒙原生应用提供完整的支付能力接入方案，覆盖华为应用内支付（IAP Kit）、微信支付、支付宝支付三大渠道，以及 ArkWeb H5 降级方案。帮助开发者在 HarmonyOS NEXT 平台上实现商品购买、订阅管理和支付回调处理。

## 何时使用

- 鸿蒙原生应用需要接入华为应用内购买（消耗型/非消耗型/订阅商品）
- 需要在鸿蒙应用中调起微信支付或支付宝支付
- 需要通过 ArkWeb 组件加载 H5 支付页面作为降级方案
- 从 Android/iOS 迁移支付模块到鸿蒙平台
- 需要处理多支付渠道的统一封装和回调管理

---

## 一、华为 IAP Kit（应用内支付）

### 1.1 依赖配置

在 `oh-package.json5` 中无需手动添加 IAP Kit 依赖，它是 HarmonyOS SDK 的内置 Kit，通过 `@kit.IAPKit` 直接导入即可。

需要在 AGC（AppGallery Connect）控制台完成：
1. 创建应用并获取 `app_id`
2. 在"我的应用 > 应用内支付"中配置商品信息
3. 在 `module.json5` 中声明权限和配置 `client_id`

```json5
// entry/src/main/module.json5
{
  "module": {
    "metadata": [
      {
        "name": "client_id",
        "value": "<你的 AGC client_id>"
      }
    ]
  }
}
```

### 1.2 商品类型

| 类型 | 枚举值 | 说明 | 典型场景 |
|------|--------|------|----------|
| 消耗型 | `iap.ProductType.CONSUMABLE` | 购买后可多次消耗，消耗后可再次购买 | 游戏钻石、体力值 |
| 非消耗型 | `iap.ProductType.NONCONSUMABLE` | 一次性购买，永久生效 | 去广告、关卡解锁 |
| 自动续期订阅 | `iap.ProductType.AUTORENEWABLE` | 按周期自动扣费续订 | 会员月卡、VIP 订阅 |

### 1.3 环境检测

在发起任何 IAP 操作前，必须先检测当前用户所在地区是否支持 IAP 结算：

```typescript
import { iap } from '@kit.IAPKit';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';

async function checkIAPEnvironment(context: common.UIAbilityContext): Promise<boolean> {
  try {
    await iap.queryEnvironmentStatus(context);
    return true;
  } catch (err) {
    const e = err as BusinessError;
    // 错误码 1001860001：用户未登录华为账号
    // 错误码 1001860002：所在地区不支持 IAP
    console.error(`IAP 环境检测失败: code=${e.code}, msg=${e.message}`);
    return false;
  }
}
```

### 1.4 查询商品信息

```typescript
import { iap } from '@kit.IAPKit';
import { common } from '@kit.AbilityKit';

async function queryProducts(context: common.UIAbilityContext) {
  const param: iap.QueryProductsParameter = {
    productType: iap.ProductType.CONSUMABLE,
    productIds: ['product_001', 'product_002']  // AGC 控制台配置的商品 ID
  };

  try {
    const result = await iap.queryProducts(context, param);
    // result.productInfoList 包含商品名称、价格、描述等
    for (const product of result.productInfoList) {
      console.info(`商品: ${product.productName}, 价格: ${product.price}`);
    }
    return result.productInfoList;
  } catch (err) {
    const e = err as BusinessError;
    console.error(`查询商品失败: ${e.code} - ${e.message}`);
    return [];
  }
}
```

**注意**：`queryProducts` 每次只能查询一种商品类型，每次最多传入 200 个商品 ID。不支持不传 ID 查询全部商品。

### 1.5 发起购买

```typescript
async function createPurchase(
  context: common.UIAbilityContext,
  productId: string,
  productType: iap.ProductType
) {
  const param: iap.PurchaseParameter = {
    productId: productId,
    productType: productType,
    // developerPayload 可选，用于透传业务自定义数据（如用户 ID）
    developerPayload: JSON.stringify({ userId: 'user_123' })
  };

  try {
    const result = await iap.createPurchase(context, param);
    const orderPayload = result.purchaseOrderPayload;
    if (orderPayload) {
      // 购买成功，获取关键凭证
      const purchaseToken = orderPayload.purchaseToken;
      const purchaseOrderId = orderPayload.purchaseOrderId;
      const productId = orderPayload.productId;
      console.info(`购买成功: orderId=${purchaseOrderId}`);

      // 重要：消耗型商品必须调用 finishPurchase 确认消耗
      if (productType === iap.ProductType.CONSUMABLE) {
        await finishPurchase(context, productType, purchaseToken, purchaseOrderId);
      }
    }
  } catch (err) {
    const e = err as BusinessError;
    // 错误码 1001860051：用户取消购买
    if (e.code === 1001860051) {
      console.info('用户取消了购买');
    } else {
      console.error(`购买失败: ${e.code} - ${e.message}`);
    }
  }
}
```

### 1.6 确认消耗（finishPurchase）

消耗型商品在发货后 **必须** 调用 `finishPurchase`，否则该商品无法再次购买：

```typescript
async function finishPurchase(
  context: common.UIAbilityContext,
  productType: iap.ProductType,
  purchaseToken: string,
  purchaseOrderId: string
) {
  const param: iap.FinishPurchaseParameter = {
    productType: productType,
    purchaseToken: purchaseToken,
    purchaseOrderId: purchaseOrderId
  };

  try {
    await iap.finishPurchase(context, param);
    console.info('消耗确认成功');
  } catch (err) {
    const e = err as BusinessError;
    console.error(`消耗确认失败: ${e.code} - ${e.message}`);
    // 失败时必须重试，否则用户付了钱但拿不到商品且无法再次购买
  }
}
```

### 1.7 查询已购商品（补单场景）

应用启动时应查询未确认消耗的购买记录，防止漏单：

```typescript
async function queryUnfinishedPurchases(context: common.UIAbilityContext) {
  const param: iap.QueryPurchasesParameter = {
    productType: iap.ProductType.CONSUMABLE
  };

  try {
    const result = await iap.queryPurchases(context, param);
    if (result.purchaseOrderList && result.purchaseOrderList.length > 0) {
      for (const order of result.purchaseOrderList) {
        // 对每笔未消耗的订单进行补发货 + finishPurchase
        console.info(`发现未消耗订单: ${order.purchaseOrderId}`);
        await deliverProduct(order.productId); // 业务发货逻辑
        await finishPurchase(
          context,
          iap.ProductType.CONSUMABLE,
          order.purchaseToken,
          order.purchaseOrderId
        );
      }
    }
  } catch (err) {
    const e = err as BusinessError;
    console.error(`查询已购商品失败: ${e.code} - ${e.message}`);
  }
}
```

### 1.8 服务端验签

客户端购买成功后，应将 `purchaseToken` 和 `purchaseOrderId` 发送到自有服务端，由服务端调用华为 Order 服务 API 进行验证：

```
POST https://orders-drcn.iap.dbankcloud.cn/applications/v2/purchases/verify
Authorization: Bearer <access_token>

{
  "purchaseToken": "...",
  "productId": "product_001"
}
```

服务端验证通过后再执行发货逻辑，客户端的 `purchaseToken` 不可作为唯一发货依据。

### 1.9 沙箱测试

1. 在 AGC 控制台 > 用户与访问 > 沙盒测试 中添加测试账号
2. 在测试设备上登录该沙箱华为账号
3. 沙箱环境下购买不会产生实际扣款
4. 代码中通过 `iap.queryEnvironmentStatus` 返回的环境信息可以判断是否为沙箱

**沙箱注意事项**：
- 沙箱账号与正式账号的商品数据互相隔离
- 自动续期订阅在沙箱中的续期周期会缩短（如月卡缩短为 5 分钟）
- 沙箱环境的 `purchaseToken` 无法在正式环境验签

---

## 二、微信支付鸿蒙接入

微信已发布 HarmonyOS NEXT 版本的 OpenSDK，支持原生支付能力。

### 2.1 依赖配置

```json5
// oh-package.json5
{
  "dependencies": {
    "@tencent/wechat_open_sdk": "1.0.0"  // 版本号以 OHPM 最新为准
  }
}
```

安装命令：
```bash
ohpm install @tencent/wechat_open_sdk
```

### 2.2 微信开放平台配置

1. 登录微信开放平台 > 管理中心 > 移动应用
2. 在"平台信息"板块填入鸿蒙应用的 **Bundle ID** 和 **identifier**
3. 确保 `APP_ID` 是移动应用的 AppID（不是小程序 AppID）

### 2.3 SDK 初始化

在 `EntryAbility` 的 `onCreate` 中初始化：

```typescript
import { wxopensdk } from '@tencent/wechat_open_sdk';
import { common } from '@kit.AbilityKit';

const APP_ID = 'wx1234567890abcdef';
let wxApi: wxopensdk.WXApi;

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam) {
    wxApi = wxopensdk.WXAPIFactory.createWXAPI(APP_ID);
    // 注册回调处理
    wxApi.registerApp(APP_ID);
  }
}
```

### 2.4 发起支付

支付参数由 **服务端生成**（调用微信统一下单 API），客户端拿到参数后拉起微信：

```typescript
import { wxopensdk } from '@tencent/wechat_open_sdk';
import { common } from '@kit.AbilityKit';

async function wechatPay(
  context: common.UIAbilityContext,
  payParams: {
    partnerId: string;
    prepayId: string;
    nonceStr: string;
    timeStamp: string;
    sign: string;
  }
) {
  const req = new wxopensdk.PayReq();
  req.appId = APP_ID;
  req.partnerId = payParams.partnerId;
  req.prepayId = payParams.prepayId;
  req.packageValue = 'Sign=WXPay';
  req.nonceStr = payParams.nonceStr;
  req.timeStamp = payParams.timeStamp;
  req.sign = payParams.sign;

  try {
    await wxApi.sendReq(context, req);
  } catch (err) {
    console.error('微信支付拉起失败', err);
  }
}
```

### 2.5 支付回调处理

通过实现 `WXApiEventHandler` 接口接收支付结果：

```typescript
import { wxopensdk } from '@tencent/wechat_open_sdk';

class WXPayHandler implements wxopensdk.WXApiEventHandler {
  onResp(resp: wxopensdk.BaseResp): void {
    if (resp instanceof wxopensdk.PayResp) {
      switch (resp.errCode) {
        case 0:
          // 支付成功，但仍需服务端确认最终状态
          console.info('微信支付成功');
          break;
        case -1:
          console.error('微信支付失败');
          break;
        case -2:
          console.info('用户取消微信支付');
          break;
      }
    }
  }

  onReq(req: wxopensdk.BaseReq): void {
    // 一般不需要处理
  }
}
```

**关键**：客户端收到 `errCode === 0` 只表示用户操作成功，最终支付状态必须以服务端收到微信异步通知（notify_url）为准。

---

## 三、支付宝鸿蒙接入

支付宝已发布鸿蒙原生 SDK（`@cashier_alipay/cashiersdk`），同时也支持通过 OpenLink 和 startAbility 拉起。

### 3.1 方式一：支付宝原生 SDK（推荐）

#### 依赖配置

```json5
// oh-package.json5
{
  "dependencies": {
    "@cashier_alipay/cashiersdk": "15.8.26"  // 版本号以 OHPM 最新为准
  }
}
```

安装命令：
```bash
ohpm install @cashier_alipay/cashiersdk
```

#### 发起支付

```typescript
import { Pay } from '@cashier_alipay/cashiersdk';

async function alipayWithSDK(orderInfo: string) {
  // orderInfo 由服务端签名生成（包含 app_id、method、sign 等完整参数）
  const pay = new Pay();
  try {
    const result = await pay.pay(orderInfo, true);  // true 表示使用沙箱环境
    // result 包含 resultStatus、result、memo 等字段
    if (result.resultStatus === '9000') {
      console.info('支付宝支付成功');
    } else if (result.resultStatus === '6001') {
      console.info('用户取消支付');
    } else {
      console.error(`支付失败: ${result.resultStatus} - ${result.memo}`);
    }
  } catch (err) {
    console.error('支付宝 SDK 调用异常', err);
  }
}
```

**resultStatus 常见值**：
- `9000`：支付成功
- `8000`：支付处理中（需查询确认）
- `4000`：支付失败
- `6001`：用户取消
- `6002`：网络错误

### 3.2 方式二：OpenLink 拉起支付宝

当 SDK 集成有困难时，可通过 OpenLink 直接跳转支付宝 APP：

```typescript
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';

function openAlipayViaLink(context: common.UIAbilityContext, payUrl: string) {
  // payUrl 示例: 'alipays://platformapi/startapp?appId=20000067&url=...'
  context.openLink(payUrl).then(() => {
    console.info('已跳转支付宝');
  }).catch((err: BusinessError) => {
    console.error(`跳转失败: ${err.code} - ${err.message}`);
  });
}
```

### 3.3 方式三：startAbility 显式拉起

```typescript
import { common, Want } from '@kit.AbilityKit';

function openAlipayViaAbility(context: common.UIAbilityContext, scheme: string) {
  const want: Want = {
    action: 'ohos.want.action.viewData',
    uri: scheme  // 'alipays://platformapi/startapp?...'
  };

  context.startAbility(want).then(() => {
    console.info('已拉起支付宝');
  }).catch((err: Error) => {
    console.error('拉起支付宝失败', err.message);
    // 降级方案：打开 H5 支付页
  });
}
```

**三种方式对比**：

| 方式 | 优点 | 缺点 |
|------|------|------|
| SDK 原生调用 | 体验最佳、结果回调完整 | 需要引入额外依赖 |
| OpenLink | 无额外依赖、实现简单 | 无法直接获取支付结果 |
| startAbility | 灵活度最高 | 依赖支付宝已安装、无直接回调 |

---

## 四、ArkWeb H5 降级方案

当原生 SDK 不可用或需要支持更多支付渠道时，可通过 ArkWeb 组件加载 H5 支付页面。

### 4.1 基础 Web 组件加载

```typescript
import { webview } from '@kit.ArkWeb';

@Entry
@Component
struct PaymentWebView {
  controller: webview.WebviewController = new webview.WebviewController();
  @State payUrl: string = '';  // 服务端返回的 H5 支付页 URL

  build() {
    Column() {
      Web({ src: this.payUrl, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .onLoadIntercept((event) => {
          const url = event.data.getRequestUrl();
          return this.handleUrlIntercept(url);
        })
        .onPageEnd((event) => {
          // 页面加载完成后注入 JS 桥接
          this.injectJSBridge();
        })
    }
  }

  // ...方法实现见下文
}
```

### 4.2 拦截支付 URL Scheme

H5 支付页面在唤起支付宝/微信时会发起 scheme 跳转，需要拦截并转为原生调用：

```typescript
handleUrlIntercept(url: string): boolean {
  // 拦截支付宝 scheme
  if (url.startsWith('alipays://') || url.startsWith('alipay://')) {
    this.openAlipayScheme(url);
    return true;  // 阻止 WebView 加载
  }
  // 拦截微信 scheme
  if (url.startsWith('weixin://') || url.startsWith('wxpay://')) {
    this.openWechatScheme(url);
    return true;
  }
  return false;  // 允许正常加载
}

openAlipayScheme(url: string) {
  const context = getContext(this) as common.UIAbilityContext;
  const want: Want = {
    action: 'ohos.want.action.viewData',
    uri: url
  };
  context.startAbility(want).catch(() => {
    // 支付宝未安装，提示用户
    promptAction.showToast({ message: '请安装支付宝客户端' });
  });
}

openWechatScheme(url: string) {
  const context = getContext(this) as common.UIAbilityContext;
  context.openLink(url).catch(() => {
    promptAction.showToast({ message: '请安装微信客户端' });
  });
}
```

### 4.3 JavaScript 桥接接收支付结果

```typescript
// 注入 JS 桥接对象
injectJSBridge() {
  const jsCode = `
    window.HarmonyBridge = {
      postMessage: function(type, data) {
        // 通过 URL scheme 通知原生侧
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'harmony://callback?type=' + type + '&data=' + encodeURIComponent(data);
        document.body.appendChild(iframe);
        setTimeout(function() { document.body.removeChild(iframe); }, 100);
      }
    };
  `;
  this.controller.runJavaScript(jsCode);
}
```

更推荐使用 `javaScriptProxy` 实现双向通信：

```typescript
@Entry
@Component
struct PaymentWebView {
  controller: webview.WebviewController = new webview.WebviewController();

  // 定义暴露给 H5 的方法
  onPayResult(resultJson: string): void {
    const result = JSON.parse(resultJson);
    console.info(`H5 支付结果: ${result.status}`);
  }

  build() {
    Web({ src: this.payUrl, controller: this.controller })
      .javaScriptProxy({
        object: this,
        name: 'NativeBridge',       // H5 中通过 window.NativeBridge 访问
        methodList: ['onPayResult'], // 暴露的方法白名单
        controller: this.controller
      })
  }
}

// H5 侧调用示例：
// window.NativeBridge.onPayResult(JSON.stringify({ status: 'success', orderId: '...' }));
```

---

## 五、通用处理

### 5.1 Ability 生命周期与支付回调

用户从支付 APP 返回时，应用会触发 `onForeground`，此时应刷新支付状态：

```typescript
export default class EntryAbility extends UIAbility {
  onForeground() {
    // 从支付宝/微信返回后，主动查询订单状态
    this.refreshPaymentStatus();
  }

  private async refreshPaymentStatus() {
    // 调用自有服务端查询最新订单状态
    // 不要仅依赖客户端回调判断支付结果
  }
}
```

### 5.2 网络状态监听

支付操作对网络敏感，应在发起支付前检测网络：

```typescript
import { connection } from '@ohos.net.connection';

async function checkNetwork(): Promise<boolean> {
  try {
    const hasNet = await connection.hasDefaultNet();
    if (!hasNet) {
      promptAction.showToast({ message: '网络不可用，请检查网络设置' });
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

// 监听网络变化
function observeNetwork() {
  const conn = connection.createNetConnection();
  conn.on('netAvailable', () => {
    console.info('网络已恢复');
  });
  conn.on('netUnavailable', () => {
    console.warn('网络已断开');
  });
  conn.register(() => {});
}
```

### 5.3 Want 参数传递

在多 Ability 架构中，支付结果可通过 want 参数回传：

```typescript
// 跳转到支付结果页
function navigateToResult(context: common.UIAbilityContext, orderId: string, status: string) {
  const want: Want = {
    bundleName: 'com.example.myapp',
    abilityName: 'PayResultAbility',
    parameters: {
      orderId: orderId,
      payStatus: status
    }
  };
  context.startAbility(want);
}

// 在目标 Ability 中接收
export default class PayResultAbility extends UIAbility {
  onCreate(want: Want) {
    const orderId = want.parameters?.['orderId'] as string;
    const status = want.parameters?.['payStatus'] as string;
    console.info(`支付结果: orderId=${orderId}, status=${status}`);
  }
}
```

### 5.4 统一支付封装

建议将三种支付渠道封装为统一接口：

```typescript
enum PayChannel {
  HUAWEI_IAP = 'huawei_iap',
  WECHAT = 'wechat',
  ALIPAY = 'alipay'
}

interface PayResult {
  success: boolean;
  channel: PayChannel;
  orderId?: string;
  errorCode?: string;
  errorMsg?: string;
}

type PayCallback = (result: PayResult) => void;

class PaymentManager {
  private context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async pay(channel: PayChannel, orderInfo: Record<string, string>): Promise<PayResult> {
    // 前置检查
    if (!await checkNetwork()) {
      return { success: false, channel, errorMsg: '网络不可用' };
    }

    switch (channel) {
      case PayChannel.HUAWEI_IAP:
        return this.huaweiPay(orderInfo);
      case PayChannel.WECHAT:
        return this.wechatPay(orderInfo);
      case PayChannel.ALIPAY:
        return this.alipayPay(orderInfo);
    }
  }

  private async huaweiPay(params: Record<string, string>): Promise<PayResult> {
    // 调用 IAP Kit createPurchase...
    // 此处省略，参见上文第一节
    return { success: true, channel: PayChannel.HUAWEI_IAP };
  }

  private async wechatPay(params: Record<string, string>): Promise<PayResult> {
    // 调用微信 OpenSDK sendReq...
    return { success: true, channel: PayChannel.WECHAT };
  }

  private async alipayPay(params: Record<string, string>): Promise<PayResult> {
    // 调用支付宝 SDK pay...
    return { success: true, channel: PayChannel.ALIPAY };
  }
}
```

---

## 常见陷阱

### 1. 消耗型商品未调用 finishPurchase 导致无法再次购买

这是鸿蒙 IAP 最常见的问题。`createPurchase` 成功后如果不调用 `finishPurchase`，该商品会一直处于"已购未消耗"状态，用户无法再次购买。**必须**在确认发货后调用，且需要处理调用失败的重试逻辑。应用启动时用 `queryPurchases` 做补单。

### 2. 微信 AppID 混用导致支付拉起失败

`WXAPIFactory.createWXAPI(APP_ID)` 中的 `APP_ID` 必须是微信开放平台的**移动应用 AppID**（`wx` 开头），不是小程序 AppID。同时确保开放平台配置的 Bundle ID 和 identifier 与鸿蒙应用完全一致，否则调起微信后会静默失败或弹窗提示应用签名不匹配。

### 3. 客户端支付结果不可作为最终发货依据

无论是微信的 `errCode === 0`、支付宝的 `resultStatus === '9000'`，还是华为 IAP 的 `createPurchase` 成功，都**只表示客户端操作完成**，存在网络中断、回调丢失等场景。最终支付状态必须以服务端收到渠道异步通知或主动查单结果为准。

### 4. queryProducts 不支持查询全部商品

IAP Kit 的 `queryProducts` 必须传入明确的 `productIds` 列表，且每次只能查询同一种 `productType`。不传 ID 会报错，混传不同类型也会报错。建议在客户端维护一份商品 ID 配置表，或从服务端动态获取。

### 5. 沙箱环境与正式环境的 Token 不互通

在沙箱环境下获取的 `purchaseToken` 发送到服务端验签时，必须使用沙箱验签地址（`sandbox` 前缀的 API）。用正式环境地址验签沙箱 Token 会返回验签失败。上线前注意切换验签地址。

### 6. ArkWeb 拦截漏掉部分 scheme 格式

支付宝的 scheme 有 `alipay://` 和 `alipays://` 两种（s 结尾为 HTTPS 版本）；微信有 `weixin://` 和 `wxpay://`。拦截时必须覆盖所有变体，否则 H5 页面跳转会落空。还要注意某些支付渠道使用 `intent://` scheme（Android 遗留），在鸿蒙中需做特殊处理或忽略。

### 7. onForeground 中不做防抖会导致重复查询

从支付 APP 返回时 `onForeground` 可能被多次触发（如系统动画、多任务切换），在其中直接发起网络请求会导致重复查单。应加防抖或节流逻辑，例如记录上次查询时间，间隔小于 2 秒则跳过。

### 8. 自动续期订阅的状态同步延迟

华为 IAP 的自动续期订阅，续期成功的通知可能存在数分钟延迟。不要在客户端轮询 `queryPurchases` 来判断订阅状态，应依赖服务端订阅状态回调（华为服务端通知 URL）或使用服务端 API 主动查询。

---

## 组合提示

| 场景 | 推荐搭配 |
|------|----------|
| 支付安全 | 配合 `payment-security` skill：签名验证、防重放、金额校验 |
| 支付网关 | 配合 `payment-gateway` skill：统一下单、订单状态机、幂等设计 |
| 支付宝服务端 | 配合 `alipay-apis` skill：统一下单接口、退款、对账 |
| 微信支付服务端 | 配合 `wechat-pay-apis` skill：JSAPI/APP 下单、退款、回调验签 |
| 鸿蒙 UI 框架 | 支付按钮、加载态、结果页等 UI 组件可参考 HarmonyOS ArkUI 组件库 |
| 鸿蒙网络请求 | 服务端交互使用 `@ohos.net.http` 或第三方 `@ohos/axios` |
| 本地存储 | 订单缓存使用 `@ohos.data.preferences`（轻量）或 `@ohos.data.relationalStore`（关系型） |
| 推送通知 | 支付成功后的用户通知可结合 Push Kit（`@kit.PushKit`）实现 |
