---
name: payment-ios-iap
description: "iOS 应用内购买：StoreKit 2 商品查询/购买/交易管理、订阅生命周期、App Store Server API v2 验签与通知。"
tech_stack: [payment, ios, mobile-native]
language: [swift]
---

# iOS 应用内购买（StoreKit 2 + App Store Server API v2）

> 来源：Apple Developer Documentation — StoreKit / App Store Server API / App Store Server Notifications V2
> 版本基准：StoreKit 2（iOS 15+）、App Store Server API v2（2024-2025）、WWDC25 新增 API
> 最低部署目标：iOS 15（核心 API）；iOS 17+（StoreKit Views）；iOS 26（SubscriptionOfferView）

## 用途

StoreKit 2 是 Apple 提供的现代应用内购买框架，基于 Swift async/await 构建，用于在 iOS/macOS/tvOS/watchOS 应用中实现商品查询、购买、交易验证、订阅管理的完整流程。配合 App Store Server API v2 可在服务端完成交易验签、退款查询和实时通知处理。

## 何时使用

- 新项目需要接入应用内购买（一次性购买、消耗型、订阅）
- 从 StoreKit 1（Original API / SKPaymentQueue）迁移到 StoreKit 2
- 服务端需要验证 App Store 交易、处理退款、监听订阅状态变更
- 需要实现订阅升降级、优惠码兑换、促销优惠等高级订阅功能
- 需要在 Xcode 中本地测试 IAP 流程（无需 Sandbox 账号）

---

## 商品类型

| 类型 | 英文标识 | 说明 | finish() 必须调用 |
|------|----------|------|-------------------|
| 消耗型 | `consumable` | 用完即失效，可重复购买（如虚拟货币、体力） | 是（每次购买后） |
| 非消耗型 | `nonConsumable` | 一次购买永久拥有（如解锁关卡、去广告） | 是（首次购买后） |
| 自动续期订阅 | `autoRenewable` | 定期自动扣费，到期前自动续订 | 是（每笔交易） |
| 非续期订阅 | `nonRenewable` | 一段时间有效，到期不自动续订 | 是（每笔交易） |

---

## 基础用法：完整 Store 管理器

```swift
import StoreKit

@MainActor
final class StoreManager: ObservableObject {

    // MARK: - Published State
    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []

    /// 你的商品 ID（与 App Store Connect 中配置一致）
    private let productIDs: Set<String> = [
        "com.example.app.coins100",         // consumable
        "com.example.app.removeAds",        // nonConsumable
        "com.example.app.pro.monthly",      // autoRenewable
        "com.example.app.pro.yearly"        // autoRenewable
    ]

    /// 后台监听任务（必须在 app 存活期间持有）
    private var updateListenerTask: Task<Void, Never>?

    // MARK: - Lifecycle

    init() {
        // 1. 启动时立即监听交易更新
        updateListenerTask = listenForTransactionUpdates()
        // 2. 加载商品 & 恢复已购权益
        Task {
            await fetchProducts()
            await refreshPurchasedStatus()
        }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - 商品查询

    func fetchProducts() async {
        do {
            let storeProducts = try await Product.products(for: productIDs)
            // 按价格排序方便 UI 展示
            products = storeProducts.sorted { $0.price < $1.price }
        } catch {
            print("[StoreManager] 商品查询失败: \(error)")
        }
    }

    // MARK: - 购买

    func purchase(_ product: Product) async throws -> Transaction? {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            // 先发放内容 / 更新状态，再 finish
            await refreshPurchasedStatus()
            await transaction.finish()    // ← 关键：必须调用
            return transaction

        case .userCancelled:
            return nil

        case .pending:
            // Ask to Buy 或家长审批，等 Transaction.updates 后续通知
            return nil

        @unknown default:
            return nil
        }
    }

    // MARK: - 交易验证

    /// StoreKit 2 自动进行 JWS 签名验证
    /// .verified   → 苹果签名有效
    /// .unverified → 签名无效或被篡改，应拒绝
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe):
            return safe
        case .unverified(_, let error):
            throw error
        }
    }

    // MARK: - 权益刷新

    func refreshPurchasedStatus() async {
        var purchased: Set<String> = []
        // currentEntitlements 是有限 AsyncSequence，不会永久挂起
        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                purchased.insert(transaction.productID)
            }
        }
        purchasedProductIDs = purchased
    }

    // MARK: - 交易更新监听

    /// 监听所有非直接 purchase() 产生的交易更新
    /// 包括：续订、退款、Ask to Buy 审批、促销兑换、其他设备购买
    private func listenForTransactionUpdates() -> Task<Void, Never> {
        Task.detached {
            for await result in Transaction.updates {
                if let transaction = try? await self.checkVerified(result) {
                    await self.refreshPurchasedStatus()
                    await transaction.finish()
                }
            }
        }
    }

    // MARK: - 恢复购买（非消耗型 & 订阅）

    func restorePurchases() async {
        try? await AppStore.sync()   // iOS 15+：触发与 App Store 同步
        await refreshPurchasedStatus()
    }
}
```

