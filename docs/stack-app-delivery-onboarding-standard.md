# Stack 应用接入与镜像交付标准

本文定义后续应用上架到 `fd-core-stack` 的统一标准。目标是让每个应用都可以按同一套模式完成购买、授权、部署、更新和运维，同时保证客户拿到的是镜像和部署权益，而不是源码。

## 1. 核心原则

### 1.1 镜像交付

上架到 Stack 的部署型应用必须按镜像交付：

- 应用源码留在私有源码仓。
- CI/CD 构建 runtime image。
- 镜像发布到 ACR。
- 客户服务器只拉取镜像。
- 公开 delivery 仓只包含部署脚本、compose、manifest 和文档。

不得把业务源码放进公开 delivery 仓。

### 1.2 权限分层

接入时必须明确三类信息：

- Stack 管理员 preset：由平台配置，用户不可改或默认不需要关心。
- 用户输入：购买部署时由用户填写。
- secret：只在服务端或目标服务器临时使用，不在页面明文展示。

典型例子：

| 类型          | 示例                        | 存储位置                              |
| ------------- | --------------------------- | ------------------------------------- |
| preset        | `FD_EDU_RUNTIME_IMAGE`      | Stack delivery settings encrypted row |
| preset        | `ACR_USERNAME`              | Stack delivery settings encrypted row |
| preset secret | `ACR_PASSWORD`              | Stack delivery settings encrypted row |
| user input    | `INITIAL_ORGANIZATION_NAME` | deployment input/meta/bootstrap env   |
| user secret   | `INITIAL_ADMIN_PASSWORD`    | bootstrap env only                    |
| domain slot   | `EDU_DOMAIN`                | deployment domain binding             |

### 1.3 凭据不可见

ACR 只读凭据必须由 Stack 后台保存：

- 用户不能在页面看到 ACR password。
- delivery 仓不能写入 ACR password。
- 部署 `.env` 不保留 ACR password。
- 目标服务器执行 `docker login` 后依赖 Docker credential store 拉取后续镜像。

### 1.4 可重复部署

安装脚本必须幂等：

- 已存在 Git repo 时执行 fast-forward 更新。
- 已存在 `.env` 时保留内部 secret。
- 数据库已初始化时不重复创建管理员。
- 失败后可重新执行同一条 remote install 命令。

## 2. 仓库分层

每个部署型应用建议至少有两个仓库。

### 2.1 私有源码仓

职责：

- 业务源码
- Dockerfile
- 数据库 schema/migration
- 单元测试和集成测试
- 构建 runtime image
- 推送 ACR / GHCR

命名建议：

```text
FutureDecade/<app-system>
```

示例：

```text
FutureDecade/fd-edu-system
```

### 2.2 公开 delivery 仓

职责：

- `fd-delivery.manifest.json`
- `docker-compose.yml`
- `Caddyfile`
- 安装脚本
- 备份/恢复脚本
- 状态上报脚本
- 镜像更新脚本
- 商品配置说明

命名建议：

```text
FutureDecade/<app-system>-delivery
```

示例：

```text
FutureDecade/fd-edu-system-delivery
```

公开 delivery 仓必须通过 secret scan：

```bash
rg -n "(BEGIN (RSA|OPENSSH|PRIVATE)|ghp_|github_pat_|AKIA|LTAI|ACR_PASSWORD=.+|JWT_SECRET=.+|INITIAL_ADMIN_PASSWORD=.+)" .
```

命中变量名本身可以接受；命中真实值必须删除并轮换密钥。

## 3. 源码仓接入要求

### 3.1 Dockerfile

必须提供可用于生产的 runtime image：

- image 内包含运行必需的 `dist`、静态资源、migration 文件和 package scripts。
- image 默认以非 root 用户运行。
- image 不包含开发缓存、测试数据库、真实 `.env`。
- image 应标注 revision label。

推荐标签：

```text
org.opencontainers.image.title=<app-name>
org.opencontainers.image.source=https://github.com/FutureDecade/<repo>
org.opencontainers.image.version=<git-sha>
org.opencontainers.image.revision=<git-sha>
```

### 3.2 迁移

