---
name: payment-android-iap
description: "Android 应用内购买：Google Play Billing Library 商品查询/购买/确认、订阅管理、服务端验证与 RTDN。"
tech_stack: [payment, android, mobile-native]
language: [kotlin]
capability: [payment-gateway, native-device]
---

# Android 应用内购买（Google Play Billing Library）

> 来源：https://developer.android.com/google/play/billing
> 版本基准：Google Play Billing Library **8.3.0**（2025-12-23 发布）
> 最低要求：PBL 7+ 为 2025-08 起新提交应用的强制版本；PBL 8 为当前推荐版本

## 用途

Google Play Billing Library 是 Android 平台上实现应用内购买（IAP）和订阅的唯一官方 SDK。它封装了与 Google Play 商店的 IPC 通信，提供商品查询、购买流程发起、购买确认/消耗、订阅管理等能力。服务端通过 Google Play Developer API 进行购买验证，通过 RTDN（Real-time Developer Notifications）实时同步购买状态变更。

## 何时使用

- 在 Android 应用中销售数字商品（虚拟道具、高级功能解锁、会员订阅等）
- 需要管理自动续期订阅的完整生命周期（购买、续期、降级、暂停、恢复、取消）
- 需要服务端实时感知购买状态变更以维护权益一致性
- 需要支持待处理交易（Pending Purchases）如运营商代扣、慢速支付等场景
- 需要在多端（手机、平板、ChromeOS）同步用户购买记录

## Gradle 依赖

```kotlin
// build.gradle.kts (Module)
dependencies {
    val billingVersion = "8.3.0"

    // 核心库（必选）
    implementation("com.android.billingclient:billing:$billingVersion")

    // Kotlin 扩展 + 协程支持（强烈推荐）
    implementation("com.android.billingclient:billing-ktx:$billingVersion")
}
```

> PBL 8.1.0 起 `minSdkVersion` 提升至 **23**（Android 6.0）。

## 基础用法

### BillingClient 初始化与连接

```kotlin
import com.android.billingclient.api.*

class BillingManager(
    private val context: Context,
    private val onPurchasesUpdated: (BillingResult, List<Purchase>?) -> Unit
) {
    private val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
        onPurchasesUpdated(billingResult, purchases)
    }

    val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(purchasesUpdatedListener)
        .enablePendingPurchases(
            // PBL 8 要求显式传入 PendingPurchasesParams
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()   // 支持一次性商品的待处理交易
                .enablePrepaidPlans()      // 支持预付费订阅的待处理交易
                .build()
        )
        .enableAutoServiceReconnection()   // PBL 8 新增：自动重连（推荐开启）
        .build()

    fun startConnection(onConnected: () -> Unit) {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    onConnected()
                }
            }

            override fun onBillingServiceDisconnected() {
                // 已开启 enableAutoServiceReconnection，此处可为 no-op
                // 未开启时需自行实现指数退避重连
            }
        })
    }

    fun endConnection() {
        billingClient.endConnection()
    }
}
```

**连接管理最佳实践：**
- 整个应用生命周期只维护 **一个** BillingClient 实例
- 在 `Application.onCreate()` 或 Activity `onResume()` 中调用 `startConnection`
- 在 `onDestroy()` 中调用 `endConnection`
- PBL 8 开启 `enableAutoServiceReconnection()` 后，`onBillingServiceDisconnected` 回调可留空

### 商品查询

```kotlin
import com.android.billingclient.api.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// 使用 billing-ktx 的协程扩展
suspend fun queryProducts(
    billingClient: BillingClient,
    productIds: List<String>,
    productType: String = BillingClient.ProductType.INAPP
): List<ProductDetails> {
    val productList = productIds.map { id ->
        QueryProductDetailsParams.Product.newBuilder()
            .setProductId(id)
            .setProductType(productType)
            .build()
    }

    val params = QueryProductDetailsParams.newBuilder()
        .setProductList(productList)
        .build()

    val result = withContext(Dispatchers.IO) {
        billingClient.queryProductDetails(params) // ktx 挂起函数
    }

    if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
        // PBL 8 新增：检查未能获取的商品
        val unfetched = result.productDetailsResult.unfetchedProductList
        if (unfetched.isNotEmpty()) {
            // 记录日志：部分商品查询失败，包含 product-level status code
            unfetched.forEach { product ->
                Log.w("Billing", "Unfetched: ${product.product.productId}, " +
                    "reason: ${product.productDetailsStatus}")
            }
        }
        return result.productDetailsResult.productDetailsList
    }
    return emptyList()
}
```

