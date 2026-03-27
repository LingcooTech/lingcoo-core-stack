# fd-core-stack

单机可部署的核心中台骨架，面向：

- `auth`
- `billing`
- `license`
- `event`
- `api`

当前目标不是一次把所有支付细节都写满，而是先把核心中台的 MVP 主流程跑通。

## 技术选择

- 应用框架：Fastify
- 语言：TypeScript
- 数据库：PostgreSQL
- 缓存 / 队列预留：Redis
- 反向代理：Caddy
- 数据访问：Drizzle ORM
- 部署方式：Docker Compose
- 支付方向：微信支付、支付宝

为什么这样选：

- Fastify 够轻，模块化清晰，单机资源占用比重框架更稳
- PostgreSQL 足够支撑用户、授权、订单、事件这些核心数据
- Redis 先作为缓存和任务队列预留，不强行引入复杂消息系统
- Caddy 适合单机，后面有域名时可以直接接 HTTPS
- 生产环境端口做成可配置，避免在一台机器上和其他站点争抢 `80/443`

## 当前目录

```text
.
├── .github/workflows/ci.yml
├── Caddyfile
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── drizzle.config.ts
├── src
│   ├── app.ts
│   ├── server.ts
│   ├── worker.ts
│   ├── db
│   ├── lib
│   ├── modules
│   │   ├── auth
│   │   ├── billing
│   │   ├── event
│   │   ├── license
│   │   └── system
│   ├── plugins
│   ├── scripts
│   └── types
└── secrets
```

## 启动

先复制环境变量：

```bash
cp .env.example .env
```

本地开发：

```bash
docker compose up --build
```

访问入口：

- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`
- Docs: `http://localhost:8080/docs`

生产部署：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  api npm run db:migrate
docker compose -f docker-compose.prod.yml up -d api worker caddy
```

生产默认访问入口：

- API: `http://<server-ip>:18080`
- Health: `http://<server-ip>:18080/health`
- Docs: `http://<server-ip>:18080/docs`

如果服务器已经有统一入口层占用 `80/443`，只需要在 `.env` 里改 `FD_CORE_HTTP_PORT` / `FD_CORE_HTTPS_PORT` 即可。

完整自动化发布说明见 [DEPLOYMENT.md](/Users/admin/Desktop/fd-core-stack/DEPLOYMENT.md)。

## MVP 初始化

开发环境第一次启动后，执行数据库迁移：

```bash
docker compose exec api npm run db:migrate
```

然后导入一套可直接测试的 MVP 产品数据：

```bash
docker compose exec api npm run seed:mvp
```

`docker/postgres/init/001-extensions.sql` 会在新库初始化时自动启用 `pgcrypto`，用于 UUID 默认值。

## 这版已经具备的内容

- Docker / Compose 开发与生产骨架
- Fastify 应用入口
- PostgreSQL / Redis 连接插件
- 模块注册式架构
- 邮箱密码注册 / 登录
- JWT 鉴权
- 产品、套餐、功能、授权的数据模型
- 创建订单
- 微信支付 Native 真实下单
- 微信支付回调验签与 AES-GCM 解密
- 支付宝页面支付真实下单
- 支付宝异步通知验签
- 支付回调幂等落库
- 本地模拟支付完成
- 支付完成后自动发放 entitlement
- 查询当前用户权益
- 事件入库
- 一版中台核心表结构和迁移
- MVP 种子数据脚本
- GitHub Actions CI
- Docker PR 构建校验
- GHCR + 阿里云 ACR 双镜像仓库发布基线
- SSH 自动部署脚本
- 生产环境纯镜像部署，不在服务器本地构建
- 版本号、健康检查、就绪检查接口

## 这版还没有做的内容

- 支付状态主动查询与补单
- 退款、关单、对账
- Admin 后台
- 真正的异步任务队列
- 订阅续费与周期性扣费
- 风控、限流和审计后台

## 支付接入策略

当前实现已经是真实支付链路，不再是 stub：

