# Lingcoo Core Stack 与 Business Starter 架构评估

> 评估日期：2026-09-09  
> 对比项目：`/Users/admin/Projects/Lingcoo-core-stack`、`/Users/admin/Projects/ts-fastify-business-starter`

## 1. 决策结论

### 1.1 不整体迁移到 Business Starter

`Lingcoo-core-stack` 不迁移为 `ts-fastify-business-starter` 的派生项目，也不直接替换现有运行底座、数据库模型或 Admin UI。

整体迁移的实际成本接近一次业务系统重构，主要原因是：

- 两个项目定位不同：Stack 是具体的商业化中台，Starter 是可生成的通用业务项目底座；
- Stack 已经包含应用接入、Checkout、Billing、License、Entitlement、Install、Deployment、Content、Docs、Ticket 和 AI 等具体领域能力；
- Starter 明确不包含 Core Stack 的应用市场、License、部署和结算领域模型；
- 两者的认证方式、支付模型、数据库迁移历史、运行时版本、模块实现方式和前端技术组织均不一致；
- Stack 已经存在真实的微信支付、支付宝支付、应用产品导入和生产部署链路，不能用 Starter 当前的通用 Mock Payment 模型替代。

### 1.2 继续采用模块化单体

对于 Stack 当前的部署规模和业务特征，`API + Worker + PostgreSQL + Redis + Caddy` 的模块化单体仍然是最合适的形态。

该形态适合当前原因：

- 用户、订单、支付、权益和应用接入之间存在强事务关系；
- 单机或少量实例部署，拆分微服务会增加运行和运维成本；
- 业务域仍在快速演进，保持单仓库和单数据库有利于迭代；
- Worker、支付回调、补偿任务和后台运营功能仍需要共享领域模型。

因此，当前目标不是拆分服务，而是把现有单体逐步强化为边界更清晰、依赖更显式、可验证性更高的模块化单体。

### 1.3 选择性借鉴 Starter 的工程组织

Stack 应借鉴 Starter 的工程约束和质量门禁，但不照搬其全部目录、包管理器、运行时和通用模块。

建议采用以下原则：

> 保留 Stack 的业务模型和运行形态；吸收 Starter 的模块边界、Composition Root、共享 Contracts、API Client 和质量验证体系。

## 2. 两个项目的定位差异

| 维度     | Lingcoo Core Stack                                                              | ts-fastify-business-starter                                                                               |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 定位     | 面向多个应用的商业化中台                                                        | 可复制、可生成的通用业务项目底座                                                                          |
| 核心领域 | App、Checkout、Billing、License、Install、Deployment、Content、Docs、Ticket、AI | Identity、Access Control、Audit、Settings、Jobs、Outbox、Mail、Notifications、Storage、Branding、Payments |
| 支付     | 微信支付、支付宝真实 Provider，包含回调验签和权益发放                           | 通用 Payment 抽象，当前以 Mock Provider 为默认实现                                                        |
| 认证     | JWT，同时支持应用 Token                                                         | Cookie/CSRF Session 体系                                                                                  |
| 运行时   | Node 22、npm、CommonJS、Redis                                                   | Node 24、pnpm、ESM，Redis 按需引入                                                                        |
| 前端     | 产品化的独立 Admin UI，多业务页面                                               | 通用 Ant Design Admin 与预留 Web                                                                          |
| 数据库   | 已有 Stack 领域表和连续迁移历史                                                 | 通用业务模块表和独立迁移历史                                                                              |
| 交付方式 | 面向 Stack 的镜像发布和生产部署                                                 | 面向模板生成、质量门禁和 Docker Smoke                                                                     |

## 3. 当前 Stack 的优势与主要问题

### 3.1 应保留的优势

- 已经形成清晰的模块化单体结构；
- 支付、订单、权益和应用接入的领域模型与实际产品目标一致；
- 生产环境采用预构建镜像部署，不在服务器本地构建；
- 已具备 API、Worker、PostgreSQL、Redis、Caddy 的完整部署骨架；
- Admin UI 已经围绕 Stack 的资源和运营流程进行产品化设计；
- 业务模块正在从 MVP 向运营、审计、任务和部署能力扩展。

### 3.2 需要改善的工程组织

- 模块之间存在较多直接引用其他模块的 Service 和 Repository；
- `src/lib` 同时承载设置、邮件、任务、审计、交付和领域辅助逻辑，职责边界偏宽；
- 业务 Service 通常在 Route 中直接 `new`，依赖组装不够集中；
- 数据库 Schema 主要集中在 `src/db/schema.ts`，模块拥有关系不够显式；
- 前后端请求/响应 Contract 尚未形成独立共享层；
- Admin UI 有独立 package，但根 TypeScript 配置和 CI 没有完整覆盖它；
- CI 当前主要验证后端，缺少 Admin build、迁移幂等、Docker Smoke 和端到端质量门禁；
- README 和当前实现存在一定进度滞后，例如 Worker、模块数量和已实现能力没有完全同步。

这些问题值得治理，但不足以证明需要更换整个工程底座。

## 4. 建议借鉴的 Starter 能力

### 4.1 模块公开出口

逐步为 Stack 模块增加明确的 `public.ts` 或等价公开 API：