**回调方式（非协程）：**

```kotlin
billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
        val productDetailsList = queryProductDetailsResult.productDetailsList
        val unfetchedList = queryProductDetailsResult.unfetchedProductList
        // 处理结果
    }
}
```

### 发起购买

```kotlin
fun launchPurchase(
    activity: Activity,
    billingClient: BillingClient,
    productDetails: ProductDetails,
    offerToken: String? = null     // 订阅必传；一次性商品可选
) {
    val paramsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
        .setProductDetails(productDetails)

    // 订阅类商品必须设置 offerToken
    offerToken?.let { paramsBuilder.setOfferToken(it) }

    val billingFlowParams = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(listOf(paramsBuilder.build()))
        // 可选：传入混淆后的用户标识，用于欺诈检测
        // .setObfuscatedAccountId(hashedUserId)
        // .setObfuscatedProfileId(hashedProfileId)
        .build()

    val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)

    // PBL 8 新增 sub-response codes
    when (billingResult.responseCode) {
        BillingClient.BillingResponseCode.OK -> { /* 购买流程已启动 */ }
        BillingClient.BillingResponseCode.USER_CANCELED -> { /* 用户取消 */ }
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> { /* 已拥有（非消耗型） */ }
        else -> {
            // 检查 sub-response code（PBL 8）
            // PAYMENT_DECLINED_DUE_TO_INSUFFICIENT_FUNDS / USER_INELIGIBLE 等
        }
    }
}
```

### PurchasesUpdatedListener 处理

```kotlin
val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
    when (billingResult.responseCode) {
        BillingClient.BillingResponseCode.OK -> {
            purchases?.forEach { purchase ->
                when (purchase.purchaseState) {
                    Purchase.PurchaseState.PURCHASED -> {
                        // 1. 发送到服务端验证
                        // 2. 验证通过后发放权益
                        // 3. 确认购买（acknowledge / consume）
                        handlePurchase(purchase)
                    }
                    Purchase.PurchaseState.PENDING -> {
                        // 待处理交易（运营商代扣等）
                        // 不要发放权益，等待状态转为 PURCHASED
                        // PBL 8：此状态下无 orderId
                        handlePendingPurchase(purchase)
                    }
                }
            }
        }
        BillingClient.BillingResponseCode.USER_CANCELED -> {
            // 用户取消，不做处理
        }
        else -> {
            // 错误处理：记录 billingResult.debugMessage
        }
    }
}
```

## 购买确认（Acknowledge / Consume）

> **三天确认期限**：所有购买必须在 **3 天内** 完成确认（acknowledge 或 consume），否则 Google Play 会自动退款并撤销权益。许可测试账号的期限缩短为 **5 分钟**（PBL 8.1+）/ **3 分钟**（更早版本）。

### 消耗型商品（如金币、钻石）

```kotlin
import com.android.billingclient.api.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

suspend fun consumePurchase(billingClient: BillingClient, purchase: Purchase): Boolean {
    val consumeParams = ConsumeParams.newBuilder()
        .setPurchaseToken(purchase.purchaseToken)
        .build()

    val result = withContext(Dispatchers.IO) {
        billingClient.consumePurchase(consumeParams) // ktx 挂起函数
    }

    return result.billingResult.responseCode == BillingClient.BillingResponseCode.OK
    // consume 成功后商品可被再次购买
}
```

### 非消耗型商品（如永久解锁）和订阅

```kotlin
suspend fun acknowledgePurchase(billingClient: BillingClient, purchase: Purchase): Boolean {
    // 已确认的购买无需重复确认
    if (purchase.isAcknowledged) return true

    val params = AcknowledgePurchaseParams.newBuilder()
        .setPurchaseToken(purchase.purchaseToken)
        .build()

    val result = withContext(Dispatchers.IO) {
        billingClient.acknowledgePurchase(params) // ktx 挂起函数
    }

    return result.responseCode == BillingClient.BillingResponseCode.OK
}
```

### APP 启动时检查未确认购买