---

## 交易管理核心 API

### Transaction 关键属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `UInt64` | 交易唯一 ID |
| `originalID` | `UInt64` | 原始交易 ID（续订时追溯首次购买） |
| `productID` | `String` | 商品标识 |
| `productType` | `Product.ProductType` | 商品类型 |
| `purchaseDate` | `Date` | 购买时间 |
| `expirationDate` | `Date?` | 订阅过期时间 |
| `revocationDate` | `Date?` | 撤销时间（退款后非 nil） |
| `isUpgraded` | `Bool` | 是否被升级覆盖 |
| `offerType` | `Transaction.OfferType?` | 优惠类型（intro / promo / code） |
| `environment` | `AppStore.Environment` | sandbox / production / xcode |

### 交易序列

```swift
// 所有未完成的交易（App 启动时处理）
for await result in Transaction.unfinished {
    if let transaction = try? checkVerified(result) {
        // 发放内容后 finish
        await transaction.finish()
    }
}

// 当前有效权益（查询用户已拥有的非消耗型 & 活跃订阅）
for await result in Transaction.currentEntitlements {
    // ...
}

// 全量交易历史
for await result in Transaction.all {
    // ...
}

// 按商品查最新交易
let latestTransaction = await Transaction.latest(for: "com.example.app.pro.monthly")
```

### finish() 调用规则

| 场景 | 是否必须 finish() | 说明 |
|------|-------------------|------|
| 消耗型购买 | 必须 | 不 finish 则用户无法再次购买同一商品 |
| 非消耗型购买 | 必须 | 不 finish 会出现在 unfinished 队列中 |
| 订阅续订 | 必须 | 每笔续订交易都需要 finish |
| 未验证通过的交易 | 不建议 | 签名无效说明可能被篡改，应拒绝 |

---

## 订阅管理

### 查询订阅状态

```swift
func checkSubscriptionStatus(for groupID: String) async -> Product.SubscriptionInfo.RenewalState? {
    guard let statuses = try? await Product.SubscriptionInfo.status(for: groupID) else {
        return nil
    }
    // 一个订阅组可能有多个状态（升降级场景）
    for status in statuses {
        guard let transaction = try? checkVerified(status.transaction) else { continue }

        // 跳过已被升级覆盖的旧订阅
        if transaction.isUpgraded { continue }

        return status.state   // .subscribed / .expired / .revoked / ...
    }
    return nil
}
```

### 续订状态枚举

| 状态 | 值 | 用户是否应有权限 | 说明 |
|------|-----|-----------------|------|
| `subscribed` | 1 | 是 | 正常订阅中 |
| `expired` | 2 | 否 | 已过期且未续订 |
| `inBillingRetryPeriod` | 3 | 否（建议） | 扣费失败，Apple 重试中（最长 60 天） |
| `inGracePeriod` | 4 | 是 | 扣费失败但在宽限期内（需在 ASC 开启） |
| `revoked` | 5 | 否 | 被 Apple 撤销（退款或家庭共享移除） |

### RenewalInfo 关键字段

```swift
if let renewalInfo = try? checkVerified(status.renewalInfo) {
    renewalInfo.autoRenewPreference   // 用户选择的续订商品 ID（可能升降级）
    renewalInfo.willAutoRenew         // 是否开启自动续订
    renewalInfo.expirationReason      // 过期原因
    renewalInfo.gracePeriodExpirationDate  // 宽限期截止时间
    // iOS 17+
    renewalInfo.renewalDate           // 下次续订时间
}
```

### 升降级

