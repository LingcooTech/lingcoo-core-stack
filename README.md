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
docker compose -f docker-compose.prod.yml up --build -d
```

## MVP 初始化

第一次启动后，执行数据库推送：

```bash
docker compose exec api npm run db:push
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
- 本地模拟支付完成
- 支付完成后自动发放 entitlement
- 查询当前用户权益
- 事件入库
- 一版中台核心表结构和迁移
- MVP 种子数据脚本
- GitHub Actions 基础 CI

## 这版还没有做的内容

- 微信支付签名与回调验签
- 支付宝真实下单与通知验签
- 支付状态查询与退款
- Admin 后台
- 真正的异步任务队列
- 订阅续费与周期性扣费
- 风控、限流和审计后台

## 支付接入策略

这版已经把支付模块做成了 provider 适配层，但目前还是 stub。

后续建议：

- 微信支付：按 API v3 接，自己封装签名、验签和回调处理
- 支付宝：优先用官方 Node SDK 或标准开放平台接口封装

原因很简单：

- 微信支付在 Node 生态里不适合把命脉押在小众第三方包上
- 支付是核心业务，回调验签和订单状态同步必须自己掌控

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

4. 创建订单

```bash
curl -X POST http://localhost:8080/v1/billing/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "planCode": "translator_pro_monthly",
    "provider": "wechat_pay"
  }'
```

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

这条链路已经完整：

- 注册
- 登录
- 创建订单
- 标记支付成功
- 自动发放 entitlement
- 查询 entitlement

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

1. 接入微信支付真实下单、验签和回调落单
2. 接入支付宝真实下单、验签和回调落单
3. 增加管理接口和后台
4. 增加订单状态机、退款和补单逻辑
5. 增加异步任务处理和告警
