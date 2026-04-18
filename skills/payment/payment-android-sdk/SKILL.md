---
name: payment-android-sdk
description: "Android 支付 SDK 接入：支付宝/微信支付/银联三方 SDK 集成、调起支付与回调处理。"
tech_stack: [payment, android, mobile-native]
language: [kotlin, java]
capability: [payment-gateway, native-device]
---

# Android 三方支付 SDK 接入（支付宝/微信支付/银联）

> 来源：
> - 支付宝：https://opendocs.alipay.com/open/204/105296/
> - 微信支付：https://pay.weixin.qq.com/wiki/doc/api/app/app.php?chapter=8_5
> - 银联：https://open.unionpay.com/
> 版本基准：支付宝 SDK 15.8.38+ / 微信 OpenSDK 6.8.0+ / 银联 SDK 3.5.0+

## 用途

在 Android 应用中集成支付宝、微信支付、银联三大主流三方支付渠道，实现从调起支付到结果回调的完整客户端流程。服务端负责下单签名，客户端仅负责调起 SDK 和处理回调。

## 何时使用

- 需要在 Android App 中接入支付宝 APP 支付
- 需要在 Android App 中接入微信 APP 支付
- 需要在 Android App 中接入银联手机控件支付
- 需要统一封装多渠道支付的调用与回调
- 需要处理支付过程中的进程被杀、Activity 重建等边界场景

---

## 支付宝 Android SDK

### Gradle 依赖

```kotlin
// build.gradle.kts (Module)
dependencies {
    // 方式一：Maven 依赖（推荐）
    implementation("com.alipay.sdk:alipaysdk-android:15.8.38")

    // 方式二：本地 AAR
    // 将 alipaySdk-xxx.aar 放入 libs/ 目录
    // implementation(files("libs/alipaySdk-15.8.38.aar"))
}
```

> Maven 仓库地址：https://mvnrepository.com/artifact/com.alipay.sdk/alipaysdk-android
> 若用 AAR 方式，需在 build.gradle 中添加 `flatDir { dirs("libs") }`。

### 核心调用

`PayTask(activity).payV2(orderString, true)` 是唯一的客户端支付入口。`orderString` 由服务端生成并签名，客户端不参与签名过程。

**关键约束：payV2 必须在子线程调用，否则 ANR。**

### 结果码

| resultStatus | 含义 | 处理建议 |
|:---:|---|---|
| 9000 | 支付成功 | 展示成功，以服务端异步通知为准 |
| 8000 | 正在处理中 | 轮询服务端确认最终状态 |
| 4000 | 支付失败 | 提示失败，可重试 |
| 5000 | 重复请求 | 忽略，查询已有订单 |
| 6001 | 用户取消 | 提示取消 |
| 6002 | 网络连接错误 | 提示检查网络 |
| 6004 | 结果未知 | 轮询服务端确认（可能已成功） |

> **核心原则：客户端返回码仅作为 UI 提示依据，真实支付结果以服务端异步通知为准。**

### Kotlin 完整示例（含协程封装）

```kotlin
import com.alipay.sdk.app.PayTask
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class AlipayResult(
    val resultStatus: String,
    val result: String,  // JSON 字符串，含 alipay_trade_app_pay_response
    val memo: String
)

/**
 * 发起支付宝支付
 * @param activity 当前 Activity（SDK 需要 Activity 上下文）
 * @param orderInfo 服务端返回的签名后订单字符串
 * @return 支付结果
 */
suspend fun payWithAlipay(
    activity: Activity,
    orderInfo: String
): AlipayResult = withContext(Dispatchers.IO) {
    // PayTask 构造必须传 Activity，payV2 必须在子线程
    val payTask = PayTask(activity)
    val result: Map<String, String> = payTask.payV2(orderInfo, true)

    AlipayResult(
        resultStatus = result["resultStatus"] ?: "",
        result = result["result"] ?: "",
        memo = result["memo"] ?: ""
    )
}

// --- 在 Activity / ViewModel 中调用 ---
class PaymentActivity : AppCompatActivity() {

    private fun startAlipay(orderInfo: String) {
        lifecycleScope.launch {
            val result = payWithAlipay(this@PaymentActivity, orderInfo)
            handleAlipayResult(result)
        }
    }

    private fun handleAlipayResult(result: AlipayResult) {
        when (result.resultStatus) {
            "9000" -> showSuccess()            // 同步成功，仍需服务端确认
            "8000", "6004" -> queryOrderStatus() // 结果待确认
            "6001" -> showCancelled()
            "6002" -> showNetworkError()
            else -> showFailure(result.memo)
        }
    }
}
```