```swift
// 同一订阅组内的商品自动支持升降级
// Apple 根据 App Store Connect 中配置的 subscription group level 决定升/降
// 升级：立即生效，按比例退还旧订阅剩余金额
// 降级：当前周期结束后生效

// 用户只需 purchase 目标商品即可，StoreKit 自动处理升降级逻辑
let upgradeResult = try await yearlyProduct.purchase()
```

### 优惠类型

| 优惠类型 | 适用对象 | 触发方式 |
|----------|---------|---------|
| Introductory Offer | 从未订阅过的新用户 | 自动展示（免费试用/折扣价/预付费） |
| Promotional Offer | 已订阅 / 曾订阅的用户 | 需服务端签名生成 offer 后展示 |
| Offer Codes | 任何用户 | 用户输入兑换码 / 通过 URL 兑换 |

```swift
// 检查用户是否有资格享受 introductory offer
if let subscription = product.subscription {
    let eligible = await subscription.isEligibleForIntroOffer
    if eligible {
        // 展示试用入口
    }
}

// Promotional Offer（需服务端生成签名）
let offerID = "promo_50_off"
let signedOffer = ... // 由你的服务端生成的签名数据
let result = try await product.purchase(options: [
    .promotionalOffer(
        offerID: offerID,
        keyID: keyID,
        nonce: nonce,
        signature: signature,
        timestamp: timestamp
    )
])

// Offer Codes 兑换（展示系统兑换页面）
try await AppStore.presentOfferCodeRedeemSheet(in: windowScene)
```

---

## StoreKit Views（iOS 17+ / SwiftUI）

StoreKit 2 提供三种开箱即用的 SwiftUI 视图，自动处理商品加载、购买流程和权益状态：

```swift
import StoreKit
import SwiftUI

// 1. ProductView：展示单个商品
ProductView(id: "com.example.app.removeAds") {
    // 自定义图标
    Image(systemName: "xmark.circle")
}

// 2. StoreView：展示多个商品列表
StoreView(ids: ["com.example.app.coins100", "com.example.app.removeAds"])

// 3. SubscriptionStoreView：展示订阅组（最常用）
SubscriptionStoreView(groupID: "ABCDEF12") {
    // 顶部自定义营销内容
    VStack {
        Image("premium_banner")
        Text("解锁全部功能")
    }
}
.subscriptionStoreButtonLabel(.multiline)
.storeButton(.visible, for: .restorePurchases)

// 4. SubscriptionOfferView（iOS 26+）：展示升降级优惠
SubscriptionOfferView(
    subscription: loadedProduct,
    visibleRelationship: .upgrade
)
```

---

## 服务端验签：App Store Server API v2

### 认证方式

所有 API 请求使用 JWT Bearer Token 认证：

```
Authorization: Bearer <JWT>
```

**JWT 生成要素**：

| 字段 | 来源 | 说明 |
|------|------|------|
| `iss` | App Store Connect → Keys → Issuer ID | 签发者 |
| `iat` | 当前时间戳 | 签发时间 |
| `exp` | iat + N（最大 20 分钟） | 过期时间 |
| `aud` | `"appstoreconnect-v1"` | 固定值 |
| `bid` | 你的 app Bundle ID | 应用标识 |
| `kid`（header） | API Key ID | 密钥标识 |
| `alg`（header） | `ES256` | 固定算法 |

**密钥获取路径**：App Store Connect → Users and Access → Integrations → In-App Purchase → Generate API Key

### 核心端点

| 用途 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 获取交易信息 | GET | `/inApps/v2/transactions/{transactionId}` | 查询单笔交易详情 |
| 获取交易历史 | GET | `/inApps/v2/history/{originalTransactionId}` | 用户全部交易历史（分页） |
| 获取所有订阅状态 | GET | `/inApps/v1/subscriptions/{originalTransactionId}` | 用户所有自动续期订阅状态 |
| 查询退款历史 | GET | `/inApps/v2/refund/lookup/{originalTransactionId}` | 查询用户退款记录 |
| 查询 Order ID | GET | `/inApps/v1/lookup/{orderId}` | 根据订单号查交易 |
| 发送消费信息 | PUT | `/inApps/v2/transactions/consumption/{originalTransactionId}` | 向 Apple 报告消费情况（影响退款裁决） |
| 请求通知历史 | POST | `/inApps/v1/notifications/history` | 查询错过的通知 |
| 请求测试通知 | POST | `/inApps/v1/notifications/test` | 触发测试通知验证端点可达 |
| 获取通知测试结果 | GET | `/inApps/v1/notifications/test/{testNotificationToken}` | 查询测试通知投递结果 |

