---
name: payment-common
description: "支付领域技能套件总览：支付网关架构、支付宝/微信支付/银联集成、iOS/Android/鸿蒙客户端、IAP 应用内购买。"
tech_stack: [payment, backend]
capability: [payment-gateway]
---

# 支付领域技能套件总览

> 本 skill 是 payment 套件的索引与路由入口，帮助开发者快速定位所需知识。

## 用途

支付领域涉及服务端网关、多渠道对接、客户端集成、应用内购买等多层面知识。本 skill 提供全景索引，让开发者根据业务场景快速找到对应的 skill，避免在 19 个 skill 中盲目翻找。

## 套件结构索引

| 分类 | Skill 名称 | 覆盖内容 |
|------|-----------|---------|
| **核心架构** | payment-gateway | 订单状态机、幂等性、订单号、超时 |
| | payment-security | 签名验签、证书管理、PCI DSS |
| | payment-reconciliation | 对账、清算、退款、账务 |
| | payment-resilience | 弱网、补单、重试、最终一致性 |
| **支付宝** | alipay-onboarding | 平台接入、密钥配置、SDK 初始化 |
| | alipay-apis | 统一收单各产品 API |
| | alipay-notifications | 异步通知验签与处理 |
| **微信支付** | wechat-pay-onboarding | V3 接入、签名、证书 |
| | wechat-pay-apis | 各支付产品下单 API |
| | wechat-pay-notifications | 回调验签与 AES 解密 |
| **银联** | unionpay-onboarding | 商户入网、三证书体系 |
| | unionpay-apis | 网关/控件/二维码支付 |
| **客户端** | payment-web-frontend | Web 三渠道 JS/H5 接入 |
| | payment-ios-sdk | iOS 三渠道 + Apple Pay |
| | payment-android-sdk | Android 三渠道 SDK |
| | payment-harmony-sdk | 鸿蒙 Payment Kit + 三方渠道 |
| **应用内购买** | payment-ios-iap | StoreKit 2 + Server API |
| | payment-android-iap | Google Play Billing |
| **总览** | payment-common | 本文档 -- 索引与路由 |

## 技术选型决策树

### 第一步：支付类型

```
你的商品是什么？
├── 实物商品 / 线下服务 / 虚拟充值（非平台内数字内容）
│   └── 使用三方支付渠道：支付宝 / 微信支付 / 银联
└── 数字内容 / 会员订阅 / App 内虚拟道具
    └── 使用应用内购买（IAP）
        ├── iOS → payment-ios-iap
        └── Android → payment-android-iap
```

### 第二步：渠道选择

```
目标用户群体？
├── 中国大陆 C 端用户（覆盖 95%+）
│   └── 支付宝 + 微信支付（双渠道并接）
├── 需要银行卡直接扣款 / B2B 对公
│   └── 银联
└── 多渠道都要
    └── 统一网关抽象 → payment-gateway
```

### 第三步：平台选择

```
你在哪一层工作？
├── 后端服务 → alipay-* / wechat-pay-* / unionpay-* 系列
├── Web 前端 → payment-web-frontend
├── iOS 客户端 → payment-ios-sdk / payment-ios-iap
├── Android 客户端 → payment-android-sdk / payment-android-iap
└── 鸿蒙客户端 → payment-harmony-sdk
```

## 推荐接入流程

按照以下顺序阅读 skill，可系统性地完成支付系统搭建：

1. **理解架构** -- 阅读 `payment-gateway`，掌握订单状态机、幂等性设计
2. **理解安全机制** -- 阅读 `payment-security`，掌握签名验签、证书管理
3. **完成渠道接入** -- 阅读对应渠道 `*-onboarding`，完成密钥配置和 SDK 初始化
4. **实现核心 API** -- 阅读对应渠道 `*-apis`，实现下单、查询、退款
5. **处理异步通知** -- 阅读对应渠道 `*-notifications`，实现回调验签和状态同步
6. **客户端集成** -- 阅读对应平台的客户端 skill，完成前端/移动端支付调起
7. **上线加固** -- 阅读 `payment-reconciliation` + `payment-resilience`，完善对账和容错

> 步骤 3-6 按渠道并行：支付宝线和微信支付线可同时推进。

## API 版本对照

| 渠道 | 当前推荐版本 | 官方文档入口 |
|------|------------|-------------|
| 支付宝 | 开放平台 v2 / SDK v3 | opendocs.alipay.com |
| 微信支付 | API v3 | pay.weixin.qq.com/doc/v3 |
| 银联 | 网关支付 6.0 | open.unionpay.com |
| Apple StoreKit | StoreKit 2 (iOS 15+) | developer.apple.com/storekit |
| Google Play | Billing Library 7.x / 8.x | developer.android.com/google/play/billing |

## 服务端-客户端协作流程

三方支付（支付宝/微信/银联）的典型交互时序：

```
客户端                    服务端                     支付渠道
  │                        │                          │
  │── 1. 创建订单请求 ────→│                          │
  │                        │── 2. 调用渠道下单 API ──→│
  │                        │←── 3. 返回预支付凭证 ────│
  │←── 4. 返回支付凭证 ────│                          │
  │                        │                          │
  │── 5. 用凭证调起支付 ──────────────────────────────→│
  │←── 6. 支付结果（同步） ←──────────────────────────│
  │                        │                          │
  │                        │←── 7. 异步通知（权威） ──│
  │                        │── 8. 更新订单状态         │
  │                        │                          │
  │── 9. 查询订单结果 ────→│                          │
  │←── 10. 返回最终状态 ──│                          │
```

关键点：
- 步骤 6 的同步返回**仅供展示**，不能作为发货依据
- 步骤 7 的异步通知是**权威支付结果**，必须验签后再处理
- 步骤 9 是客户端兜底查询，防止通知延迟导致页面卡在"支付中"

## 何时不需要本套件

- 使用聚合支付 SaaS（如 Stripe、Ping++）-- 它们已封装渠道差异，直接看其文档即可
- 纯境外支付（PayPal、Stripe Global）-- 本套件聚焦中国大陆主流渠道
