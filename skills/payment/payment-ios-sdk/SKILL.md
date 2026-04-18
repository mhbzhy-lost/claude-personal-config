---
name: payment-ios-sdk
description: "iOS 支付 SDK 接入：支付宝/微信支付/银联三方 SDK 集成与调起、Apple Pay PassKit 集成。"
tech_stack: [payment, ios, mobile-native]
language: [swift]
capability: [payment-gateway, native-device]
---

# iOS 三方支付 SDK 接入

> 来源：
> - [支付宝 iOS 集成流程](https://opendocs.alipay.com/open/204/105295/)
> - [微信支付 APP 端开发步骤](https://pay.weixin.qq.com/wiki/doc/api/app/app.php?chapter=8_5)
> - [银联开放平台](https://open.unionpay.com/tjweb/doc/mchnt/list?productId=3)
> - [Apple PassKit 文档](https://developer.apple.com/documentation/passkit)

## 用途

在 iOS 原生应用中集成支付宝、微信支付、银联三方支付 SDK 以及 Apple Pay，实现从客户端调起支付到回调处理的完整流程。

## 何时使用

- App 内需要支持支付宝 / 微信支付 / 银联等三方收银台
- 需要接入 Apple Pay 提供原生 NFC 支付体验
- 需要统一管理多种支付渠道的调起与回调
- 电商、O2O、会员充值等需要在线支付的场景
- 需要处理 Universal Links / URL Scheme 回调兼容

---

## 一、支付宝 iOS SDK

### 1.1 集成方式

**CocoaPods（推荐）：**

```ruby
# Podfile
pod 'AlipaySDK-iOS'
```

```bash
pod install
```

**手动集成：**
从 [支付宝 SDK 下载页](https://opendocs.alipay.com/open/04km1h) 下载，将 `AlipaySDK.framework` 和 `AlipaySDK.bundle` 拖入工程，添加依赖库：
`libc++.tbd`, `libz.tbd`, `SystemConfiguration.framework`, `CoreTelephony.framework`, `CFNetwork.framework`, `CoreMotion.framework`

### 1.2 Info.plist 配置

```xml
<!-- URL Schemes：供支付宝回调跳回 App -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp_alipay</string> <!-- 自定义 scheme，与调起时 fromScheme 一致 -->
        </array>
    </dict>
</array>

<!-- 白名单：允许检测/跳转支付宝 App -->
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>alipay</string>
    <string>alipayshare</string>
</array>
```

### 1.3 Universal Links 配置（推荐，iOS 13+）

1. Apple Developer Portal 开启 Associated Domains
2. Xcode -> Signing & Capabilities -> Associated Domains 添加 `applinks:yourdomain.com`
3. 服务端 `https://yourdomain.com/.well-known/apple-app-site-association` 配置：

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TeamID>.<BundleID>",
        "paths": ["/alipay/*"]
      }
    ]
  }
}
```

4. 在支付宝开放平台后台配置对应的 Universal Link

### 1.4 调起支付与回调处理

```swift
import UIKit

// MARK: - 支付宝支付管理器
class AlipayManager {

    static let shared = AlipayManager()
    /// 自定义 scheme，须与 Info.plist 中一致
    private let appScheme = "myapp_alipay"

    /// 调起支付宝支付
    /// - Parameters:
    ///   - orderString: 服务端签名后返回的完整订单字符串
    ///   - completion: 客户端回调（仅做 UI 展示，最终以服务端为准）
    func pay(orderString: String, completion: @escaping (AlipayResult) -> Void) {
        AlipaySDK.defaultService()?.payOrder(
            orderString,
            fromScheme: appScheme,
            callback: { resultDict in
                guard let dict = resultDict as? [String: Any],
                      let statusStr = dict["resultStatus"] as? String else {
                    completion(.failure)
                    return
                }
                completion(AlipayResult.from(statusCode: statusStr))
            }
        )
    }

    /// 处理 URL 回调（从支付宝跳回 App）
    func handleOpenURL(_ url: URL) {
        if url.host == "safepay" {
            AlipaySDK.defaultService()?.processOrder(
                withPaymentResult: url,
                standbyCallback: { resultDict in
                    // 此处处理同 pay callback
                    print("Alipay callback: \(resultDict ?? [:])")
                }
            )
        }
    }
}

// MARK: - 支付结果枚举
enum AlipayResult {
    case success        // 9000：支付成功
    case processing     // 8000：正在处理中（如银行卡需要确认）
    case failure        // 4000：支付失败
    case cancelled      // 6001：用户取消
    case networkError   // 6002：网络连接出错
    case unknown

    static func from(statusCode: String) -> AlipayResult {
        switch statusCode {
        case "9000": return .success
        case "8000": return .processing
        case "4000": return .failure
        case "6001": return .cancelled
        case "6002": return .networkError
        default:     return .unknown
        }
    }
}
```

### 1.5 AppDelegate / SceneDelegate 回调入口

```swift
// MARK: - AppDelegate（iOS 12 及以下，或未启用 SceneDelegate）
func application(_ app: UIApplication,
                 open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    AlipayManager.shared.handleOpenURL(url)
    return true
}

// MARK: - SceneDelegate（iOS 13+，启用了 Scene 生命周期）
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    AlipayManager.shared.handleOpenURL(url)
}
```

---

## 二、微信支付 iOS SDK

### 2.1 集成方式

**CocoaPods：**

```ruby
pod 'WechatOpenSDK-XCFramework'   # 推荐 XCFramework 版本
```

**SPM（Xcode 15+）：**
微信 SDK 自 2.0.2 起支持 SPM，在 Xcode 中 File -> Add Package Dependencies，输入：
`https://github.com/nicklama/wechat-sdk-swift-package`（社区维护）