Java 对比（关键差异）：

```java
// Java 中需手动开线程
new Thread(() -> {
    PayTask payTask = new PayTask(activity);
    Map<String, String> result = payTask.payV2(orderInfo, true);
    runOnUiThread(() -> handleResult(result));
}).start();
```

---

## 微信支付 Android SDK

### Gradle 依赖

```kotlin
// build.gradle.kts (Module)
dependencies {
    // 新版包名（不含 MTA 统计，推荐）
    implementation("com.tencent.mm.opensdk:wechat-sdk-android:6.8.0")

    // 旧版包名（已废弃，不要使用）
    // implementation("com.tencent.mm.opensdk:wechat-sdk-android-without-mta:+")
}
```

> 不要使用 `+` 通配符版本号，会导致构建不可重复。
> Maven 仓库：https://mvnrepository.com/artifact/com.tencent.mm.opensdk/wechat-sdk-android

### Application 中注册 WXAPI

```kotlin
class MyApplication : Application() {

    companion object {
        const val WX_APP_ID = "wx1234567890abcdef" // 微信开放平台申请
        lateinit var wxApi: IWXAPI
    }

    override fun onCreate() {
        super.onCreate()
        wxApi = WXAPIFactory.createWXAPI(this, WX_APP_ID, true)
        wxApi.registerApp(WX_APP_ID)
    }
}
```

### AndroidManifest.xml 配置

```xml
<!-- 微信支付回调 Activity -->
<!-- 路径必须是：包名.wxapi.WXPayEntryActivity -->
<!-- 例如包名是 com.example.app，则全路径是 com.example.app.wxapi.WXPayEntryActivity -->
<activity
    android:name=".wxapi.WXPayEntryActivity"
    android:exported="true"
    android:launchMode="singleTop"
    android:taskAffinity="${applicationId}" />
```

> **包路径是最高频的踩坑点：** WXPayEntryActivity 必须位于 `{applicationId}.wxapi` 包下，路径错一个字母都不会收到回调。

### 调起支付

```kotlin
/**
 * 调起微信支付
 * @param prepayData 服务端统一下单返回的支付参数
 */
fun payWithWechat(prepayData: WechatPrepayData) {
    val api = MyApplication.wxApi
    if (!api.isWXAppInstalled) {
        showToast("请先安装微信")
        return
    }

    val req = PayReq().apply {
        appId = prepayData.appId
        partnerId = prepayData.partnerId    // 商户号
        prepayId = prepayData.prepayId      // 预支付交易会话 ID
        nonceStr = prepayData.nonceStr      // 随机字符串
        timeStamp = prepayData.timeStamp    // 时间戳（秒级，String 类型）
        packageValue = "Sign=WXPay"         // 固定值，不要改
        sign = prepayData.sign              // 服务端计算的签名
    }

    // sendReq 在主线程调用
    api.sendReq(req)
}

// 数据类（对应服务端返回字段）
data class WechatPrepayData(
    val appId: String,
    val partnerId: String,
    val prepayId: String,
    val nonceStr: String,
    val timeStamp: String,
    val sign: String
)
```

### WXPayEntryActivity 回调实现

文件位置必须是：`{包名}/wxapi/WXPayEntryActivity.kt`

```kotlin
package com.example.app.wxapi  // 替换为实际包名.wxapi

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.tencent.mm.opensdk.constants.ConstantsAPI
import com.tencent.mm.opensdk.modelbase.BaseReq
import com.tencent.mm.opensdk.modelbase.BaseResp
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler

class WXPayEntryActivity : Activity(), IWXAPIEventHandler {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MyApplication.wxApi.handleIntent(intent, this)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        MyApplication.wxApi.handleIntent(intent, this)
    }

    override fun onReq(req: BaseReq?) {
        // 一般不处理
    }

    override fun onResp(resp: BaseResp?) {
        if (resp == null) {
            finish()
            return
        }

        if (resp.type == ConstantsAPI.COMMAND_PAY_BY_WX) {
            when (resp.errCode) {
                BaseResp.ErrCode.ERR_OK -> {        // 0：支付成功
                    // 通知业务层，仍需服务端确认
                    PaymentEventBus.post(PaymentEvent.WechatSuccess)
                }
                BaseResp.ErrCode.ERR_USER_CANCEL -> { // -2：用户取消
                    PaymentEventBus.post(PaymentEvent.WechatCancelled)
                }
                BaseResp.ErrCode.ERR_COMM -> {       // -1：支付失败
                    PaymentEventBus.post(
                        PaymentEvent.WechatFailed(resp.errStr ?: "支付失败")
                    )
                }
            }
        }
        finish()  // 必须 finish，否则停留在空白页
    }
}
```