### 服务端交易验证示例（Node.js）

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');
const axios = require('axios');

// 1. 生成 JWT
function generateJWT() {
    const privateKey = fs.readFileSync('AuthKey_XXXXXXXXXX.p8');
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: 'YOUR_ISSUER_ID',         // App Store Connect Issuer ID
        iat: now,
        exp: now + 300,                 // 5 分钟有效
        aud: 'appstoreconnect-v1',
        bid: 'com.example.app'
    };

    return jwt.sign(payload, privateKey, {
        algorithm: 'ES256',
        header: {
            alg: 'ES256',
            kid: 'YOUR_KEY_ID',         // API Key ID
            typ: 'JWT'
        }
    });
}

// 2. 查询交易
async function getTransactionInfo(transactionId) {
    const token = generateJWT();
    const baseURL = 'https://api.storekit.itunes.apple.com'; // 生产环境
    // 沙箱：https://api.storekit-sandbox.itunes.apple.com

    const response = await axios.get(
        `${baseURL}/inApps/v2/transactions/${transactionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    // 返回的 signedTransactionInfo 是 JWS 格式
    const signedTransaction = response.data.signedTransactionInfo;
    // 解码 JWS payload（第二段 Base64）验证后使用
    return decodeAndVerifyJWS(signedTransaction);
}
```

---

## App Store Server Notifications V2

### 配置方式

App Store Connect → App → App Information → App Store Server Notifications：
- **Production Server URL**：你的生产环境接收端点
- **Sandbox Server URL**：沙箱环境接收端点
- 选择 **Version 2**

### Notification 结构

Apple 推送 POST 请求，body 为 JSON：

```json
{
    "signedPayload": "<JWS string>"
}
```

解码 `signedPayload`（JWS）后得到：

```json
{
    "notificationType": "DID_RENEW",
    "subtype": "BILLING_RECOVERY",
    "notificationUUID": "...",
    "data": {
        "appAppleId": 123456,
        "bundleId": "com.example.app",
        "environment": "Production",
        "signedTransactionInfo": "<JWS>",
        "signedRenewalInfo": "<JWS>"
    },
    "signedDate": 1700000000000
}
```

### notificationType 完整列表

| 通知类型 | 子类型 | 说明 |
|---------|--------|------|
| `SUBSCRIBED` | `INITIAL_BUY` | 用户首次购买订阅 |
| `SUBSCRIBED` | `RESUBSCRIBE` | 用户重新订阅（曾过期） |
| `DID_RENEW` | (无) | 订阅成功续订 |
| `DID_RENEW` | `BILLING_RECOVERY` | 之前扣费失败，重试成功 |
| `DID_CHANGE_RENEWAL_STATUS` | `AUTO_RENEW_ENABLED` | 用户重新开启自动续订 |
| `DID_CHANGE_RENEWAL_STATUS` | `AUTO_RENEW_DISABLED` | 用户关闭自动续订 |
| `DID_CHANGE_RENEWAL_PREF` | `UPGRADE` | 用户选择升级到更高级别订阅 |
| `DID_CHANGE_RENEWAL_PREF` | `DOWNGRADE` | 用户选择降级（下周期生效） |
| `DID_FAIL_TO_RENEW` | `GRACE_PERIOD` | 续订扣费失败，进入宽限期 |
| `DID_FAIL_TO_RENEW` | (无) | 续订扣费失败（无宽限期） |
| `EXPIRED` | `VOLUNTARY` | 用户主动取消后自然过期 |
| `EXPIRED` | `BILLING_RETRY` | 重试期内一直扣费失败，最终过期 |
| `EXPIRED` | `PRICE_INCREASE` | 用户未同意涨价导致过期 |
| `EXPIRED` | `PRODUCT_NOT_FOR_SALE` | 商品下架 |
| `GRACE_PERIOD_EXPIRED` | (无) | 宽限期结束仍未续费成功 |
| `OFFER_REDEEMED` | `INITIAL_BUY` | 新用户通过优惠码首次订阅 |
| `OFFER_REDEEMED` | `RESUBSCRIBE` | 过期用户通过优惠码重新订阅 |
| `OFFER_REDEEMED` | `UPGRADE` / `DOWNGRADE` | 通过优惠码升降级 |
| `PRICE_INCREASE` | `PENDING` | 涨价等待用户确认 |
| `PRICE_INCREASE` | `ACCEPTED` | 用户接受涨价 |
| `REFUND` | (无) | Apple 批准退款 |
| `REFUND_DECLINED` | (无) | Apple 拒绝退款请求 |
| `REFUND_REVERSED` | (无) | 退款被撤回（罕见） |
| `REVOKE` | (无) | 家庭共享被撤销或其他原因撤销权益 |
| `CONSUMPTION_REQUEST` | (无) | Apple 请求消费信息（退款裁决参考） |
| `RENEWAL_EXTENDED` | (无) | 订阅被延长（客服补偿等） |
| `RENEWAL_EXTENSION` | `SUMMARY` | 批量延长的汇总通知 |
| `RENEWAL_EXTENSION` | `FAILURE` | 延长操作失败 |
| `TEST` | (无) | 测试通知（由 API 触发） |
| `EXTERNAL_PURCHASE_TOKEN` | `UNREPORTED` | 外部购买 token（EU 合规） |

### 服务端处理通知示例

```javascript
const jose = require('jose');

async function handleNotification(req, res) {
    const { signedPayload } = req.body;

    // 1. 解码 JWS header 获取 kid
    const header = jose.decodeProtectedHeader(signedPayload);

    // 2. 从 Apple 根证书链验证签名
    //    Apple Root CA: https://www.apple.com/certificateauthority/
    //    实际项目建议使用 apple-app-store-server-library
    const payload = await verifyAndDecodeJWS(signedPayload);

    // 3. 根据 notificationType 分发处理
    switch (payload.notificationType) {
        case 'SUBSCRIBED':
            await handleNewSubscription(payload);
            break;
        case 'DID_RENEW':
            await handleRenewal(payload);
            break;
        case 'EXPIRED':
            await handleExpiration(payload);
            break;
        case 'REFUND':
            await handleRefund(payload);
            break;
        case 'DID_CHANGE_RENEWAL_STATUS':
            await handleRenewalStatusChange(payload);
            break;
        case 'CONSUMPTION_REQUEST':
            // 需在 12 小时内调用 Send Consumption Information API 回复
            await handleConsumptionRequest(payload);
            break;
        // ... 其他类型
    }

    // 4. 必须返回 200，否则 Apple 会重试
    res.status(200).send();
}
```

---

## 沙箱与测试

### 测试环境对比

| 特性 | Xcode StoreKit Testing | Sandbox | TestFlight |
|------|----------------------|---------|------------|
| 需要 ASC 配置商品 | 否（本地 .storekit 文件） | 是 | 是 |
| 需要 Sandbox 账号 | 否 | 是 | 否（用 Apple ID） |
| 需要真机 | 否（模拟器可用） | 是 | 是 |
| 支持订阅时间加速 | 是（可自定义） | 是（固定加速比） |是 |
| 服务端通知 | 不发送 | 发送到沙箱 URL | 发送到沙箱 URL |
| 适用阶段 | 开发/单元测试 | 集成测试 | 预发布验证 |

### Xcode StoreKit Testing 配置

1. **创建配置文件**：File → New → File → StoreKit Configuration File
2. **添加商品**：在 .storekit 文件中点击 "+" 添加各类型商品
3. **关联 Scheme**：Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration → 选择你的 .storekit 文件
4. **运行测试**：直接 Run，无需真机和网络

```swift
// 单元测试中使用 StoreKit Test
import StoreKitTest

func testPurchaseFlow() async throws {
    // 加载本地配置
    let session = try SKTestSession(configurationFileNamed: "Products")
    session.disableDialogs = true      // 跳过系统确认弹窗
    session.clearTransactions()         // 清空历史交易

    // 执行购买
    let products = try await Product.products(for: ["com.example.app.removeAds"])
    let result = try await products.first!.purchase()

    // 断言
    if case .success(let verification) = result,
       case .verified(let transaction) = verification {
        XCTAssertEqual(transaction.productID, "com.example.app.removeAds")
        await transaction.finish()
    } else {
        XCTFail("Purchase should succeed")
    }
}
```

### Transaction Manager

Xcode 菜单 **Debug → StoreKit → Manage Transactions**：
- 查看所有测试交易
- 批准/拒绝 Ask to Buy 请求
- 模拟退款
- 触发订阅续订/过期
- 修改订阅续订时间

### Sandbox 账号配置

App Store Connect → Users and Access → Sandbox → Testers：
- 使用未注册过 Apple ID 的邮箱
- Sandbox 订阅加速比：1 天 = 实际 ~5 分钟，1 周 = ~30 分钟，1 月 = ~1 小时，1 年 = ~1 小时
- Sandbox 订阅最多自动续订 12 次后停止
- 在设备 Settings → App Store → Sandbox Account 登录

### 沙箱 vs 生产环境关键差异

| 维度 | Sandbox | Production |
|------|---------|------------|
| API Base URL | `api.storekit-sandbox.itunes.apple.com` | `api.storekit.itunes.apple.com` |
| Transaction.environment | `.sandbox` | `.production` |
| 订阅续订周期 | 加速（见上表） | 真实周期 |
| 支付 | 不会真实扣费 | 真实扣费 |
| 退款测试 | 支持（通过 reportIssue.apple.com） | 由 Apple 客服处理 |

---

## 从 StoreKit 1 迁移

### 核心 API 对比

| 功能 | StoreKit 1（Original API） | StoreKit 2 |
|------|---------------------------|------------|
| 商品查询 | `SKProductsRequest` + delegate 回调 | `Product.products(for:)` async |
| 发起购买 | `SKPaymentQueue.add(payment)` | `product.purchase()` async |
| 交易监听 | `SKPaymentTransactionObserver` delegate | `Transaction.updates` AsyncSequence |
| 完成交易 | `SKPaymentQueue.finishTransaction()` | `transaction.finish()` async |
| 收据验证 | 本地读取 `Bundle.main.appStoreReceiptURL` → 发服务端 → `/verifyReceipt` | 客户端 JWS 自动验证 / 服务端 App Store Server API |
| 恢复购买 | `SKPaymentQueue.restoreCompletedTransactions()` | `AppStore.sync()` / `Transaction.currentEntitlements` |
| 权益查询 | 无直接 API，需自行解析收据 | `Transaction.currentEntitlements` |
| 订阅状态 | 无直接 API，需服务端查 | `Product.SubscriptionInfo.status(for:)` |
| 并发模型 | delegate / NotificationCenter 回调 | Swift async/await |
| 最低版本 | iOS 3+ | iOS 15+ |

### 渐进迁移策略

1. **两套 API 可共存**：StoreKit 1 和 2 在同一 App 中不冲突，任一端 finish 的交易对方都可见
2. **先迁移查询和权益**：用 `Product.products(for:)` 替换 `SKProductsRequest`，用 `Transaction.currentEntitlements` 替换收据解析
3. **再迁移购买流程**：用 `product.purchase()` 替换 `SKPaymentQueue.add()`
4. **最后迁移交易监听**：用 `Transaction.updates` 替换 `SKPaymentTransactionObserver`
5. **服务端同步迁移**：从 `/verifyReceipt`（已废弃）迁移到 App Store Server API v2

> 注意：Apple 已在 WWDC23 宣布废弃 `/verifyReceipt` 端点，强烈建议迁移到 App Store Server API v2。

---

## 常见陷阱

### 1. 忘记在 App 启动时处理未完成交易

```swift
// 错误：只在购买成功后 finish，忽略了 App 被杀重启的场景
// 正确：App 启动时必须处理 unfinished 交易
// 在 App init 或 @main 入口点处理：
Task {
    for await result in Transaction.unfinished {
        if let transaction = try? checkVerified(result) {
            // 发放内容
            await transaction.finish()
        }
    }
}
```

如果不处理，消耗型商品无法重复购买，非消耗型会反复出现在 `Transaction.updates` 中。

### 2. 先 finish() 再发放内容导致内容丢失

```swift
// 错误顺序
await transaction.finish()         // ← finish 后交易消失
deliverContent(transaction)        // ← 如果这一步失败，用户付了钱但没拿到东西

// 正确顺序
deliverContent(transaction)        // ← 先确保内容发放成功
await transaction.finish()         // ← 再标记完成
```

### 3. 忽略订阅续订交易的 finish()

每笔续订交易都是独立的 Transaction 对象，都必须调用 `finish()`。如果只在首次订阅时 finish 而忽略续订，未完成交易会堆积，导致后续购买行为异常（如 `purchase()` 返回过期交易而非新交易）。

### 4. 多个 Transaction.updates 监听器冲突

```swift
// 错误：在多个 ViewModel 中各自监听 Transaction.updates
// StoreKit 只会将每笔交易推送给其中一个监听器

// 正确：全局只创建一个监听器（通常在 App 入口或单例 StoreManager）
@main
struct MyApp: App {
    let storeManager = StoreManager()   // 单例，内部持有唯一监听 Task
    var body: some Scene { ... }
}
```

### 5. Sandbox 环境下订阅行为与生产环境不同

- Sandbox 订阅最多续订 12 次后自动停止（生产环境无此限制）
- Sandbox 时间加速导致宽限期、重试期的实际时长与生产不同
- Sandbox 环境偶尔不稳定（Apple 服务端问题），不代表代码有 bug
- 建议先用 Xcode StoreKit Testing（本地可控）再用 Sandbox 联调

### 6. 服务端使用已废弃的 /verifyReceipt 端点

`/verifyReceipt` 已被 Apple 标记为废弃，存在以下问题：
- 不再获得新功能支持
- 返回的是整个收据 blob，解析复杂
- 无法区分 sandbox/production 环境需两次请求尝试

应迁移到 App Store Server API v2，使用 JWS 格式的 `signedTransactionInfo`。

### 7. 未正确处理 .pending 状态（Ask to Buy）

```swift
case .pending:
    // 错误：当作购买失败处理
    // 正确：提示用户等待家长/监护人审批
    //       审批结果会通过 Transaction.updates 推送
    showPendingMessage()
```

家庭共享中的儿童账号购买必定进入 `.pending`，忽略会导致用户体验断裂。

### 8. 未处理 CONSUMPTION_REQUEST 通知

当用户申请退款时，Apple 可能发送 `CONSUMPTION_REQUEST` 通知。开发者需在 **12 小时内**通过 Send Consumption Information API 回复用户的消费情况（如游戏币是否已使用），否则 Apple 将在缺少信息的情况下裁决退款，通常对开发者不利。

### 9. 价格展示使用硬编码而非 Product.displayPrice

```swift
// 错误：硬编码价格
Text("$9.99/月")

// 正确：使用 StoreKit 提供的本地化价格
Text(product.displayPrice)  // 自动适配货币、地区格式
// 如 "¥68.00"、"$9.99"、"€8,99"
```

### 10. 订阅组层级配置错误导致升降级异常

在 App Store Connect 中，同一 Subscription Group 内的商品需要正确设置 Level（级别）：
- Level 1 为最高等级
- 用户从 Level 2 购买 Level 1 = 升级（立即生效）
- 用户从 Level 1 购买 Level 2 = 降级（周期末生效）
- 同级别 = 跨等级切换（周期末生效）

Level 配置错误会导致用户预期的"升级"实际表现为"降级"（需等到当前周期结束才生效）。

---

## 组合提示

| 搭配技术 | 场景 |
|----------|------|
| **SwiftUI + StoreKit Views** | 最快的订阅 UI 方案，iOS 17+ 用 `SubscriptionStoreView` 省去 90% 的 UI 代码 |
| **App Store Server Library**（apple/app-store-server-library-node / python / java / swift） | 服务端 JWS 验签、通知解析的官方库，避免手动处理证书链 |
| **RevenueCat / Adapty / Qonversion** | 第三方订阅管理平台，封装 StoreKit + 服务端验签 + 分析，适合不想自建后端的团队 |
| **Keychain** | 本地缓存已购权益状态，避免每次启动都查询 `currentEntitlements` 的延迟 |
| **CloudKit / UserDefaults + iCloud** | 非续期订阅的有效期需要自行管理，建议同步到 iCloud 实现跨设备 |
| **App Store Connect API** | 管理商品配置、查看销售数据、管理 Sandbox 测试账号 |
| **Firebase / 自建后端** | 服务端订阅状态数据库，接收 Server Notifications V2 持久化订阅生命周期事件 |
| **App Tracking Transparency** | 订阅转化归因分析需配合 ATT 授权 |