### 2.2 Info.plist 配置

```xml
<!-- URL Schemes -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>wx1234567890abcdef</string> <!-- 微信 AppID -->
        </array>
    </dict>
</array>

<!-- 白名单 -->
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>weixin</string>
    <string>weixinULAPI</string>
</array>
```

### 2.3 Universal Links 配置（必须）

从微信 SDK 1.8.6 起，**Universal Links 为必选项**，否则将触发风控限制。

1. 服务端配置 `apple-app-site-association`：

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TeamID>.<BundleID>",
        "paths": ["/wechat/*"]
      }
    ]
  }
}
```

2. 在微信开放平台后台填写完全一致的 Universal Link（含路径，末尾带 `/`）
3. Xcode Associated Domains 添加 `applinks:yourdomain.com`

### 2.4 注册与调起支付

```swift
import UIKit

// MARK: - 微信支付管理器
class WeChatPayManager: NSObject, WXApiDelegate {

    static let shared = WeChatPayManager()

    private let appId = "wx1234567890abcdef"
    private let universalLink = "https://yourdomain.com/wechat/"
    private var paymentCompletion: ((WeChatPayResult) -> Void)?

    /// App 启动时注册（在 AppDelegate didFinishLaunchingWithOptions 中调用）
    func registerApp() {
        WXApi.registerApp(appId, universalLink: universalLink)
        // 仅调试阶段使用自检函数，正式环境注释掉
        // WXApi.checkUniversalLinkReady { step, result in
        //     print("step: \(step), result: \(result.description)")
        // }
    }

    /// 调起微信支付
    /// - Parameters:
    ///   - params: 服务端返回的预支付参数
    ///   - completion: 客户端回调
    func pay(params: WeChatPayParams, completion: @escaping (WeChatPayResult) -> Void) {
        self.paymentCompletion = completion

        let req = PayReq()
        req.partnerId = params.partnerId       // 商户号
        req.prepayId  = params.prepayId        // 预支付交易会话 ID
        req.nonceStr  = params.nonceStr        // 随机字符串
        req.timeStamp = params.timeStamp       // 时间戳（UInt32）
        req.package   = "Sign=WXPay"           // 固定值
        req.sign      = params.sign            // 签名（服务端生成）

        WXApi.send(req) { success in
            if !success {
                completion(.failure)
            }
        }
    }

    // MARK: - WXApiDelegate
    func onResp(_ resp: BaseResp) {
        guard let payResp = resp as? PayResp else { return }
        let result: WeChatPayResult
        switch payResp.errCode {
        case 0:  result = .success     // WXSuccess
        case -1: result = .failure     // WXErrCodeCommon
        case -2: result = .cancelled   // WXErrCodeUserCancel
        default: result = .failure
        }
        paymentCompletion?(result)
        paymentCompletion = nil
    }