- 微信支付：API v3 `Native` 下单，服务端自己签名，请求回调时使用平台证书验签并用 API v3 Key 解密报文
- 支付宝：官方 `alipay-sdk` 生成 `alipay.trade.page.pay` 支付链接，异步通知使用官方 `checkNotifySignV2` 验签
- 两条回调最终都回收敛到同一个订单支付事务，复用已有 entitlement 发放逻辑

这样选的原因很直接：

- 微信支付最关键的是签名、验签和解密，自己掌控更稳
- 支付宝官方 SDK 已经把页面支付和通知验签封装好了，直接用最省事
- 统一在 `BillingService` 里做支付成功事务，避免在路由层写重复业务逻辑

## 当前模块结构

当前不是“外部插件系统”，而是“模块化单体”：

- `system`
  - 健康检查、模块自检
- `auth`
  - 注册、登录、`/v1/me`
- `billing`
  - 下单、订单查询、支付 provider 适配、模拟支付
- `license`
  - 产品目录、套餐、功能、entitlement 发放与查询
- `event`
  - 埋点和业务事件入库

模块之间共享一套数据库、Redis、环境配置和鉴权能力，但服务层是按业务域拆开的。

## 当前可跑通的 MVP 流程

1. 注册账号

```bash
curl -X POST http://localhost:8080/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@example.com",
    "password": "password123",
    "displayName": "Demo User"
  }'
```

2. 登录，拿到 `token`

```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@example.com",
    "password": "password123"
  }'
```

3. 查看产品目录

```bash
curl http://localhost:8080/v1/catalog
```

4. 创建订单并发起支付

```bash
curl -X POST http://localhost:8080/v1/billing/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "planCode": "translator_pro_monthly",
    "provider": "wechat_pay"
  }'
```

如果 `provider` 是 `wechat_pay`，响应里的 `payment.payload.codeUrl` 就是二维码内容，前端自己渲染二维码即可。

如果 `provider` 是 `alipay`，响应里的 `payment.payload.checkoutUrl` 直接打开即可拉起支付宝支付页。

5. 模拟支付成功

```bash
curl -X POST http://localhost:8080/v1/billing/orders/$ORDER_NO/mock-pay \
  -H "Authorization: Bearer $TOKEN"
```

6. 查询当前用户权益

```bash
curl http://localhost:8080/v1/entitlements/me \
  -H "Authorization: Bearer $TOKEN"
```

这条链路现在已经完整：

- 注册
- 登录
- 创建订单
- 发起微信 / 支付宝真实支付
- 异步通知验签
- 支付回调幂等处理
- 自动发放 entitlement
- 查询 entitlement

## 支付配置

### 微信支付

需要配置：

- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_CERT_SERIAL_NO`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_PRIVATE_KEY_PATH`
- `WECHAT_PAY_PLATFORM_CERT_PATH`
- `WECHAT_PAY_API_BASE_URL`
- `WECHAT_PAY_NOTIFY_URL`

当前固定走 `Native` 模式，返回 `code_url`，适合中台 API 对接任意前端。

### 支付宝

需要配置：

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY_PATH`
- `ALIPAY_PUBLIC_KEY_PATH`
- `ALIPAY_KEY_TYPE`
- `ALIPAY_GATEWAY`
- `ALIPAY_NOTIFY_URL`
- `ALIPAY_RETURN_URL`

当前固定走 `alipay.trade.page.pay`，返回可直接打开的支付 URL。

### 回调幂等

`billing_webhook_events` 表现在会记录支付回调事件，并对 `provider + provider_event_id` 做唯一约束。

即使支付平台重复推送通知，也不会重复发 entitlement。

## 单机部署建议

你现在只有一台 2 核 4G 服务器，所以先按这个原则来：

- 一个仓库
- 一个主应用
- 一个 worker
- 一个 PostgreSQL
- 一个 Redis
- 一个 Caddy

不要一开始拆微服务，也不要上 Kubernetes。

## 下一步

下一步应该做的是：

1. 增加订单状态查询、关单和补单
2. 增加退款和对账
3. 增加管理接口和后台
4. 增加异步任务处理和告警