必须提供生产可执行迁移命令：

```bash
npm run db:migrate
```

要求：

- 可以在空库执行。
- 可以在已迁移数据库重复执行。
- 失败时有明确非零退出码。
- 不依赖交互式 prompt。
- 不依赖源码仓 `.git`。

如使用 Drizzle，优先用 programmatic migrator 或经过验证的 CLI 路径。

### 3.3 首次初始化

需要租户/机构/管理员的应用必须提供 bootstrap 命令：

```bash
npm run db:bootstrap
```

输入从环境变量读取。

标准字段：

```text
INITIAL_ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD
INITIAL_ADMIN_DISPLAY_NAME
INITIAL_ORGANIZATION_NAME
INITIAL_ORGANIZATION_BRAND_NAME
INITIAL_ORGANIZATION_PHONE
INITIAL_ORGANIZATION_ADDRESS
```

要求：

- 初始密码只用于首次写入 hash。
- 初始密码不写入部署 `.env`。
- 初始化已完成时幂等退出。
- 半初始化状态必须拒绝继续，避免产生不可恢复数据。

### 3.4 域名绑定

部署型 Web 应用必须支持绑定部署域名。

标准变量：

```text
FD_DOMAIN_BINDING_SOURCE=primaryDomain
FD_DOMAIN_BINDING_SCOPE=exact_host
FD_BOUND_HOST=<locked-host>
```

应用应在入口层校验 Host：

- 匹配：继续处理。
- 不匹配：返回 `421` 或明确错误。

健康检查需要在绑定域名时带 Host header。

### 3.5 健康检查

应用必须提供：

```text
GET /health
GET /ready
```

推荐语义：

- `/health`: 进程存活，轻量检查。
- `/ready`: 数据库等依赖可用。

安装脚本只应在 `/ready` 成功后向 Stack 上报部署成功。

### 3.6 生产环境校验

应用生产启动时必须拒绝危险默认值：

- 默认 JWT secret
- 过短 JWT secret
- 缺失数据库连接
- 启用域名绑定但未传 `FD_BOUND_HOST`

## 4. 镜像发布标准

### 4.1 镜像仓库

当前标准 ACR registry：

```text
crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com
```

当前 namespace：

```text
futuredecade
```

镜像命名：

```text
<registry>/<namespace>/<app-image-name>:<git-sha>
```

示例：

```text
crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/fd-edu-system:<git-sha>
```

正式 Stack preset 应使用 immutable SHA tag 或 digest，不使用 `latest`。

### 4.2 GitHub Actions

源码仓至少需要：

- CI workflow
  - migration
  - seed
  - typecheck
  - test
  - build
- Deploy/build workflow
  - checkout exact commit
  - build runtime image
  - push ACR `latest`
  - push ACR `<git-sha>`
  - 可选 mirror GHCR

Deploy workflow 输出应能确认：

- image tag
- image digest
- build job conclusion

## 5. Delivery Manifest 标准

每个 delivery 仓必须有：

```text
fd-delivery.manifest.json
```

### 5.1 installer

标准结构：

```json
{
  "installer": {
    "repoUrl": "https://github.com/FutureDecade/<app>-delivery.git",
    "repoBranch": "main",
    "remoteInstallScriptUrl": "https://raw.githubusercontent.com/FutureDecade/<app>-delivery/main/scripts/remote-install.sh",
    "installPath": "/opt/<app>"
  }
}
```

要求：

- `repoUrl` 指向公开 delivery 仓。
- `remoteInstallScriptUrl` 可以被目标服务器直接 curl。
- `installPath` 不与其他产品冲突。

### 5.2 domainSlots

Web 应用必须声明域名 slot：

```json
{
  "key": "primary",
  "envKey": "APP_DOMAIN",
  "sourceField": "primaryDomain",
  "required": true
}
```

Stack 会根据 plan deployment policy 锁定域名。

### 5.3 envFields

字段必须区分 scope：

- `preset`: Stack 管理员配置。
- `user_input`: 用户购买/部署时填写。

镜像字段示例：

```json
{
  "key": "APP_RUNTIME_IMAGE",
  "type": "text",
  "scope": "preset",
  "required": true,
  "advanced": true
}
```

