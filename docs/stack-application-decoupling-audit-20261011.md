# Stack 与应用的解耦审计

核对日期：2026-10-11；运行代码基线 `c444b6f`，本次仅整理文档，不调整生产配置、不执行客户部署。

## 结论

Stack 核心运行流程已从 Retail/Edu 的应用名称和服务拓扑中解耦，采用 App Code + Manifest + hostingProfile + 节点 Adapter v2。新增符合现有协议的应用应通过交付产物、商品配置和节点适配接入，不应向 Stack 核心增加 `if appCode == retail/edu` 分支。

不能称为“完全零适配、任意软件都能接入”：托管执行仍有固定技术约定、受控升级能力限制和首次节点适配安装步骤。当前是“通用平台协议 + 应用适配包”，不是“只填镜像就自动识别所有依赖”的平台。尤其不能据此声称整个核心已清除全部历史应用专用结构：状态上报、动作和配置兼容仍包含 WordPress 与 frontend/websocket 专用字段。

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

### 历史应用专用结构仍存在

[部署契约](../packages/contracts/src/deployment.ts) 保留 runtimeImages、wordpressAssets；[交付设置](../src/modules/deployment/delivery-settings.ts) 保留 FRONTEND*IMAGE、WEBSOCKET_IMAGE、WORDPRESS*\* 的旧映射；[动作处理](../src/modules/deployment/action-use-cases.ts) 和 [状态处理](../src/modules/deployment/service.ts) 仍处理 WordPress 专用动作及状态。它们不构成 Retail/Edu 的运行依赖，但说明“所有历史应用特例已消失”的说法不成立。

新应用必须使用 Manifest assets 与 runtimeAssets 通用协议。后续清理需要先统计已有数据/客户端依赖，再做兼容迁移和回归，不能仅删除字段。本次只识别和记录，不移除生产兼容接口。

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
- 后续优先统一发布校验、版本化接入验收及历史专用接口迁移，再按真实需求扩展凭据与多镜像能力，不先宣称未实现能力。