```kotlin
suspend fun checkUnacknowledgedPurchases(billingClient: BillingClient) {
    // 检查一次性商品
    val inappParams = QueryPurchasesParams.newBuilder()
        .setProductType(BillingClient.ProductType.INAPP)
        .build()

    billingClient.queryPurchasesAsync(inappParams) { billingResult, purchases ->
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                .filter { !it.isAcknowledged }
                .forEach { purchase -> /* 确认或消耗 */ }
        }
    }

    // 检查订阅（PBL 8.1+ 可包含 suspended 订阅）
    val subsParams = QueryPurchasesParams.newBuilder()
        .setProductType(BillingClient.ProductType.SUBS)
        .setIncludeSuspendedSubscriptions(true) // PBL 8.1 新增
        .build()

    billingClient.queryPurchasesAsync(subsParams) { billingResult, purchases ->
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            purchases.filter { !it.isAcknowledged }
                .forEach { purchase -> /* 确认 */ }
        }
    }
}
```

## 订阅管理

### 订阅商品结构

```
Subscription Product（订阅商品）
├── BasePlan A（基础套餐 - 月付）
│   ├── Offer 1：免费试用 7 天 → 月付 ¥30
│   ├── Offer 2：首月 ¥15 → 月付 ¥30
│   └── (无 Offer 时使用基础套餐价格)
├── BasePlan B（基础套餐 - 年付）
│   └── Offer 1：首年 ¥258 → 年付 ¥298
└── BasePlan C（预付费 - 月付，不自动续期）
```

### 解析订阅优惠详情

```kotlin
fun parseSubscriptionOffers(productDetails: ProductDetails): List<OfferInfo> {
    val offers = productDetails.subscriptionOfferDetails ?: return emptyList()

    return offers.map { offer ->
        val offerToken = offer.offerToken       // 购买时必须传入
        val basePlanId = offer.basePlanId
        val offerId = offer.offerId             // 纯基础套餐时为 null

        // 解析价格阶段（phases）
        val phases = offer.pricingPhases.pricingPhaseList.map { phase ->
            PricePhase(
                price = phase.formattedPrice,            // "¥30.00"
                priceAmountMicros = phase.priceAmountMicros, // 30_000_000
                currencyCode = phase.priceCurrencyCode,  // "CNY"
                billingPeriod = phase.billingPeriod,      // "P1M" (ISO 8601)
                recurrenceMode = phase.recurrenceMode,   // FINITE_RECURRING / INFINITE_RECURRING / NON_RECURRING
                billingCycleCount = phase.billingCycleCount // 免费试用=1，无限续期=0
            )
        }

        OfferInfo(offerToken, basePlanId, offerId, phases)
    }
}

data class PricePhase(
    val price: String,
    val priceAmountMicros: Long,
    val currencyCode: String,
    val billingPeriod: String,
    val recurrenceMode: Int,
    val billingCycleCount: Int
)

data class OfferInfo(
    val offerToken: String,
    val basePlanId: String,
    val offerId: String?,
    val phases: List<PricePhase>
)
```

### 订阅升降级

```kotlin
/**
 * 订阅升降级 / 同产品换套餐
 *
 * PBL 8.1 推荐方式：使用 SubscriptionProductReplacementParams（产品级别）
 */
fun launchSubscriptionUpdate(
    activity: Activity,
    billingClient: BillingClient,
    newProductDetails: ProductDetails,
    newOfferToken: String,
    oldPurchaseToken: String,
    oldProductId: String,
    replacementMode: Int
) {
    val productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
        .setProductDetails(newProductDetails)
        .setOfferToken(newOfferToken)
        // PBL 8.1 推荐：产品级别的替换参数
        .setSubscriptionProductReplacementParams(
            BillingFlowParams.SubscriptionProductReplacementParams.newBuilder()
                .setOldProductId(oldProductId)
                .setReplacementMode(replacementMode)
                .build()
        )
        .build()

    val billingFlowParams = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(listOf(productDetailsParams))
        .setSubscriptionUpdateParams(
            BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                .setOldPurchaseToken(oldPurchaseToken)
                .build()
        )
        .build()

    billingClient.launchBillingFlow(activity, billingFlowParams)
}
```

### ReplacementMode 一览

