# fd-core-stack

单机可部署的核心中台骨架，面向：

- `auth`
- `billing`
- `license`
- `event`
- `api`

当前目标不是把所有业务一次写完，而是先搭好一套能长期继续长的底座。

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
│   ├── worker.ts
│   ├── db
│   │   └── schema.ts
│   ├── lib
│   │   └── env.ts
│   ├── modules
│   │   ├── auth
│   │   ├── billing
│   │   ├── event
│   │   ├── license
│   │   └── system
│   ├── plugins
│   │   ├── db.ts
│   │   └── redis.ts
│   └── types
│       └── fastify.d.ts
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

## 数据库

第一次启动后，执行：

```bash
docker compose exec api npm run db:push
```

这一步会把当前 `src/db/schema.ts` 推到 PostgreSQL。

`docker/postgres/init/001-extensions.sql` 会在新库初始化时自动启用 `pgcrypto`，用于 UUID 默认值。

## 这版已经具备的内容

- Docker / Compose 开发与生产骨架
- Fastify 应用入口
- PostgreSQL / Redis 连接插件
- 模块化路由结构
- 系统、认证、支付、授权、事件模块占位
- 一版中台核心表结构
- GitHub Actions 基础 CI

## 这版还没有做的内容

- 真正的注册 / 登录流程
- 微信支付签名与回调验签
- 支付宝下单与通知验签
- entitlement 真实计算
- Admin 后台
- 队列任务处理

## 支付接入策略

这套骨架先把支付模块和配置位留出来。

后续建议：

- 微信支付：按 API v3 接，自己封装签名、验签和回调处理
- 支付宝：优先用官方 Node SDK 或标准开放平台接口封装

原因很简单：

- 微信支付在 Node 生态里不适合把命脉押在小众第三方包上
- 支付是核心业务，回调验签和订单状态同步必须自己掌控

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

1. 定义配置中心和环境变量规范
2. 固化数据库 schema
3. 真正实现 `auth / billing / license / event` 的服务层
4. 接微信支付和支付宝
5. 增加后台管理接口