### 5.4 secretFields

secret 字段必须声明：

```json
{
  "key": "ACR_PASSWORD",
  "type": "secret",
  "scope": "preset",
  "required": true
}
```

用户 secret 示例：

```json
{
  "key": "INITIAL_ADMIN_PASSWORD",
  "type": "secret",
  "scope": "user_input",
  "required": true
}
```

### 5.5 assets

私有 Docker 镜像必须声明 asset：

```json
{
  "key": "app-runtime-image",
  "label": "应用运行镜像",
  "type": "docker_image",
  "required": true,
  "visibility": "private",
  "imageEnv": "APP_RUNTIME_IMAGE",
  "authSecret": "ACR_PASSWORD"
}
```

asset key 必须稳定，因为 deployment status report 和更新动作会引用它。

## 6. Delivery 脚本标准

推荐脚本结构：

```text
scripts/
  remote-install.sh
  prepare-server.sh
  stack-bootstrap.sh
  quick-install.sh
  install-deployment-timers.sh
  report-deployment-status.sh
  run-pending-deployment-action.sh
  apply-runtime-image-update.sh
  record-runtime-image-update.sh
  backup.sh
  restore.sh
  common.sh
```

### 6.1 remote-install.sh

职责：

- 安装基础依赖。
- clone 或 pull delivery 仓。
- 调用 `prepare-server.sh`。
- 调用 `quick-install.sh`。

输入：

```text
FD_STACK_DEPLOY_TOKEN
FD_STACK_EXCHANGE_URL 或 FD_STACK_PUBLIC_BASE_URL
```

### 6.2 stack-bootstrap.sh

职责：

- 用 deploy token 向 Stack exchange endpoint 换取 bootstrap env。
- 将 Stack 后台 preset、用户输入、用户 secret、状态上报 URL 注入环境变量。

要求：

- 不把 bootstrap JSON 写入持久文件。
- 脚本退出时 unset token 和 secret。

### 6.3 quick-install.sh

职责：

- 校验必填字段。
- 生成或保留内部 secret。
- 写入部署 `.env`。
- 使用 `ACR_PASSWORD` 执行 docker login。
- 拉取镜像。
- 启动数据库。
- 运行迁移。
- 运行 bootstrap。
- 启动服务。
- 等待 `/ready`。
- 安装 systemd timer。
- 上报部署状态。

要求：

- 不把 `ACR_PASSWORD` 写入 `.env`。
- 不把 `INITIAL_ADMIN_PASSWORD` 写入 `.env`。
- `.env` 权限为 `600`。
- 重复执行不会覆盖已生成的内部 secret。

### 6.4 report-deployment-status.sh

必须向 Stack 上报：

- 服务状态
- 当前 runtime image
- 可用 runtime image
- runtime asset key

标准 payload 中应使用：