| 模式 | 说明 | 典型场景 |
|------|------|----------|
| `WITH_TIME_PRORATION` | 立即生效，按剩余时间折算抵扣 | 默认行为 |
| `CHARGE_PRORATED_PRICE` | 立即生效，按差价收费，计费日不变 | 升级到更贵套餐 |
| `CHARGE_FULL_PRICE` | 立即生效，全价收费开启新周期 | 预付费套餐切换（唯一选项） |
| `WITHOUT_PRORATION` | 立即生效，下次续费时按新价收费 | 升级但保留剩余免费期 |
| `DEFERRED` | 下次续费时才切换到新套餐 | 降级（用户保留当前权益至周期结束） |
| `KEEP_EXISTING` | 保持现有付费计划不变 | 搭配订阅附加项使用 |

## 服务端验证

### Google Play Developer API

**一次性商品验证：**

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{token}
```

关键响应字段：
- `purchaseState`：0=已购买，1=已取消，2=待处理
- `consumptionState`：0=未消耗，1=已消耗
- `acknowledgementState`：0=未确认，1=已确认
- `orderId`：订单号

**订阅验证（v2，推荐）：**

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/subscriptionsv2/tokens/{token}
```

关键响应字段：
- `subscriptionState`：`SUBSCRIPTION_STATE_PENDING` / `SUBSCRIPTION_STATE_ACTIVE` / `SUBSCRIPTION_STATE_PAUSED` / `SUBSCRIPTION_STATE_IN_GRACE_PERIOD` / `SUBSCRIPTION_STATE_ON_HOLD` / `SUBSCRIPTION_STATE_CANCELED` / `SUBSCRIPTION_STATE_EXPIRED`
- `lineItems[]`：包含 `productId`、`expiryTime`、`autoRenewingPlan` 等
- `externalAccountIdentifiers`：关联的用户标识

**认证方式：** 使用 Google Cloud Service Account 的 OAuth 2.0 访问令牌，需授予 `androidpublisher` API 权限。

### RTDN（Real-time Developer Notifications）

RTDN 通过 Google Cloud Pub/Sub 实时推送购买状态变更，替代轮询 API 的方案。

**配置步骤：**

1. 在 Google Cloud Console 创建 Pub/Sub Topic
2. 授权 `google-play-developer-notifications@system.gserviceaccount.com` 为 Topic 的 Publisher
3. 创建 Subscription（推荐 Push 到你的 HTTPS 端点）
4. 在 Google Play Console → 应用设置 → 获利设置 中填入 Topic 全名
5. 点击"发送测试通知"验证连通性

**消息结构：**

```json
{
  "message": {
    "data": "<base64 编码的 DeveloperNotification>",
    "messageId": "136969346945"
  },
  "subscription": "projects/myproject/subscriptions/mysubscription"
}
```

解码 `data` 后得到 `DeveloperNotification`：

```json
{
  "version": "1.0",
  "packageName": "com.example.app",
  "eventTimeMillis": "1503349566168",
  "subscriptionNotification": {
    "version": "1.0",
    "notificationType": 4,
    "purchaseToken": "PURCHASE_TOKEN"
  }
}
```

> 四种通知类型互斥：`subscriptionNotification` / `oneTimeProductNotification` / `voidedPurchaseNotification` / `testNotification`

### SubscriptionNotification 类型

| Code | 类型 | 说明 |
|------|------|------|
| 1 | `SUBSCRIPTION_RECOVERED` | 从账户暂停恢复 / 从暂停恢复 |
| 2 | `SUBSCRIPTION_RENEWED` | 活跃订阅续期成功 |
| 3 | `SUBSCRIPTION_CANCELED` | 自愿或非自愿取消（不立即失效，到期后停止） |
| 4 | `SUBSCRIPTION_PURCHASED` | 新订阅购买 |
| 5 | `SUBSCRIPTION_ON_HOLD` | 进入账户暂停状态（续费失败） |
| 6 | `SUBSCRIPTION_IN_GRACE_PERIOD` | 进入宽限期（续费失败但仍有权益） |
| 7 | `SUBSCRIPTION_RESTARTED` | 用户从 Play 商店恢复已取消的订阅 |
| 9 | `SUBSCRIPTION_DEFERRED` | 续期时间被延长（开发者触发） |
| 10 | `SUBSCRIPTION_PAUSED` | 订阅进入暂停状态 |
| 12 | `SUBSCRIPTION_REVOKED` | 到期前被撤销（退款） |
| 13 | `SUBSCRIPTION_EXPIRED` | 订阅过期 |
| 20 | `SUBSCRIPTION_PENDING_PURCHASE_CANCELED` | 待处理订阅交易被取消 |

