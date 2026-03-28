# fd-core-stack 中台架构

## 1. 定位

`fd-core-stack` 的定位不是某一个 Chrome 扩展或某一个 Web 应用的后端，而是统一的账号与商业化中台。

目标很明确：

- Chrome 扩展、Next.js、React 应用只负责 UI 和交互
- 登录、订单、支付、回调、授权、事件统一在中台处理
- 应用层不再重复接入支付宝、微信支付 SDK
- 应用层不再各自实现账号体系、授权体系、支付回调和 entitlement 发放

这套系统要服务多个前端应用，因此设计重点不是“某个页面能不能跑起来”，而是“接口契约能不能长期稳定复用”。

## 2. 设计原则

- 架构形态采用模块化单体，不拆微服务
- 统一领域模型，避免每个应用各自定义用户、订单、套餐和权益
- 支付通道细节只留在中台内部，对应用层暴露统一 checkout 抽象
- 敏感配置只存中台，不泄漏到扩展和前端项目
- 从一开始就保留工程质量、安全和运维边界，不走 demo 式架构

原因也很直接：

- 当前资源只有单台 `2C4G` 服务器，微服务会带来不必要的复杂度和额外开销
- 登录、支付、授权天然共享数据库事务和状态机，拆服务反而增加一致性成本
- 模块化单体已经足够支撑 MVP 到第一阶段商用

## 3. 部署形态

生产形态保持：

- `api`
- `worker`
- `postgres`
- `redis`
- `caddy`

容器统一通过 `docker compose` 部署，镜像由 GitHub Actions 构建后推送到 GHCR 和阿里云 ACR，服务器只拉镜像并启动。

这个方向继续保持，不需要改成服务器本地构建。

## 4. 当前实现状态

当前已经具备的中台能力：

- `system`
  - 健康检查、就绪检查、版本信息、模块列表
- `auth`
  - 邮箱注册、登录、JWT 鉴权、bootstrap admin
- `admin`
  - 支付配置后台
- `billing`
  - 下单、支付宝/微信真实支付对接、异步回调、幂等处理、订单支付完成事务
- `license`
  - 产品、套餐、功能、权益发放、权益查询
- `event`
  - 事件写入

当前没有完成的部分：

- 统一 checkout session 抽象
- 应用注册与密钥管理
- 安装绑定 / 激活 / 设备会话
- 用户自助支付页和托管收银台
- 订单补单、查单、关单、退款
- 完整管理台
- 真正的异步任务 worker
- 自动化集成测试
- 指标、告警、补偿任务、审计查询

## 5. 目标架构

### 5.1 总体结构

```text
Applications
├── Chrome Extensions
├── Next.js Apps
└── React Apps
        │
        │ HTTPS API
        ▼
fd-core-stack
├── Access Layer
│   ├── Auth API
│   ├── App API
│   ├── Checkout API
│   ├── License API
│   └── Event API
├── Domain Modules
│   ├── auth
│   ├── app
│   ├── checkout
│   ├── billing
│   ├── license
│   ├── install
│   ├── event
│   └── admin
├── Shared Runtime
│   ├── PostgreSQL
│   ├── Redis
│   └── Worker
└── Provider Adapters
    ├── Alipay
    └── WeChat Pay
```

### 5.2 模块边界

#### `system`

职责：

- 健康检查
- 就绪检查
- 版本与模块元信息

特点：

- 不承担业务逻辑

#### `auth`

职责：

- 注册、登录、刷新会话、注销
- 用户基础资料
- 管理员权限
- 后续可扩展 OAuth / 微信登录

边界：

- 只负责“用户是谁”
- 不负责“这个用户买了什么”

#### `app`

职责：

- 注册接入方应用
- 管理应用编码、名称、类型、状态
- 管理应用密钥、回调白名单、来源域名、允许的产品

边界：

- 一切接入中台的前端系统都必须先在这里登记
- 后续 Chrome 扩展、Next.js、React 应用都以 `appCode` 作为接入身份

#### `checkout`

职责：

- 创建统一 checkout session
- 返回统一支付展示模型
- 轮询订单状态
- 处理支付结果跳转页或托管支付页

边界：

- 应用层不再直接面对支付宝或微信支付的差异
- `checkout` 是应用层唯一需要调用的结算入口

#### `billing`

职责：

- 订单创建与状态机
- 支付通道适配
- 支付回调验签
- 查单、关单、退款、补单
- 对账与异常补偿

边界：

- 所有 provider 细节只能存在于这个模块内
- 不把微信/支付宝原始协议暴露给应用层

#### `license`

职责：

- 产品、套餐、功能模型
- entitlement 发放、撤销、过期
- 用户权益汇总
- 为应用层返回“当前用户是否已解锁某能力”

