# Stack 与应用的解耦审计

核对日期：2026-10-11；本次在审计基础上清理运行兼容分支，并增加迁移及免部署购买回归。生产发布结果以部署记录为准。

## 结论

Stack 核心运行流程已从 Retail/Edu 的应用名称和服务拓扑中解耦，采用 App Code + Manifest + hostingProfile + 节点 Adapter v2。新增符合现有协议的应用应通过交付产物、商品配置和节点适配接入，不应向 Stack 核心增加 `if appCode == retail/edu` 分支。

不能称为“完全零适配、任意软件都能接入”：托管执行仍有固定技术约定、受控升级能力限制和首次节点适配安装步骤。当前是“通用平台协议 + 应用适配包”，不是“只填镜像就自动识别所有依赖”的平台。Docker/Compose 是明确支持的交付技术约定，应用应提供相应镜像、安装脚本及托管适配包。

## 审计证据

| 范围               | 发现                                                                                   | 判断                                                     |
| ------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| src、packages      | 名称扫描仅发现微信支付实现注释提到 Retail/Edu；未发现按二者应用名称执行的业务分支      | 核心协议与业务模块不以样本应用为条件                     |
| 配置表单           | 依据 Manifest 的字段、分组、域名及资源生成交互                                         | 应用参数由声明驱动                                       |
| 调度               | hosting.allocate 通过 supportedApps 与资源状态选节点                                   | 未识别应用不默认视为 Retail                              |
| 托管执行器         | 根据 appCode 解析 adapters，服务/卷/初始化/入口来自描述；校验 APP_CODE、摘要和实例归属 | 差异归入应用适配层                                       |
| 备份/恢复/退出     | 使用描述中的备份脚本、服务清单、卷和文件                                               | 不固定 Retail 的数据库或服务名                           |
| 异构测试           | static_sample 是无数据库、无 Worker 的 nginx 应用；CI 执行真实 Docker 安装/备份/恢复   | 解耦有超出 Retail/Edu 的执行证据                         |
| 仓库商品与验收脚本 | app-products、prepare-retail-product、verify-retail/managed-retail 等仍包含具体应用    | 样本配置及专项验收不是核心运行耦合；脚本本身仍是应用专用 |
| 迁移工具           | upgrade-hosting-adapters-v2 删除 retailBundle 等旧键，使用显式迁移映射                 | 历史迁移兼容，不是正常执行回退                           |