    func onReq(_ req: BaseReq) {}
}

// MARK: - 支付参数模型
struct WeChatPayParams {
    let partnerId: String
    let prepayId: String
    let nonceStr: String
    let timeStamp: UInt32
    let sign: String
}

// MARK: - 支付结果枚举
enum WeChatPayResult {
    case success     //  0：支付成功
    case failure     // -1：通用错误
    case cancelled   // -2：用户取消
}
```

### 2.5 回调入口

```swift
// MARK: - AppDelegate
func application(_ application: UIApplication,
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    WeChatPayManager.shared.registerApp()
    return true
}

func application(_ app: UIApplication,
                 open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return WXApi.handleOpen(url, delegate: WeChatPayManager.shared)
}

// MARK: - Universal Links 回调（必须实现）
func application(_ application: UIApplication,
                 continue userActivity: NSUserActivity,
                 restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return WXApi.handleOpenUniversalLink(userActivity,
                                          delegate: WeChatPayManager.shared)
}

// MARK: - SceneDelegate（iOS 13+）
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    WXApi.handleOpen(url, delegate: WeChatPayManager.shared)
}

func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    WXApi.handleOpenUniversalLink(userActivity,
                                  delegate: WeChatPayManager.shared)
}
```

---

## 三、银联 iOS SDK

### 3.1 集成方式

**CocoaPods：**

```ruby
pod 'YHUPPayPluginSDK'   # 社区维护的 CocoaPods 封装
```

**手动集成（官方方式）：**
从 [银联开放平台](https://open.unionpay.com/tjweb/doc/mchnt/list?productId=3) 下载 SDK，将以下文件添加到工程：
- `UPPaymentControl.h`
- `UPAPayPlugin.h`、`UPAPayPluginDelegate.h`
- `libPaymentControl.a`

添加依赖库：`libc++.tbd`, `libz.tbd`, `SystemConfiguration.framework`, `CFNetwork.framework`

### 3.2 Info.plist 配置

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp_unionpay</string> <!-- 自定义 scheme -->
        </array>
    </dict>
</array>

<key>LSApplicationQueriesSchemes</key>
<array>
    <string>uppaysdk</string>
    <string>uppaywallet</string>
    <string>uppayx1</string>
    <string>uppayx2</string>
    <string>uppayx3</string>
</array>
```

### 3.3 调起支付与回调处理

```swift
import UIKit

// MARK: - 银联支付管理器
class UnionPayManager: NSObject {

    static let shared = UnionPayManager()
    private let appScheme = "myapp_unionpay"

    /// 调起银联支付
    /// - Parameters:
    ///   - tn: 服务端返回的交易流水号（Transaction Number）
    ///   - viewController: 当前页面控制器
    ///   - isProduction: true 生产环境，false 测试环境
    func pay(tn: String, from viewController: UIViewController, isProduction: Bool = true) {
        let mode = isProduction ? "00" : "01"
        UPPaymentControl.default().startPay(
            tn,
            fromScheme: appScheme,
            mode: mode,
            viewController: viewController
        )
    }

    /// 处理 URL 回调
    func handleOpenURL(_ url: URL) -> Bool {
        guard url.scheme == appScheme else { return false }
        UPPaymentControl.default().handlePaymentResult(
            url,
            completeBlock: { code, data in
                let result = UnionPayResult.from(code: code ?? "")
                NotificationCenter.default.post(
                    name: .unionPayResult,
                    object: nil,
                    userInfo: ["result": result]
                )
            }
        )
        return true
    }
}

// MARK: - 支付结果枚举
enum UnionPayResult {
    case success    // "success"：支付成功
    case failure    // "fail"：支付失败
    case cancelled  // "cancel"：用户取消

    static func from(code: String) -> UnionPayResult {
        switch code {
        case "success": return .success
        case "fail":    return .failure
        case "cancel":  return .cancelled
        default:        return .failure
        }
    }
}

extension Notification.Name {
    static let unionPayResult = Notification.Name("UnionPayResultNotification")
}
```

### 3.4 AppDelegate 回调入口