边界：

- 这是商业化结果层，不负责支付过程

#### `install`

职责：

- 记录 Chrome 扩展安装实例
- 绑定用户和安装实例
- 上报设备指纹、版本、最后活跃时间
- 为授权风控和多设备控制提供基础数据

边界：

- `install` 不是登录，不是支付，而是“某个应用实例是谁”

#### `event`

职责：

- 埋点、业务事件、支付事件、授权事件统一入库
- 后续可扩展聚合统计和审计查询

#### `admin`

职责：

- 配置中心
- 产品 / 套餐 / 功能管理
- 应用接入配置
- 订单与回调事件查看
- 权益发放、撤销、补单

## 6. 统一领域模型

建议将整个系统围绕以下核心对象设计：

- `user`
  - 中台账号
- `app`
  - 接入中台的应用，例如某个 Chrome 扩展、某个 Web 站点
- `product`
  - 售卖对象，例如 `ai_web_translator`
- `plan`
  - 套餐，例如月付、年付、一次性买断
- `feature`
  - 具体授权能力，例如 `translator.pro`
- `checkout_session`
  - 一次统一结算会话
- `order`
  - 实际订单
- `payment_attempt`
  - 某订单在某支付通道上的一次尝试
- `entitlement`
  - 已授予用户的能力
- `install`
  - Chrome 扩展或客户端安装实例
- `event`
  - 行为事件与系统事件

当前数据库已经有：

- `users`
- `products`
- `plans`
- `features`
- `plan_features`
- `orders`
- `entitlements`
- `installs`
- `events`
- `billing_webhook_events`

建议后续新增：

- `apps`
- `app_secrets`
- `checkout_sessions`
- `payment_attempts`
- `refresh_tokens` 或 `sessions`
- `admin_audit_logs`

## 7. 统一 API 契约

这里是整个中台最重要的部分。

应用层只应该理解“中台标准对象”，不应该理解“支付宝 page pay”和“微信 native pay”这些 provider 术语。

### 7.1 认证 API

```text
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
GET    /v1/me
```