### 回调错误码

| errCode | 常量 | 含义 |
|:---:|---|---|
| 0 | ERR_OK | 支付成功（仍需服务端确认） |
| -1 | ERR_COMM | 支付失败（签名错误、参数错误等） |
| -2 | ERR_USER_CANCEL | 用户取消 |

> **errCode = -1 的排查清单：** 签名算法错误 > appId 与开放平台不匹配 > 包名/签名证书与开放平台配置不一致 > prepayId 过期（有效期 2 小时）。

---

## 银联 Android SDK

### SDK 引入

银联 SDK 不在公共 Maven 仓库，需从银联开放平台下载后手动引入。

```kotlin
// build.gradle.kts (Module)
dependencies {
    // 将 UPPayAssistEx.jar 和 UPPayPluginExPro.jar 放入 libs/
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
}
```

同时需要将 `.so` 文件放入 `src/main/jniLibs/` 对应架构目录下（armeabi-v7a、arm64-v8a、x86、x86_64）。

> 下载地址：https://open.unionpay.com/ -> 开发者中心 -> SDK 下载

### AndroidManifest 权限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />

<!-- 银联 SDK 需要的 Activity 声明 -->
<activity
    android:name="com.unionpay.uppay.PayActivity"
    android:configChanges="orientation|keyboardHidden|screenSize"
    android:screenOrientation="portrait" />
```

### 调起支付

```kotlin
import com.unionpay.UPPayAssistEx

/**
 * 调起银联支付
 * @param activity 当前 Activity
 * @param tn 服务端返回的交易流水号（Transaction Number）
 * @param isProduction true=生产环境，false=测试环境
 */
fun payWithUnionPay(
    activity: Activity,
    tn: String,
    isProduction: Boolean = true
) {
    // mode: "00" = 生产环境, "01" = 测试环境
    val mode = if (isProduction) "00" else "01"

    // spId 和 sysProvider 传 null
    val result = UPPayAssistEx.startPay(activity, null, null, tn, mode)

    if (!result) {
        // 启动失败，可能未安装银联控件或 SDK 初始化失败
        showToast("银联支付启动失败")
    }
}

companion object {
    const val UNION_PAY_REQUEST_CODE = 10  // 固定值，银联 SDK 内部使用
}
```

### onActivityResult 处理

```kotlin
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    // 银联支付回调 -- requestCode 不固定，优先判断 data 中是否有 pay_result
    val payResult = data?.extras?.getString("pay_result")
    if (payResult != null) {
        when (payResult) {
            "success" -> {
                // 支付成功（仍需服务端确认）
                queryOrderStatus()
            }
            "fail" -> {
                showPaymentFailed()
            }
            "cancel" -> {
                showPaymentCancelled()
            }
        }
    }
}
```

### Kotlin 完整代码

```kotlin
class UnionPayActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment)

        btnPay.setOnClickListener {
            lifecycleScope.launch {
                // 1. 从服务端获取 tn
                val tn = PaymentApi.createUnionPayOrder(orderId)
                // 2. 调起银联
                payWithUnionPay(this@UnionPayActivity, tn)
            }
        }
    }

    private fun payWithUnionPay(activity: Activity, tn: String) {
        val mode = if (BuildConfig.DEBUG) "01" else "00"
        UPPayAssistEx.startPay(activity, null, null, tn, mode)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val payResult = data?.extras?.getString("pay_result")
        if (payResult != null) {
            when (payResult) {
                "success" -> onPaySuccess()
                "fail" -> onPayFailed()
                "cancel" -> onPayCancelled()
            }
        }
    }

    private fun onPaySuccess() {
        // 展示成功 UI，并轮询服务端确认最终状态
        showLoading("支付处理中...")
        lifecycleScope.launch {
            val confirmed = PaymentApi.queryOrderStatus(orderId, maxRetries = 5)
            if (confirmed) showSuccess() else showPending()
        }
    }

    private fun onPayFailed() {
        showDialog("支付失败", "请重试或选择其他支付方式")
    }

    private fun onPayCancelled() {
        showToast("已取消支付")
    }
}
```

---

## 通用处理

### 支付 Activity 生命周期管理

```kotlin
class PaymentActivity : AppCompatActivity() {