```swift
func application(_ app: UIApplication,
                 open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // 银联回调
    if UnionPayManager.shared.handleOpenURL(url) {
        return true
    }
    // 其他 SDK 回调...
    return false
}
```

---

## 四、Apple Pay（PassKit）

### 4.1 前置配置

1. **Apple Developer Portal**：Identifiers -> Merchant IDs -> 创建 Merchant ID（如 `merchant.com.yourcompany.pay`）
2. **配置支付处理证书**：在 Merchant ID 详情页创建 Payment Processing Certificate，上传 CSR 文件
3. **Xcode**：Signing & Capabilities -> 添加 Apple Pay capability -> 勾选 Merchant ID
4. 确保设备 Wallet 中已绑定支持的银行卡

### 4.2 完整实现

```swift
import PassKit
import UIKit

// MARK: - Apple Pay 管理器
class ApplePayManager: NSObject {

    static let shared = ApplePayManager()

    private let merchantId = "merchant.com.yourcompany.pay"
    /// 支持的卡网络
    private let supportedNetworks: [PKPaymentNetwork] = [
        .visa, .masterCard, .amex, .chinaUnionPay, .JCB
    ]

    private var paymentCompletion: ((ApplePayResult) -> Void)?
    private var paymentAuthCompletion: ((PKPaymentAuthorizationResult) -> Void)?

    // MARK: - 能力检测
    /// 检查设备是否支持 Apple Pay
    var canMakePayments: Bool {
        return PKPaymentAuthorizationController.canMakePayments()
    }

    /// 检查设备是否有可用的支付卡
    var canMakePaymentsWithCards: Bool {
        return PKPaymentAuthorizationController.canMakePayments(
            usingNetworks: supportedNetworks
        )
    }

    // MARK: - 发起支付
    /// 发起 Apple Pay 支付
    /// - Parameters:
    ///   - items: 商品列表
    ///   - completion: 支付结果回调
    func startPayment(items: [PaymentItem],
                      completion: @escaping (ApplePayResult) -> Void) {
        self.paymentCompletion = completion

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantId
        request.supportedNetworks = supportedNetworks
        request.merchantCapabilities = [.capability3DS, .capabilityEMV]  // 国内需要 EMV
        request.countryCode = "CN"
        request.currencyCode = "CNY"

        // 构造商品明细
        var summaryItems: [PKPaymentSummaryItem] = items.map {
            PKPaymentSummaryItem(label: $0.name, amount: $0.amount)
        }
        // 最后一项为总计（显示为收款方名称）
        let total = items.reduce(NSDecimalNumber.zero) { $0.adding($1.amount) }
        summaryItems.append(
            PKPaymentSummaryItem(label: "你的公司名", amount: total)
        )
        request.paymentSummaryItems = summaryItems

        // 使用 Controller（不依赖 UIKit 层级，适用范围更广）
        let controller = PKPaymentAuthorizationController(paymentRequest: request)
        controller.delegate = self
        controller.present { presented in
            if !presented {
                completion(.failure)
            }
        }
    }
}

// MARK: - PKPaymentAuthorizationControllerDelegate
extension ApplePayManager: PKPaymentAuthorizationControllerDelegate {

    func paymentAuthorizationController(
        _ controller: PKPaymentAuthorizationController,
        didAuthorizePayment payment: PKPayment,
        handler completion: @escaping (PKPaymentAuthorizationResult) -> Void
    ) {
        // 将 payment.token.paymentData 发送到服务端验证
        let tokenData = payment.token.paymentData

        sendTokenToServer(tokenData) { [weak self] serverSuccess in
            if serverSuccess {
                completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
                self?.paymentCompletion?(.success)
            } else {
                completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
                self?.paymentCompletion?(.failure)
            }
        }
    }

    func paymentAuthorizationControllerDidFinish(
        _ controller: PKPaymentAuthorizationController
    ) {
        controller.dismiss {
            // Sheet 关闭后的清理逻辑
        }
    }

    // MARK: - 服务端通信
    private func sendTokenToServer(
        _ tokenData: Data,
        completion: @escaping (Bool) -> Void
    ) {
        // 将 token JSON 发送到你的服务端
        // 服务端使用支付处理证书解密 token，调用收单机构 API 完成扣款
        let tokenJSON = String(data: tokenData, encoding: .utf8) ?? ""
        print("Apple Pay token: \(tokenJSON)")

        // TODO: 替换为实际的网络请求
        var request = URLRequest(url: URL(string: "https://api.yourserver.com/applepay/verify")!)
        request.httpMethod = "POST"
        request.httpBody = tokenData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        URLSession.shared.dataTask(with: request) { data, response, error in
            let httpResp = response as? HTTPURLResponse
            completion(httpResp?.statusCode == 200)
        }.resume()
    }
}

// MARK: - 数据模型
struct PaymentItem {
    let name: String
    let amount: NSDecimalNumber
}

enum ApplePayResult {
    case success
    case failure
}
```