### OneTimeProductNotification 类型

| Code | 类型 | 说明 |
|------|------|------|
| 1 | `ONE_TIME_PRODUCT_PURCHASED` | 一次性商品购买成功 |
| 2 | `ONE_TIME_PRODUCT_CANCELED` | 待处理的一次性购买被取消 |

### VoidedPurchaseNotification

```json
{
  "purchaseToken": "PURCHASE_TOKEN",
  "orderId": "GS.0000-0000-0000",
  "productType": 1,
  "refundType": 1
}
```

- `productType`：1=订阅，2=一次性商品
- `refundType`：1=全额退款，2=按数量部分退款

**RTDN 处理最佳实践：**
- 收到通知后 **必须** 调用 Developer API 获取完整状态（通知只告知状态变更，不包含详细信息）
- 用 `messageId` 去重，避免重复处理
- 需要显式启用 OneTimeProductNotification 才会收到一次性商品通知

## 测试

### 许可测试账号配置

1. **Google Play Console** → Settings → License testing → 添加测试 Gmail 地址
2. 测试账号必须在测试设备上登录
3. 发布应用到**内部测试轨道**（Internal testing track，推荐）
4. 测试者通过 opt-in 链接加入测试

### 测试支付方式

许可测试账号可使用以下测试支付工具（不产生真实扣费）：

| 支付方式 | 行为 |
|---------|------|
| Test instrument, always approves | 购买立即成功 |
| Test instrument, always declines | 购买被拒绝 |
| Slow test card, approves after a few minutes | 延迟成功（测试 Pending） |
| Slow test card, declines after a few minutes | 延迟失败 |

### Play Billing Lab