    private var currentOrderId: String? = null
    private var paymentChannel: String? = null  // "alipay" / "wechat" / "unionpay"

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // 保存订单信息，防止进程被杀后丢失
        outState.putString("order_id", currentOrderId)
        outState.putString("payment_channel", paymentChannel)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment)

        if (savedInstanceState != null) {
            // 进程被杀恢复：不重新调起支付，直接查询服务端
            currentOrderId = savedInstanceState.getString("order_id")
            paymentChannel = savedInstanceState.getString("payment_channel")
            if (currentOrderId != null) {
                queryOrderStatusFromServer(currentOrderId!!)
            }
        }
    }

    // 不要在 onDestroy 中做支付回调清理！
    // 进程被杀时 onDestroy 可能不调用，且回调可能在 onDestroy 之后到达
}
```

### 统一支付封装

```kotlin
sealed class PayChannel {
    data class Alipay(val orderInfo: String) : PayChannel()
    data class Wechat(val prepayData: WechatPrepayData) : PayChannel()
    data class UnionPay(val tn: String) : PayChannel()
}

sealed class PayResult {
    object Success : PayResult()          // 同步成功（仍需服务端确认）
    object Cancelled : PayResult()
    data class Failed(val msg: String) : PayResult()
    object Pending : PayResult()          // 结果未知，需查询
}

class UnifiedPayManager(private val activity: Activity) {

    suspend fun pay(channel: PayChannel): PayResult {
        return when (channel) {
            is PayChannel.Alipay -> {
                val result = payWithAlipay(activity, channel.orderInfo)
                when (result.resultStatus) {
                    "9000" -> PayResult.Success
                    "6001" -> PayResult.Cancelled
                    "8000", "6004" -> PayResult.Pending
                    else -> PayResult.Failed(result.memo)
                }
            }
            is PayChannel.Wechat -> {
                // 微信支付是异步回调，此处仅调起，结果通过 EventBus 接收
                payWithWechat(channel.prepayData)
                PayResult.Pending  // 等待 WXPayEntryActivity 回调
            }
            is PayChannel.UnionPay -> {
                // 银联支付结果通过 onActivityResult 接收
                payWithUnionPay(activity, channel.tn)
                PayResult.Pending  // 等待 onActivityResult
            }
        }
    }
}
```

### 多线程注意事项

| SDK | 调起线程 | 原因 |
|---|---|---|
| 支付宝 `payV2` | **子线程（必须）** | 内部有同步网络请求，主线程调用直接 ANR |
| 微信 `sendReq` | **主线程** | 涉及 IPC Binder 调用，在子线程可能异常 |
| 银联 `startPay` | **主线程** | 内部启动 Activity，需要在主线程 |

### ProGuard / R8 混淆规则汇总

```proguard
# ========== 支付宝 SDK ==========
-keep class com.alipay.android.app.IAlixPay{*;}
-keep class com.alipay.android.app.IAlixPay$Stub{*;}
-keep class com.alipay.android.app.IRemoteServiceCallback{*;}
-keep class com.alipay.android.app.IRemoteServiceCallback$Stub{*;}
-keep class com.alipay.sdk.app.PayTask{public *;}
-keep class com.alipay.sdk.app.AuthTask{public *;}
-keep class com.alipay.sdk.app.H5PayCallback {
    <fields>;
    <methods>;
}
-keep class com.alipay.android.phone.mrpc.core.** { *; }
-keep class com.alipay.apmobilesecuritysdk.** { *; }
-keep class com.alipay.mobile.framework.service.annotation.** { *; }
-keep class com.alipay.mobilesecuritysdk.face.** { *; }
-keep class com.alipay.tscenter.biz.rpc.** { *; }
-keep class org.json.alipay.** { *; }
-keep class com.alipay.tscenter.** { *; }
-keep class com.ta.utdid2.** { *; }
-keep class com.ut.device.** { *; }
-dontwarn com.alipay.**
-dontwarn com.ta.utdid2.**
-dontwarn com.ut.device.**

# ========== 微信 SDK ==========
-keep class com.tencent.mm.opensdk.** { *; }
-keep class com.tencent.wxop.** { *; }
-keep class com.tencent.mm.sdk.** { *; }
-dontwarn com.tencent.mm.**
-dontwarn com.tencent.wxop.**