### 4.3 Apple Pay 按钮（推荐使用系统标准按钮）

```swift
import PassKit

func createApplePayButton() -> PKPaymentButton {
    let button = PKPaymentButton(paymentButtonType: .buy, paymentButtonStyle: .black)
    button.addTarget(self, action: #selector(applePayTapped), for: .touchUpInside)
    return button
}

/// 无卡时显示 SetUp 按钮引导用户添加卡片
func createSetUpButton() -> PKPaymentButton {
    let button = PKPaymentButton(paymentButtonType: .setUp, paymentButtonStyle: .black)
    button.addTarget(self, action: #selector(setUpApplePay), for: .touchUpInside)
    return button
}

@objc func setUpApplePay() {
    PKPassLibrary().openPaymentSetup()
}
```

---

## 五、统一回调路由

当 App 同时接入多种支付 SDK 时，需要在回调入口做统一分发：

```swift
// MARK: - AppDelegate 统一 URL 回调路由
func application(_ app: UIApplication,
                 open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // 支付宝回调：host == "safepay"
    if url.host == "safepay" {
        AlipayManager.shared.handleOpenURL(url)
        return true
    }
    // 银联回调
    if url.scheme == "myapp_unionpay" {
        return UnionPayManager.shared.handleOpenURL(url)
    }
    // 微信回调
    if url.scheme?.hasPrefix("wx") == true {
        return WXApi.handleOpen(url, delegate: WeChatPayManager.shared)
    }
    return false
}

// MARK: - SceneDelegate 统一回调路由
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    if url.host == "safepay" {
        AlipayManager.shared.handleOpenURL(url)
    } else if url.scheme == "myapp_unionpay" {
        _ = UnionPayManager.shared.handleOpenURL(url)
    } else if url.scheme?.hasPrefix("wx") == true {
        WXApi.handleOpen(url, delegate: WeChatPayManager.shared)
    }
}

// MARK: - Universal Links 回调（微信必须）
func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    WXApi.handleOpenUniversalLink(userActivity,
                                  delegate: WeChatPayManager.shared)
}
```

---

## 六、通用处理策略

### 6.1 后台返回刷新

用户从支付 App 切回后，应主动查询服务端订单状态：

```swift
// SceneDelegate
func sceneDidBecomeActive(_ scene: UIScene) {
    // 如果有待确认的支付订单，主动查询服务端
    PaymentOrderTracker.shared.refreshPendingOrderIfNeeded()
}
```

### 6.2 客户端回调 vs 服务端回调

| 维度 | 客户端回调 | 服务端回调（notify_url） |
|------|-----------|------------------------|
| 可靠性 | 低：用户可能强杀 App | 高：支付平台主动推送 |
| 用途 | 更新 UI、引导下一步 | 扣库存、变更订单状态 |
| 可信度 | **不可信**，仅参考 | **可信**，需验签 |
| 原则 | 仅用于展示，不做业务判定 | 以此为准完成履约 |

### 6.3 网络中断恢复

```swift
/// 支付结果轮询（当客户端回调丢失时兜底）
func pollOrderStatus(orderId: String,
                     maxRetry: Int = 5,
                     interval: TimeInterval = 2.0,
                     completion: @escaping (OrderStatus) -> Void) {
    var retryCount = 0

    func poll() {
        queryServerOrderStatus(orderId: orderId) { status in
            if status == .pending && retryCount < maxRetry {
                retryCount += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
                    poll()
                }
            } else {
                completion(status)
            }
        }
    }
    poll()
}
```

---