名称搜索是静态审计的一部分，不能单独证明全部解耦。依据还包括调用路径、适配器解析、异构 Docker 测试及业务回归。最新运行基线的 [CI 38123233937](https://github.com/LingcooTech/lingcoo-core-stack/actions/runs/38123233937) 已成功；本次文档核对不重新声称完成所有应用的生产验收。

### 历史应用专用结构清理

- 部署状态接口移除 `runtimeImages`、`wordpressAssets`；旧字段会被拒绝，新安装器使用 `runtimeAssets.current/available`，键对应 Manifest asset key。
- 移除 WordPress 更新动作、通知、门户按钮以及 frontend/websocket 的特定资源差异逻辑。通用 Docker 镜像动作 `apply_runtime_images` / `ignore_runtime_images` 保持兼容。
- 删除默认 WordPress 仓库、安装脚本和安装目录；创建部署必须有应用自己的安装 URL 与绝对安装目录。
- 交付设置只读写 `app_delivery_settings` 的 `values/secrets/installer`，不再运行时回退旧系统设置或应用 meta 中的扁平默认配置。
- 数据升级在迁移锁内执行；旧设置、资源状态转为通用结构，原始数据保留加密审计备份。旧 WordPress 待执行动作被撤销。事务失败会中止升级。
- 历史 SQL、一次性迁移映射保留用于升级；内容导入的 WordPress 功能属于独立业务，不是部署特例。节点资源报告的 `runtimeImages` 是通用容器清单，也不是退休的部署状态结构。

### 免部署扩展的两个购买入口

`lingcoo-workflow-ai-web-translator` 使用公开 App Code `ai_translate_workflow`：

1. 从 Chrome 应用商店安装后，在扩展登录 Stack 用户，调用 `POST /v1/checkout/sessions` 发起 Stack 支付；支付确认后发放权益。
2. 在 Stack 应用页面使用同一账号购买；扩展登录同一账号，通过 `GET /v1/entitlements/me` 获取相同权益。

这是两个销售入口共用 Stack 结算，不是 Chrome 应用商店代收款。平台账号不同不会自动合并授权。免部署商品使用 `deliveryMode=none`，无需 Manifest、Deploy Token 或服务器。

扩展是公开客户端，只使用用户 Bearer Token，不内置 App Secret 或支付密钥。按 App Code 和 feature code 筛选功能。授权缓存最长五分钟；付款后强制刷新，网站购买后重新打开扩展账号页会强制同步授权，普通功能查询保留缓存。扩展 API 和 host permission 已从旧域名修正到 `https://stack.lingcoo.com`，版本提升为 2.6.1；已安装旧版本仍需更新扩展。

Retail/Edu 当前 `delivery/stack-delivery.py` 均已使用 `runtimeAssets`，不依赖删除的旧上报结构。

回归覆盖两种认证入口下单、支付通知发放、授权一致性、其他账号隔离、无需创建部署实例及扩展缓存刷新。支付提供商使用测试替身，不替代真实付款验收，也不代表新版扩展已经发布到 Chrome 应用商店。

2026-10-11 生产公开接口核对：支付宝 configured=true、微信支付 configured=false；扩展商品中 `translator_pay_test_fen`（0.01 元测试报价）仍启用。本次不修改商品定价或支付配置，正式销售前需要运营确认测试报价是否保留。

## 仍需明确的限制

1. 固定 APP_IMAGE、ACR_USERNAME/ACR_PASSWORD、docker-compose.prod.yml、Python 钩子以及 Docker/Compose 节点环境。
2. Manifest v1 与托管 Adapter v2 是两个层次；后台同步清单不会自动安装节点适配包。
3. 多 registry 凭据、匿名拉取、多个独立应用镜像的原子更新，不是仅靠字段声明就完整支持。
4. 当前托管创建只有一个主域名槽位；平台公网健康路径已可配置，不再要求 Retail 的路径。
5. 受控更新限定兼容范围内的主镜像更新，不自动进行任意 schema 迁移。
6. 同步兼容解析、离线产品校验、后台发布检查存在覆盖差异；免部署与已上架应用后续修改的强制发布门禁尚未完全统一。
7. 免部署不是通用外部 SaaS/数字资源自动履约引擎，需要明确具体交付集成或人工服务。
8. 对外部适配代码的信任目前由管理员审核与摘要登记建立，没有开放开发者上传即执行的机制，也没有通用发布方签名认证闭环。

以上有些是有意限定的协议，有些是后续增强项；不能全部归为“仍写死 Retail”。

## 文档调整与后续原则

- [接入标准](stack-app-delivery-onboarding-standard.md) 为当前统一入口，区分运营要求与代码已强制校验的条件。
- [托管适配器协议](stack-hosting-adapter-contract.md) 明确文件、字段、钩子、登记和执行边界。
- 早期责任规划与第二应用实施记录标为历史资料；移除“旧节点默认兼容 Retail”“公网必须 /health/ready”等与现状不符的描述。
- 新需求若属于应用服务名、初始化、数据位置等差异，放入应用适配包；只有跨应用的新能力才演进通用协议，并增加异构样本验收。
- 后续优先统一发布校验、版本化接入验收，再按真实需求扩展凭据与多镜像能力，不先宣称未实现能力。

## 本次验证记录

- Stack 运行提交：`b1759e83f6411d26cf188730d61c6da4bcbb2d4e`（主体修改 `fe2a08a`）。
- [CI 38127640887](https://github.com/LingcooTech/lingcoo-core-stack/actions/runs/38127640887)：108 项后端单元、131 项数据库集成、72 项浏览器组件、13 项 E2E，全部通过；生产及完整依赖审计均 0 漏洞。
- 扩展提交：`5fcce27`（含 `324aaff` 域名修复），版本 2.6.1；2 项客户端契约测试通过，账号页脚本语法检查通过。
- 生产迁移前只读统计：旧系统设置 0、带旧默认配置的应用 1、带旧资源状态的部署 2；无实际付款或生产订单创建。
- 新版扩展 ZIP 已生成并检查文件完整性，尚未发布 Chrome 应用商店。
- [Deploy 38128414686](https://github.com/LingcooTech/lingcoo-core-stack/actions/runs/38128414686) 成功；生产 `/ready` 返回 `ready`，版本为上述 `b1759e8` 完整 SHA。
- 生产迁移后只读统计：旧系统设置 0、旧应用默认配置 0、旧部署资源状态 0；迁移标记 1，加密审计备份 3。未解密或输出生产密钥。
- 本机用于本轮回归的隔离 PostgreSQL / Redis 已停止；扩展仓库原有未跟踪 `.DS_Store` 未改动。