# ========== 银联 SDK ==========
-keep class com.unionpay.** { *; }
-keep class cn.gov.pbc.tsm.client.mobile.** { *; }
-dontwarn com.unionpay.**
-dontwarn cn.gov.pbc.tsm.client.mobile.**
```

---

## 常见陷阱

### 1. WXPayEntryActivity 包路径错误（微信支付最高频问题）

WXPayEntryActivity 必须在 `{applicationId}.wxapi` 包路径下。如果 `applicationId` 是 `com.example.app`，则文件必须在 `com/example/app/wxapi/WXPayEntryActivity.kt`。`applicationId` 与 `namespace`（原 `package`）不同时，以 `applicationId` 为准。Flavor 修改了 applicationId 时同样需要注意路径。

### 2. 支付宝主线程调用导致 ANR

`PayTask.payV2()` 内部包含同步网络请求，在主线程调用会阻塞 UI 线程导致 ANR。必须使用协程 `Dispatchers.IO`、`Thread`、或 `ExecutorService` 在子线程执行。这是最常见的支付宝集成错误。

### 3. 银联 mode 参数混淆

`"00"` 是生产环境，`"01"` 是测试环境。字面意义与直觉相反（通常 0 表示关/测试，1 表示开/生产），上线时务必确认 mode 值。建议用 `BuildConfig.DEBUG` 自动切换，避免硬编码。

### 4. 进程被杀后回调丢失

用户调起支付 SDK（特别是跳转到支付宝/微信 App）后，如果系统因内存不足杀掉了你的 App 进程，恢复时不会收到支付回调。**必须在 `onSaveInstanceState` 中保存订单号，恢复时主动查询服务端订单状态。**

### 5. 微信签名证书与开放平台不匹配

微信 SDK 校验应用签名，debug 证书和 release 证书不同。在微信开放平台需要配置对应证书的 MD5 签名（去掉冒号，全小写）。debug 环境测试时需要使用微信提供的签名检查工具确认。

### 6. 把客户端返回码当作最终支付结果

三个 SDK 的客户端返回码都只表示"调起流程的结果"，不代表真实扣款结果。**真实支付结果只能通过服务端异步通知或主动查询渠道获取。** 客户端返回"成功"但服务端未收到通知的场景在生产中并不罕见。

### 7. 微信 WXPayEntryActivity 未 finish 导致白屏

`onResp` 回调处理完毕后必须调用 `finish()`，否则用户会停留在一个空白的 WXPayEntryActivity 页面上。同时建议设置 `android:theme="@android:style/Theme.Translucent.NoTitleBar"` 避免闪白屏。

### 8. 银联 onActivityResult 中 data 为 null

用户在银联支付页面按返回键时，`data` 可能为 null。必须做空判断，否则 NPE 崩溃。

```kotlin
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    val payResult = data?.extras?.getString("pay_result")
    // payResult 可能为 null，需要处理
    if (payResult == null) {
        // 当作取消处理，同时查询服务端确认
        queryOrderStatus()
        return
    }
    // ...
}
```

### 9. 支付宝 orderString 中的特殊字符未转义

服务端返回的 `orderString` 中如果含有 `&`、`=` 等字符，必须按照支付宝要求的格式 URL 编码。客户端不应二次编码，直接透传服务端返回的原始字符串。

---

## 关键 API 摘要

| SDK | 类/方法 | 说明 |
|---|---|---|
| 支付宝 | `PayTask(activity).payV2(orderInfo, showLoading)` | 发起支付，子线程调用，返回 `Map<String, String>` |
| 支付宝 | `PayTask(activity).authV2(authInfo, showLoading)` | 授权登录（非支付），用法类似 |
| 微信 | `WXAPIFactory.createWXAPI(context, appId, checkSignature)` | 创建 WXAPI 实例 |
| 微信 | `IWXAPI.registerApp(appId)` | 注册应用，Application.onCreate 中调用 |
| 微信 | `IWXAPI.sendReq(PayReq)` | 调起微信支付 |
| 微信 | `IWXAPI.isWXAppInstalled` | 检查微信是否已安装 |
| 微信 | `IWXAPIEventHandler.onResp(BaseResp)` | 支付结果回调 |
| 银联 | `UPPayAssistEx.startPay(activity, spId, sysProvider, tn, mode)` | 调起银联支付 |

---

## 组合提示

- **alipay-apis** -- 支付宝服务端统一下单、签名算法、异步通知验签
- **wechat-pay-apis** -- 微信支付服务端统一下单（V3 API）、签名算法、回调解密
- **unionpay-apis** -- 银联服务端下单、交易查询接口
- **payment-android-iap** -- 如果同时需要 Google Play 应用内购买
- **payment-resilience** -- 弱网补单、幂等重试、支付结果最终一致性保障