```json
{
  "runtimeAssets": {
    "app-runtime-image": {
      "current": "registry/app:<current>",
      "available": "registry/app:<available>",
      "offeredAt": "2026-01-01T00:00:00.000Z",
      "appliedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

### 6.5 更新动作

如果 Stack 发起 `apply_runtime_assets`，delivery 仓应：

- 读取 pending action。
- 写入目标 image。
- 备份数据库。
- `docker compose pull`。
- 运行迁移。
- 重启服务。
- 等待健康检查。
- 成功后上报 applied。
- 失败时回滚 `.env` 和 compose 服务。

## 7. Stack 商品配置标准

### 7.1 App code

App code 必须稳定，使用 snake_case：

```text
fd_edu_system
fd_headless_wp_system
```

不要使用会变的市场名或中文名作为 code。

### 7.2 App metadata

必须配置：

- `name`
- `tagline`
- `description`
- `content`
- `category`
- `type`
- `status`
- `meta.deliveryMode = "one_click"`
- `meta.deliveryManifest`
- `meta.deliveryManifestSource`

### 7.3 Plan

部署型主商品的 plan 必须设置 deployment policy：

```json
{
  "maxActiveDeployments": 1,
  "domainBindingMode": "lock_on_first_success",
  "domainBindingSource": "primaryDomain",
  "domainBindingScope": "exact_host",
  "allowMultiplePurchases": false
}
```

如果是加购服务或不创建服务器部署的商品，不要给它创建 server deployment entitlement。

### 7.4 Offer

测试阶段可以使用测试价 offer。

正式上架前必须确认：

- 价格
- 货币
- billing interval
- 是否默认 offer
- 是否有测试 badge

### 7.5 Delivery settings

所有 preset 和 secret 应写入 `DeliverySettingsService`：

```ts
await deliverySettings.upsertSettings(
  appCode,
  {
    values: {
      APP_RUNTIME_IMAGE: '<immutable-image>',
      ACR_USERNAME: '<read-only-user>',
      FD_RUNTIME_IMAGE_UPDATE_POLICY: 'manual',
    },
    secrets: {
      ACR_PASSWORD: '<read-only-password>',
    },
    installer: {
      repoUrl: 'https://github.com/FutureDecade/<app>-delivery.git',
      repoBranch: 'main',
    },
  },
  actorUserId,
);
```

不要把 secret 写进 `apps.meta`。

### 7.6 版本化商品配置

每个可上架应用必须在 Stack 仓库中提交一份版本化商品配置：

```text
app-products/<app-code>/product.json
```

这份配置是应用上架的可重复导入源，必须包含：

- `app`: 商品基础信息、前台展示内容、分类、状态和 `meta.deliveryMode`。
- `features`: 该商品授权包含的功能。
- `plans`: 套餐、价格、计费周期和 deployment policy。
- `offers`: 前台购买 offer。
- `delivery.manifestSource`: 公开 delivery 仓和 manifest 路径。
- `delivery.manifest`: 当前审核通过的 manifest 快照。
- `delivery.settings.values`: 可公开 preset，例如 runtime image、ACR 用户名、更新策略。
- `delivery.settings.secretsFromEnv`: secret key 到环境变量名的映射。

secret 值不得进入 JSON。导入时通过环境变量注入：

```bash
FD_APP_IMPORT_ACTOR_USER_ID=<admin-user-id> \
FD_EDU_ACR_PASSWORD=<readonly-acr-password> \
npm run app:import -- app-products/fd_edu_system/product.json --require-secrets
```

如果生产库里已有 secret，可以不传对应环境变量，导入脚本会保留已有 encrypted secret 并输出 missing secret env 提示。全新环境首次导入时必须使用 `--require-secrets`，避免商品显示已上架但镜像凭据未配置。

## 8. 上架流程

### 8.1 准备源码仓

检查项：

- Dockerfile 可构建 runtime image。
- migration 可从空库执行。
- bootstrap 可幂等执行。
- health/ready 可用。
- production env validation 完整。
- 域名绑定可用。
- CI 全绿。

### 8.2 发布镜像

步骤：

1. 合并源码仓 main。
2. 等 CI 成功。
3. 等 ACR build/push 成功。
4. 记录 immutable tag 和 digest。

### 8.3 创建 delivery 仓

步骤：

1. 新建公开仓。
2. 写 manifest、compose、Caddyfile、scripts、docs。
3. 本地静态校验。
4. secret scan。
5. push main。

### 8.4 配置 Stack 商品

步骤：

1. 编写 `app-products/<app-code>/product.json`。
2. 确认 JSON 内不包含 secret 值。
3. 在目标 Stack 环境设置必要 secret 环境变量。
4. 执行 `npm run app:import -- app-products/<app-code>/product.json`。
5. 校验 public catalog。
6. 校验 delivery settings overview。
7. 校验后台 App 编辑页可继续维护该商品。

### 8.5 E2E 验收

需要一台空白目标服务器和一个测试域名。

验收步骤：

1. 用户购买测试 offer。
2. Stack 发放 entitlement。
3. 创建 deployment。
4. 生成 deploy token。
5. 在目标服务器执行 remote install 命令。
6. 检查目标服务健康。
7. 登录应用后台。
8. Stack deployment record 显示运行状态和 runtime asset。
9. 触发一次 runtime image update action。
10. 验证备份、迁移、重启、状态上报和回滚路径。

## 9. 发布前检查清单

### 源码仓

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build:all`
- [ ] 空库 migration 验证
- [ ] bootstrap 首次执行验证
- [ ] bootstrap 二次执行验证
- [ ] production env validation 验证
- [ ] domain binding 验证
- [ ] Docker image build 验证