安装 [Play Billing Lab](https://play.google.com/store/apps/details?id=com.google.android.apps.play.billingtestcompanion) 应用，提供以下测试能力：

- **国家/地区模拟**：测试不同地区的价格和可用性（2 小时有效）
- **免费试用重复测试**：同一账号无限次测试试用期（无需创建多个账号）
- **订阅状态加速切换**：一键将订阅切换到宽限期、账户暂停、过期等状态
- **价格变更测试**：模拟订阅涨价场景

### 订阅加速续期时间表

| 生产周期 | 测试周期 |
|---------|---------|
| 1 周 | 5 分钟 |
| 1 个月 | 5 分钟 |
| 3 个月 | 10 分钟 |
| 6 个月 | 15 分钟 |
| 1 年 | 30 分钟 |

> 测试订阅最多续期 **6 次** 后自动过期（不含免费试用和优惠期）。

### 其他测试时间

| 功能 | 测试周期 |
|------|---------|
| 免费试用 | 3 分钟 |
| 宽限期（Grace period） | 5 分钟 |
| 账户暂停（Account hold） | 10 分钟 |
| 购买确认期限 | 5 分钟 |
| 暂停 1 个月 | 5 分钟 |
| 暂停 2 个月 | 10 分钟 |
| 暂停 3 个月 | 15 分钟 |

## 关键 API 摘要

| API / 类 | 用途 |
|----------|------|
| `BillingClient.newBuilder()` | 创建 BillingClient 实例 |
| `startConnection()` / `endConnection()` | 连接 / 断开 Google Play 服务 |
| `enableAutoServiceReconnection()` | PBL 8：自动重连（推荐） |
| `queryProductDetailsAsync()` | 查询商品详情（价格、描述、优惠） |
| `launchBillingFlow()` | 发起购买流程 |
| `PurchasesUpdatedListener` | 购买结果回调 |
| `consumePurchase()` / `consumeAsync()` | 消耗型商品确认（可重复购买） |
| `acknowledgePurchase()` | 非消耗型 / 订阅确认 |
| `queryPurchasesAsync()` | 查询用户当前持有的购买 |
| `ProductDetails.subscriptionOfferDetails` | 获取订阅的优惠 / 套餐详情 |
| `BillingFlowParams.SubscriptionUpdateParams` | 订阅升降级参数 |
| `SubscriptionProductReplacementParams` | PBL 8.1：产品级替换参数（推荐） |

## 常见陷阱

### 1. 三天确认期限导致自动退款

所有成功购买（`purchaseState == PURCHASED`）必须在 3 天内调用 `acknowledgePurchase` 或 `consumeAsync` 完成确认。忘记确认是最常见的生产事故。**务必在 APP 启动时调用 `queryPurchasesAsync` 检查并补确认。**

### 2. BillingClient 连接断开未处理

Google Play 服务可能随时断开。PBL 8 之前需要在 `onBillingServiceDisconnected` 中实现指数退避重连。PBL 8 推荐开启 `enableAutoServiceReconnection()` 自动处理，但仍需确认在操作前连接处于 OK 状态。

### 3. Pending Purchase 误发放权益

`purchaseState == PENDING` 时用户尚未完成付款（运营商代扣、慢速卡等），此时 **不能** 发放权益。必须等到状态变为 `PURCHASED`（通过 `PurchasesUpdatedListener` 或 `queryPurchasesAsync` 检测）。PBL 8 起 Pending 状态的购买 **没有 orderId**。

### 4. 测试账号未正确配置

常见问题：(1) 测试 Gmail 未添加到 License Testing 列表；(2) 应用未发布到任何测试轨道；(3) 测试者未通过 opt-in 链接加入；(4) 设备上登录了非测试账号。这些都会导致使用真实支付而非测试支付。

### 5. 订阅 offerToken 未正确传入

订阅类商品调用 `launchBillingFlow` 时 **必须** 设置 `offerToken`。不设置会导致购买失败。即使用户选择的是无优惠的基础套餐，也需要从 `subscriptionOfferDetails` 中获取对应的 `offerToken`。

### 6. 服务端仅依赖客户端数据验证

客户端传来的 `purchaseToken` 和 `orderId` 可以被篡改。服务端必须用 `purchaseToken` 调用 Google Play Developer API 独立验证购买有效性，而非信任客户端数据。

### 7. RTDN 通知未去重

Cloud Pub/Sub 保证 **至少一次** 投递，可能收到重复通知。必须用 `messageId` 做幂等处理，避免重复发放权益或重复记录状态变更。

### 8. queryPurchasesAsync 未覆盖所有商品类型

`queryPurchasesAsync` 需要分别查询 `INAPP` 和 `SUBS` 两种类型。只查询一种会遗漏另一种类型的未确认购买。

### 9. PBL 8 移除 API 导致编译失败

PBL 8 移除了多个已弃用 API：`querySkuDetailsAsync`、`queryPurchaseHistoryAsync`、无参 `enablePendingPurchases()`、`ProrationMode`。从 PBL 6/7 升级时需要全部替换为新 API。

### 10. 订阅降级使用错误的 ReplacementMode

降级应使用 `DEFERRED` 模式让用户保留当前周期的权益直到到期。使用 `WITH_TIME_PRORATION` 或 `CHARGE_PRORATED_PRICE` 进行降级会导致用户立即失去高级权益，体验不佳。

## 注意事项

- **PBL 版本要求**：2025-08-31 起所有新应用和更新必须使用 PBL 7+；推荐直接使用 PBL 8.x
- **PBL 8 术语变更**：「In-app items」改称「One-time products」（一次性商品）
- **PBL 8.1 minSdk 提升**：`minSdkVersion` 从 21 提升至 **23**
- **一次性商品也支持多 Offer**：PBL 8 起一次性商品与订阅一样支持多种购买选项和优惠
- **queryPurchaseHistoryAsync 已移除**：PBL 8 移除了此方法，改用服务端 API 查询历史
- **ProrationMode 已移除**：PBL 7 起废弃，PBL 8 彻底移除，统一使用 `ReplacementMode`
- **enablePendingPurchases 必须传参**：PBL 8 移除了无参版本，必须传入 `PendingPurchasesParams`

## 组合提示

| 搭配模块 | 说明 |
|---------|------|
| **payment-common** | 通用支付概念（幂等性、订单状态机）适用于服务端 IAP 订单管理 |
| **payment-security** | 服务端验签思路可参考，但 Google Play 使用 purchaseToken + API 验证而非签名验签 |
| **payment-reconciliation** | 对账流程同样适用于 IAP：定期用 Developer API 与本地订单做差异比对 |
| **payment-resilience** | 重试、降级策略适用于调用 Google Play Developer API 时的容错 |
| **payment-android-sdk** | 如果应用同时支持国内支付渠道（支付宝/微信），可与 IAP 共存但需隔离支付流程 |
| **payment-ios-iap** | iOS StoreKit 2 的对标方案，服务端可共享订阅验证和权益管理逻辑 |
