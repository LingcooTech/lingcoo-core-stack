# FD Edu System 上架 Stack 实施记录

本文记录 `FD-edu-system` 上架到 `fd-core-stack` 的实施结果、关键决策、验证情况和后续运维注意事项。

记录日期：2026-07-15

## 1. 目标

把 `/Users/admin/Projects/FD-edu-system` 上架到 `/Users/admin/Projects/FD-Stack/fd-core-stack`，让用户在 Stack 中完成购买后，可以在自己的目标服务器上一键部署。

本次交付的核心约束：

- 用户部署的是镜像，不是源代码。
- 公开仓库只承载 delivery 配置、脚本、manifest 和文档。
- ACR 只读凭据由 Stack 后台保存，客户不可见。
- Web 系统和微信小程序拆开售卖；本次商品只包含 Web 管理后台、公开站和 API。

## 2. 最终交付形态

### 2.1 源码仓

私有业务系统源码仓：

- `FutureDecade/fd-edu-system`
- 本地路径：`/Users/admin/Projects/FD-edu-system`
- 远端 main 最新提交：`7b47b445ab88a402045041d0ec15f85632c4c644`

该仓库负责：

- 应用源码
- Dockerfile
- 数据库迁移
- 镜像构建与发布 workflow
- 现有服务器部署 workflow

### 2.2 镜像

EDU runtime 镜像已经通过 GitHub Actions 发布到 ACR：

```text
crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/fd-edu-system:7b47b445ab88a402045041d0ec15f85632c4c644
```

镜像 digest：

```text
sha256:2b5c69fe7188bb7d35b0e705b2c135a6a2677f282b325dc261bd0b15c12e5f38
```

Workflow 结果：

- `CI`: success
- `Deploy`: success
- `build-and-push-acr`: success
- `publish-ghcr`: success
- 现有 EDU 服务器 deploy: success

### 2.3 公开 delivery 仓

公开交付仓：

- `https://github.com/FutureDecade/fd-edu-system-delivery`
- 本地路径：`/Users/admin/Projects/FutureDecade/fd-edu-system-delivery`
- 远端 main 最新提交：`069f7977d0439735936dd196fd515eabf8431367`

该仓库只包含：

- `fd-delivery.manifest.json`
- `docker-compose.yml`
- `Caddyfile`
- 安装、备份、恢复、状态上报、镜像更新脚本
- Stack 商品配置说明
- `.env.example`

该仓库不得包含：

- EDU 源码
- `.env`
- ACR 密码
- 初始管理员密码
- GitHub token
- 任何生产私钥

## 3. EDU 源码仓改造

本次在 `FD-edu-system` 中完成的交付相关能力：

- 生产环境启动校验：
  - `JWT_SECRET` 生产环境必须显式配置且长度至少 32。
  - 启用域名绑定时必须配置 `FD_BOUND_HOST`。
- 域名绑定：
  - 新增 `FD_DOMAIN_BINDING_SOURCE`、`FD_BOUND_HOST`。
  - API 在 `onRequest` 阶段校验 Host。
  - Host 不匹配时返回 `421`。
- 初始化脚本：
  - 新增 `npm run db:bootstrap`。
  - 支持 `INITIAL_ORGANIZATION_*` 和 `INITIAL_ADMIN_*`。
  - 首次初始化创建机构、管理员账号和管理员角色。
  - 初始管理员密码只用于首次初始化，不写入部署 `.env`。
  - 数据库已有完整初始化状态时幂等返回 `already_initialized`。
  - 数据库处于半初始化状态时拒绝继续。
- 迁移 runner：
  - `scripts/run-migrations.mjs` 改为使用 `drizzle-orm/node-postgres` programmatic migrator。
  - 读取同一份 `drizzle/meta/_journal.json` 和 SQL migration 文件。
  - 避免 `drizzle-kit migrate` 在部署环境中无诊断退出导致一键部署失败。
- 生产 compose：
  - API/worker 支持 `FD_DOMAIN_BINDING_SOURCE` 和 `FD_BOUND_HOST`。
  - 健康检查在绑定域名时携带 Host header。
- 测试：
  - 集成测试支持 `TEST_DATABASE_URL` / `TEST_REDIS_URL`，便于隔离数据库验证。

## 4. Stack 改造

本次在 `fd-core-stack` 中完成的能力：