返回统一 session 模型：

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque-or-jwt",
  "expiresIn": 604800,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Demo User"
  }
}
```

### 7.2 应用接入 API

```text
GET    /v1/apps/:appCode
POST   /v1/apps/:appCode/session
POST   /v1/apps/:appCode/installs
POST   /v1/apps/:appCode/installs/:installId/bind
POST   /v1/apps/:appCode/installs/:installId/heartbeat
```

用途：

- 应用确认自身接入身份
- Chrome 扩展创建安装实例
- 用户登录后，把安装实例绑定到用户

### 7.3 目录与套餐 API

```text
GET    /v1/catalog
GET    /v1/products/:productCode
GET    /v1/products/:productCode/plans
```

### 7.4 统一结算 API

核心不是“创建支付宝订单”，而是“创建 checkout session”：

```text
POST   /v1/checkout/sessions
GET    /v1/checkout/sessions/:sessionId
GET    /v1/orders/:orderNo
POST   /v1/orders/:orderNo/cancel
```

创建参数示例：

```json
{
  "appCode": "ai-web-translator-ext",
  "productCode": "ai_web_translator",
  "planCode": "translator_pro_monthly",
  "providerPreference": "alipay",
  "installId": "optional-install-id",
  "successUrl": "https://app.example.com/billing/success",
  "cancelUrl": "https://app.example.com/billing/cancel"
}
```

统一响应示例：

```json
{
  "sessionId": "chk_123",
  "orderNo": "FD202603280001",
  "status": "pending",
  "presentation": {
    "type": "hosted_page",
    "url": "https://core.example.com/checkout/chk_123"
  }
}
```

如果应用不想使用中台托管页面，也可以返回：

```json
{
  "sessionId": "chk_123",
  "orderNo": "FD202603280001",
  "status": "pending",
  "presentation": {
    "type": "qr_code",
    "qrCodeText": "https://qr.alipay.com/...."
  }
}
```

`presentation.type` 建议只保留三种：

- `hosted_page`
- `redirect_url`
- `qr_code`

这样应用层只需要做统一分支，不需要区分支付宝和微信。

### 7.5 授权 API

```text
GET    /v1/entitlements/me
GET    /v1/apps/:appCode/entitlements/me
POST   /v1/licenses/check
```

统一授权判断示例：

```json
{
  "productCode": "ai_web_translator",
  "active": true,
  "features": [
    "translator.pro",
    "translator.unlimited"
  ]
}
```

### 7.6 事件 API

```text
POST   /v1/events/batch
```

后续补充：

```text
GET    /v1/admin/events
GET    /v1/admin/events/summary
```

## 8. 托管支付页的定位

中台应该补一个托管支付页，但它的定位必须明确：

- 第一，它是支付链路测试页
- 第二，它是应用层可复用的托管收银台
- 第三，它不是业务产品主页面

因此建议加：

```text
GET /checkout/:sessionId
GET /checkout/:sessionId/status
GET /checkout/:sessionId/result
```

页面只做几件事：

- 展示订单摘要
- 渲染二维码或跳转按钮
- 轮询支付状态
- 支付完成后展示成功页

这样你既能用它做真实支付验证，也能让某些应用直接托管到中台。

## 9. 应用接入方式

### 9.1 Chrome 扩展

推荐模式：

1. 扩展首次启动时调用中台创建 `install`
2. 用户在扩展中点击登录，打开中台登录页或走中台认证 API
3. 登录完成后，扩展拿到用户态 token
4. 扩展查询 entitlement，决定哪些功能可用
5. 购买时创建 checkout session
6. 扩展展示中台托管支付页，或渲染中台返回的 QR 信息
7. 支付完成后重新拉取 entitlement

### 9.2 Next.js / React 应用

推荐模式：

1. 前端站点只负责登录页、套餐页、个人中心页
2. 所有用户身份与支付状态都由中台返回
3. Web 应用不接支付 SDK，不自己处理回调
4. Web 应用只需要对接中台 session 和 entitlement

## 10. 安全要求

必须从现在开始落地的安全基线：

- 支付密钥只存中台配置中心
- 系统设置加密存储
- 前端应用永远不接触支付私钥
- 管理后台接口必须基于 admin 权限
- 后续把 admin token 从 `localStorage` 迁移到 `httpOnly cookie`
- 增加 refresh token / session 撤销能力
- 对支付回调、登录、下单增加更细粒度限流
- 增加 admin 操作审计日志
- 应用接入增加 `appSecret` 或签名机制，避免任意来源伪造调用

## 11. 可观测性与运维

单机也必须具备最基本的生产能力：

- `/health`
- `/ready`
- 版本号输出
- 结构化日志
- 订单支付事件日志
- 回调事件可查询
- 手工补单入口
- 主动查单任务

第一阶段不强求引入完整监控栈，但至少要补：

- 订单状态后台列表
- webhook 事件后台列表
- 补单按钮
- 失败订单和未完成订单定时扫描任务

## 12. 当前实现到目标架构的差距

最关键的差距有六个：

1. 现在是 `billing order`，还不是 `checkout session`
2. 现在还没有 `app` 模块，无法管理多应用接入
3. 现在 `install` 只有表，没有完整业务流
4. 现在没有托管支付页，无法形成统一结算入口
5. 现在 `worker` 还是占位，没有补偿任务和定时任务
6. 现在没有完整后台，无法做订单运营和授权运营

## 13. 推荐开发顺序

### Phase 1: 收敛中台接口

目标：

- 明确中台公共 API
- 不再把 provider 差异直接暴露给应用层

要做：

- 增加 `app` 模块
- 增加 `checkout session` 模型
- 调整 `billing` 输出为统一 `presentation`

### Phase 2: 补齐托管支付页

目标：

- 给中台自己提供测试能力
- 给应用层提供统一收银台

要做：

- `GET /checkout/:sessionId`
- `GET /checkout/:sessionId/status`
- 支付成功/失败结果页

### Phase 3: 补齐扩展授权链路

目标：

- 让 Chrome 扩展可以真正接入

要做：

- `install` 注册
- `install` 绑定用户
- 按 `appCode` 查询 entitlement
- 扩展心跳和版本上报

### Phase 4: 补齐运营后台

目标：

- 让中台具备可管理性

要做：

- 产品 / 套餐 / 功能管理
- 订单列表
- 回调事件列表
- entitlement 管理
- 补单、撤权、手工发放

### Phase 5: 补齐可靠性能力

目标：

- 形成生产级闭环

要做：

- worker 任务化
- 查单与补偿
- 退款、关单、对账
- 审计日志
- 集成测试

## 14. 当前阶段的明确结论

这套系统现在最合理的定位是：

> 一个面向多应用复用的统一账号、支付、授权中台，采用模块化单体架构部署在单机 Docker 环境中。

当前代码已经具备后端核心骨架，但还没有完成“标准化中台 API”这一层的抽象收敛。

接下来的开发重点不应继续分散到各个应用里，而应该优先把以下三件事做成：

- `app` 模块
- `checkout session` 模块
- 托管支付页

只有这三块落地之后，Chrome 扩展和 Web 应用才真正能以统一方式接入这套中台。