## 关键 API 摘要

| SDK | 核心调起方法 | 回调入口 |
|-----|------------|---------|
| 支付宝 | `AlipaySDK.defaultService()?.payOrder(_:fromScheme:callback:)` | `url.host == "safepay"` |
| 微信 | `WXApi.send(PayReq)` | `WXApiDelegate.onResp(_:)` |
| 银联 | `UPPaymentControl.default().startPay(_:fromScheme:mode:viewController:)` | `handlePaymentResult(_:completeBlock:)` |
| Apple Pay | `PKPaymentAuthorizationController.present()` | `didAuthorizePayment` delegate |

---

## 常见陷阱

1. **Universal Links 不生效**：`apple-app-site-association` 文件仅在 App **首次安装时**下载缓存，修改后必须**删除 App 重新安装**才能刷新。另外注意该文件必须通过 HTTPS 提供，且不能带 `.json` 后缀。

2. **Universal Links 同域名限制**：如果 Universal Link 域名为 `www.example.com`，则**发起跳转的网页不能也在 `www.example.com`**，否则 iOS 会当作普通链接处理而非唤起 App。

3. **微信 SDK 注册时序错误**：`WXApi.registerApp` 必须在 `didFinishLaunchingWithOptions` 中**尽早调用**，不能延迟到异步回调中，否则回调会丢失。另外 `registerApp` 必须在 `handleOpen` 和 `handleOpenUniversalLink` 之前调用。

4. **微信支付回调不走 AppDelegate**：iOS 13+ 若启用 SceneDelegate，`application(_:open:options:)` 不再触发，必须在 `scene(_:openURLContexts:)` 和 `scene(_:continue:)` 中处理。同时需要在 SceneDelegate 中实现 Universal Links 回调。

5. **URL Scheme 冲突**：多个 App 注册相同 scheme 时 iOS 行为不确定。建议使用有辨识度的前缀（如 `com.yourcompany.alipay`），避免使用简单通用名称。微信的 scheme 必须使用微信 AppID 本身（如 `wx1234567890abcdef`），不能自定义。

6. **客户端回调当作最终结果**：三方支付客户端回调**不可信**（可被篡改、可能丢失），业务逻辑（扣库存、发货）必须以**服务端异步通知**（notify_url）为准。客户端回调仅用于 UI 提示。

7. **后台返回后未刷新支付状态**：用户从支付宝/微信完成支付后切回 App，若 App 被系统回收过，回调可能丢失。必须在 `sceneDidBecomeActive` 中主动向服务端查询订单状态。

8. **银联 mode 参数错误**：`startPay` 的 `mode` 参数 `"00"` 为生产环境、`"01"` 为测试环境。上线时忘记切换会导致测试环境的交易请求打到生产，或反之。建议通过编译宏控制。

9. **Apple Pay merchantCapabilities 配置不当**：国内银联卡必须同时包含 `.capability3DS` 和 `.capabilityEMV`，仅设置 `.capability3DS` 会导致银联卡无法支付。

10. **支付宝 resultStatus 的 8000 状态遗漏**：8000 表示"正在处理中"（如信用卡需银行确认），不等于成功也不等于失败。必须引导用户等待，并通过服务端轮询最终结果。

---

## 组合提示

- **alipay-apis** -- 支付宝服务端下单、签名、异步通知验签
- **wechat-pay-apis** -- 微信支付统一下单、签名算法、服务端回调处理
- **unionpay-apis** -- 银联服务端接口、交易流水号获取
- **payment-ios-iap** -- App Store 内购（IAP）集成，数字商品必须走 IAP
- **payment-resilience** -- 支付容错、幂等、对账、掉单处理等后端策略

---

## 注意事项

- 所有三方 SDK 的 ObjC 头文件需要通过 **Bridging Header** 暴露给 Swift（`#import <AlipaySDK/AlipaySDK.h>` 等），或使用支持 module 的 XCFramework 版本
- App Store 审核要求：**数字商品/虚拟货币必须使用 IAP**，三方支付仅用于实物商品或线下服务，否则会被拒审
- 微信支付签名必须在**服务端**完成，客户端不应持有 API 密钥
- 测试阶段使用各平台的沙箱环境，上线前务必切换到生产环境配置