- deployment status report 支持通用 `runtimeAssets`。
- 保留 legacy `frontendImage` / `websocketImage` / WordPress assets 兼容。
- 管理后台 deployment record 支持显示通用资产：
  - current
  - available
  - offered
  - applied
- 通知文案从 WordPress 专用资产更新扩展为通用 runtime assets。
- 新增 schema 测试覆盖：
  - 通用 runtime asset status report
  - legacy runtime image status report

Stack 远端状态：

- `FutureDecade/fd-core-stack`
- 最新提交：`dee00d4f6e53d02baf7553352a27d771cba2e66e`
- GitHub Actions `CI`: success
- GitHub Actions `Deploy`: success
- 服务器 `/opt/fd-core-stack` 已部署该版本
- 健康检查返回：

```json
{ "status": "ok", "version": "dee00d4f6e53d02baf7553352a27d771cba2e66e" }
```

## 5. Stack 商品配置

生产 Stack 中已创建 EDU 商品：

- App code: `fd_edu_system`
- App name: `FD Edu System`
- Type: `web_app`
- Category: `教育系统`
- Status: `active`
- Delivery mode: `one_click`

已创建测试 plan / offer：

- Plan code: `fd_edu_system_web_license`
- Offer code: `fd_edu_system_web_license`
- Interval: `one_time`
- Test price: `1` 分级金额，用于购买和部署链路验证

Plan 的部署策略：

```json
{
  "maxActiveDeployments": 1,
  "domainBindingMode": "lock_on_first_success",
  "domainBindingSource": "primaryDomain",
  "domainBindingScope": "exact_host",
  "allowMultiplePurchases": false
}
```

已配置 delivery preset：

```json
{
  "FD_EDU_RUNTIME_IMAGE": "crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/fd-edu-system:7b47b445ab88a402045041d0ec15f85632c4c644",
  "ACR_USERNAME": "aliyun3857382555",
  "FD_RUNTIME_IMAGE_UPDATE_POLICY": "manual"
}
```

已配置 secret 状态：

```json
{
  "ACR_PASSWORD": { "configured": true },
  "INITIAL_ADMIN_PASSWORD": { "configured": false }
}
```

说明：

- `ACR_PASSWORD` 是 Stack 后台加密保存的 preset secret。
- 用户部署时不会看到 `ACR_PASSWORD`。
- `INITIAL_ADMIN_PASSWORD` 是用户部署时填写的 secret，不属于后台 preset。

当前 EDU 商品配置已经版本化到 Stack 仓库：

```text
app-products/fd_edu_system/product.json
```

可通过导入脚本重复写入目标 Stack 数据库：

```bash
FD_APP_IMPORT_ACTOR_USER_ID=<admin-user-id> \
FD_EDU_ACR_PASSWORD=<readonly-acr-password> \
npm run app:import -- app-products/fd_edu_system/product.json --require-secrets
```

该 JSON 不保存 ACR 密码，只保存 `ACR_PASSWORD -> FD_EDU_ACR_PASSWORD` 的环境变量映射。若生产库已有 encrypted secret，导入时也可以不提供该环境变量，脚本会保留现有 secret。

Catalog 校验结果：

```json
{
  "app": "fd_edu_system",
  "plans": ["fd_edu_system_web_license"],
  "offers": ["fd_edu_system_web_license"],
  "deliveryMode": "one_click"
}
```

## 6. Delivery Manifest 合约

EDU delivery manifest 位于：

```text
https://github.com/FutureDecade/fd-edu-system-delivery/blob/main/fd-delivery.manifest.json
```

关键配置：

- `installer.repoUrl`: `https://github.com/FutureDecade/fd-edu-system-delivery.git`
- `installer.repoBranch`: `main`
- `installer.remoteInstallScriptUrl`: `https://raw.githubusercontent.com/FutureDecade/fd-edu-system-delivery/main/scripts/remote-install.sh`
- `installer.installPath`: `/opt/fd-edu-system`
- `domainSlots[0].envKey`: `EDU_DOMAIN`
- `domainSlots[0].sourceField`: `primaryDomain`
- `assets[0].key`: `fd-edu-runtime-image`
- `assets[0].imageEnv`: `FD_EDU_RUNTIME_IMAGE`
- `assets[0].authSecret`: `ACR_PASSWORD`

字段分层：

- Stack 后台 preset:
  - `FD_EDU_RUNTIME_IMAGE`
  - `ACR_USERNAME`
  - `FD_RUNTIME_IMAGE_UPDATE_POLICY`