```text
modules/<name>/
├── api/
├── application/
├── domain/
├── infrastructure/
├── plugin.ts
└── public.ts
```

跨模块只能访问目标模块公开的 Service、Port 或类型，禁止直接导入其他模块的 Repository 和内部 Schema。

第一批应优先治理：

- `auth`
- `app`
- `checkout`
- `billing`
- `license`
- `install`
- `event`
- `admin`

### 4.2 Composition Root

将应用入口拆分为 HTTP 基础设施组装、模块依赖组装和进程入口：

```text
src/
├── entrypoints/
│   ├── api.ts
│   └── worker.ts
├── composition/
│   └── modules.ts
├── app.ts
└── modules/
```

目标是让 API 和 Worker 使用同一套显式依赖组装逻辑，减少 Route 和 Worker 中到处创建 Service 的情况。

### 4.3 明确的模块内部层次

不要求机械地为所有模块创建完整目录，但新增或重构模块时应尽量遵循：

- `api`：路由、请求协议解析和响应映射；
- `application`：用例、事务编排和跨 Port 调用；
- `domain`：状态机、策略、领域类型和业务规则；
- `infrastructure`：Repository、数据库 Schema 和 Provider Adapter；
- `workers`：只放该模块自己的异步任务处理。

### 4.4 Shared Contracts 与 API Client

Stack 同时服务 Admin、Chrome 扩展和其他 Web 应用，建议建立无 UI 依赖的共享层：

- `packages/contracts`：Zod 请求/响应 Schema、错误格式、分页和排序协议；
- `packages/api-client`：基于 Fetch 的客户端和资源 API；
- React Query、UI 组件和页面逻辑仍留在 Admin 或具体前端项目内。

该部分应在现有 API 稳定后逐模块引入，不应一次性重写所有接口。

### 4.5 工程质量门禁

建议逐步形成类似 Starter 的统一检查入口，至少覆盖：

- 后端和 Admin 的 typecheck；
- 后端、Admin 和关键前端测试；
- 后端和 Admin production build；
- 数据库 migration 重复执行；
- Docker production smoke；
- API readiness 和 Worker 启停；
- 模块边界检查；
- 关键支付回调、权益发放和部署流程的集成测试。

## 5. 暂不借鉴或暂不迁移的内容

以下内容当前不应作为迁移目标：

- 不把 Stack 的 CommonJS 立即改成 Starter 的 ESM；
- 不因为 Starter 使用 Node 24 就立即升级运行时；
- 不为了引入 workspace 而替换 npm/pnpm；
- 不替换现有 JWT 和应用 Token 体系；
- 不用 Starter 的通用 Mock Payment 取代微信/支付宝真实 Provider；
- 不重建已有数据库迁移历史；
- 不用 Starter Admin 覆盖现有 Stack Admin UI；
- 不为了目录一致而给所有模块机械添加空目录；
- 不引入微服务或新的消息中间件。

## 6. 分阶段实施建议

### 阶段一：工程可验证性

优先修复不涉及业务模型的工程问题：

1. CI 增加 Admin 安装、typecheck、build 和 lint；
2. 增加 migration 幂等检查；
3. 增加 Docker production smoke 和 readiness 检查；
4. 统一根项目和 Admin 的依赖安装方式；
5. 更新 README、部署文档和模块清单，使其与当前实现一致。

### 阶段二：模块边界

1. 为核心模块增加 `public.ts`；
2. 添加跨模块 import 检查；
3. 禁止跨模块直接访问 Repository 和 Schema；
4. 将 `src/lib` 中的业务能力按职责迁入明确模块；
5. 保留数据库聚合入口，但逐步将 Schema 移到模块的 persistence 目录。

### 阶段三：共享协议

1. 先为 Admin 抽取稳定的 Contracts；
2. 再为 Admin 抽取 API Client；
3. 将扩展/Web 客户端逐步迁移到共享协议；
4. 对外 API 变更采用显式版本和兼容策略。

### 阶段四：依赖组装重构

1. 增加 `entrypoints/api.ts` 和 `entrypoints/worker.ts`；
2. 建立统一的 Composition Root；
3. 将 Service、Provider、Worker Handler 的创建集中化；
4. 让 API 与 Worker 共享模块运行时，但保持不同进程入口。

## 7. 未来重新评估整体迁移的条件

只有在以下条件同时成立时，才重新评估 Stack 是否需要以 Starter 为基础重建：

- Stack 的核心领域模型被确认需要大规模废弃；
- 需要持续生成多个结构高度相似的 Stack 项目；
- Starter 已经具备 Stack 所需的真实支付、应用接入和权益模型；
- 已经有明确的数据迁移和 API 兼容方案；
- 重建收益明显高于在现有 Stack 上增量治理的收益。

在此之前，Starter 与 Stack 保持独立仓库更合理：Starter 沉淀通用能力，Stack 选择性回收工程实践和通用模块设计。

## 8. 最终架构判断

`Lingcoo-core-stack` 当前最适合的方向是：

> 面向具体商业化中台的、强边界模块化单体。

不是：

- 直接迁移为通用 Starter 项目；
- 变成微服务；
- 把所有通用能力提前抽成共享包；
- 为追求目录一致而牺牲现有领域模型和交付稳定性。