### Delivery 仓

- [ ] `bash -n scripts/*.sh`
- [ ] `node -e "JSON.parse(fs.readFileSync('fd-delivery.manifest.json'))"`
- [ ] `docker compose --env-file .env.example config`
- [ ] 所有脚本有执行位
- [ ] `.env` 不存在
- [ ] secret scan 无真实密钥
- [ ] public raw manifest 可访问
- [ ] remote install script URL 可访问

### Stack 配置

- [ ] App code 稳定
- [ ] App status active
- [ ] deliveryMode one_click
- [ ] deliveryManifest 已写入
- [ ] plan deploymentPolicy 已配置
- [ ] offer 已配置
- [ ] runtime image preset 使用 immutable tag 或 digest
- [ ] ACR_USERNAME 已配置
- [ ] ACR_PASSWORD configured
- [ ] public catalog API 返回正确
- [ ] deployment settings overview configured

### E2E

- [ ] 测试购买成功
- [ ] entitlement 发放成功
- [ ] deploy token 生成成功
- [ ] 目标服务器安装成功
- [ ] HTTPS 域名可访问
- [ ] 初始管理员登录成功
- [ ] Stack deployment 状态上报成功
- [ ] runtime asset update 成功

## 10. 小程序和 Add-on 标准

不要默认把小程序与 Web 主商品绑定在同一个 deployment entitlement 中。

建议规则：

- Web 系统：创建 server deployment entitlement。
- 小程序：创建独立 App 或 add-on offer。
- 小程序权益可以关联到 Web deployment，但不自动创建第二个服务器部署。
- 小程序配置字段应独立管理：
  - AppId
  - AppSecret
  - env version
  - upload/audit/release 状态
  - 支付主体配置

适合单独售卖的小程序场景：

- 客户已有 Web 系统，只需要小程序。
- 小程序审核周期和 Web 上线周期不同。
- 不同客户主体需要不同小程序账号。
- 小程序包含额外开发、审核、发布或运营服务。

## 11. 常见风险

### 11.1 把源码放进公开仓

风险：

- 泄漏业务实现。
- 泄漏私有依赖结构。
- 客户误以为可以自行构建。

标准做法：

- 公开仓只放 delivery。
- 镜像由私有源码仓 CI 发布。

### 11.2 把 ACR 密码写进 `.env`

风险：

- 客户可见。
- 备份泄漏。
- support 时被复制传播。

标准做法：

- 仅安装时通过环境变量传入。
- `docker login --password-stdin`。
- 退出前 unset。

### 11.3 使用 `latest`

风险：

- 无法精确回滚。
- 不知道客户实际运行版本。
- runtime asset 状态不可审计。

标准做法：

- Stack preset 使用 git SHA tag 或 digest。
- `latest` 只作为人工排查或默认展示，不作为正式上架配置。

### 11.4 没有 bootstrap 幂等

风险：

- 安装失败后重试产生重复管理员、重复机构或半初始化数据。

标准做法：

- bootstrap 事务化。
- 明确 already initialized 条件。
- 半初始化拒绝继续。

### 11.5 服务器不能访问 GitHub raw

风险：

- manifest sync 或 remote install 失败。

标准做法：

- Stack 后台支持将 manifest 内容写入 `apps.meta.deliveryManifest`。
- remote install 脚本必要时提供镜像源或代理方案。
- 上架时验证目标服务器能访问 `raw.githubusercontent.com`。

## 12. 后续平台改进建议

为了让后续上架更标准化，建议继续建设：

- Admin UI 中的“一键同步 manifest + 配置 preset + 检查 secret”向导。
- App 上架状态检查页。
- Runtime image digest 自动读取和写入。
- ACR 只读账号集中管理。
- E2E 部署测试环境池。
- Add-on / bundled offer 建模。
- 小程序独立交付模型。
- delivery manifest schema 自动校验命令。