- Stack 后台 preset secret:
  - `ACR_PASSWORD`
- 用户输入:
  - `INITIAL_ORGANIZATION_NAME`
  - `INITIAL_ORGANIZATION_BRAND_NAME`
  - `INITIAL_ORGANIZATION_PHONE`
  - `INITIAL_ORGANIZATION_ADDRESS`
  - `INITIAL_ADMIN_EMAIL`
  - `INITIAL_ADMIN_DISPLAY_NAME`
- 用户 secret:
  - `INITIAL_ADMIN_PASSWORD`
- 域名 slot:
  - `EDU_DOMAIN`

## 7. 验证记录

本地 EDU 验证：

- 临时隔离 Postgres/Redis 启动成功。
- 空库 `npm run db:migrate` 成功。
- `npm run db:seed` 成功。
- `npm run typecheck` 成功。
- `npm test` 20/20 通过。
- `npm run build:all` 成功。
- `git diff --check` 通过。

Stack 验证：

- `npm run typecheck` 成功。
- `npm test` 6/6 通过。
- `npm run build:all` 成功。
- `admin-ui` typecheck 成功。
- GitHub Actions deploy 成功。
- 服务器健康检查成功。
- EDU catalog API 可见。
- EDU delivery settings `configured=true`。

Delivery 验证：

- `bash -n scripts/*.sh` 成功。
- `fd-delivery.manifest.json` JSON parse 成功。
- 所有 `.sh` 脚本有执行位。
- `docker compose --env-file .env.example config` 成功。
- 未发现真实密钥写入公开仓。

## 8. 已知限制

未完成完整终端购买后的一键部署 E2E。

原因：

- 当前没有一台可安全占用 `80/443` 的空白目标服务器。
- 当前没有为这次测试准备独立 EDU 域名。

下一步需要准备：

- 一台空白 Debian 12 目标服务器。
- 一个解析到该服务器的测试域名。
- Stack 测试账号。
- 一次真实购买或测试订单。
- 通过 Stack 生成 deploy token。
- 在目标服务器执行 Stack 提供的 remote install 命令。

验收标准：

- 目标服务器 `/opt/fd-edu-system` 创建成功。
- 目标服务器成功 docker login ACR。
- API/worker/postgres/caddy 启动成功。
- `/health` 和 `/ready` 成功。
- 域名 HTTPS 可访问。
- 使用用户填写的初始管理员账号可登录 `/admin/`。
- Stack deployment record 显示 runtime asset current 状态。

## 9. 运维注意事项

### 9.1 镜像更新

后续 EDU 发布新版本时：

1. 推送 `FD-edu-system` main。
2. 等 GitHub Actions CI 成功。
3. 等 Deploy workflow 的 `build-and-push-acr` 成功。
4. 使用新的 immutable tag 或 digest 更新 Stack delivery preset `FD_EDU_RUNTIME_IMAGE`。
5. 通过 Stack deployment action 触发客户部署更新。

不要把 Stack preset 指向 `latest` 作为正式发布版本。

### 9.2 ACR 凭据

`ACR_USERNAME` 可以显示为普通 preset。

`ACR_PASSWORD` 必须作为 preset secret 保存：

- 不写入公开 delivery 仓。
- 不写入客户部署 `.env`。
- 只用于目标服务器 `docker login`。
- 安装脚本退出前 unset。

### 9.3 本地 Git 状态

这次由于本机原生 `git push` 到 GitHub 受代理或网络影响，EDU 和 delivery 远端提交是通过 GitHub API 写入的。

结果是：

- 远端状态正确。
- 本地 commit SHA 和远端 commit SHA 不完全一致。
- 后续继续开发前，先执行 fetch/对齐，不要直接盲推。

Stack 仓库的 `origin/main` 已在本地对齐到 `dee00d4`。

### 9.4 小程序售卖策略

当前结论：

- Web 系统作为主商品：部署 Web 管理后台、公开站和 API。
- 小程序作为独立商品或增购服务。

原因：

- 小程序有独立审核、发布、体验版/正式版状态。
- 小程序 AppId/AppSecret/支付配置与客户主体强相关。
- 小程序不一定需要创建新的服务器部署权益。
- 把小程序绑在 Web 商品里会增加部署和售后耦合。

推荐后续建模：

- `fd_edu_mini_program` 作为单独 App 或 add-on offer。
- 权益关联到同一个客户账号或同一个 EDU deployment。
- 不自动创建第二个 server deployment entitlement。
