# Stack 管理后台 UI 架构

管理后台采用 Ant Design 6，页面结构参照 Edu：统一导航与标题、列表工具栏、配置表单、详情抽屉和状态反馈。实施范围与验收记录见 [迁移方案](admin-ant-design-migration-plan.md) 和 [迁移进度](admin-ant-design-migration-progress.md)。

## 运行边界

后台登录和 `AdminShell` 位于路由懒加载边界内。`AdminUiProvider` 提供中文语言、品牌主色、明暗主题、Ant Design App 消息上下文及 CSS layer；主题选择继续使用平台的 light、dark、system 设置。

客户门户、账户中心和文档站仍使用原有界面。共享 API、契约、格式函数及业务 Hook 可以复用，后台与门户分别组织视觉组件。例如托管期限、退出和交接复用请求逻辑，但使用独立后台面板。不能全局替换 `components/ui` 来修改后台。

`npm run check:admin-boundaries` 检查 22 条后台页面路由和 Shell 的传递依赖，包括动态导入；后台不能引入旧 `components/ui`、Radix、Sonner、React Hook Form 或 TanStack Table。检查同时覆盖公共入口与门户页面，禁止其导入 Ant Design。此检查已纳入 `npm run check` 和 CI。

全站入口仍承载门户所需的 TooltipProvider 和 Toaster；后台页面消息使用 Ant Design 上下文实例。依赖保留情况须以实际调用方判断，不能因后台迁移而删除门户所需包。

## 页面与组件

导航、分组、路由、标题和权限来自 `lib/foundation.ts` 与 `lib/rbac.ts`。业务页面按自身权限发起查询；抽屉内的托管服务、退出和升级数据按打开状态加载。

| 组件                              | 职责                                           |
| --------------------------------- | ---------------------------------------------- |
| AdminShell                        | 权限导航、侧栏、顶栏、移动导航、账户和命令搜索 |
| PageContainer / PageToolbar       | 页面宽度、顶栏标题、筛选与页面动作             |
| ManagementDrawer                  | 三档尺寸、正文滚动、详情与编辑容器             |
| FormActions                       | 提交区、保存状态与辅助操作                     |
| AsyncState / PageHelp / StatusTag | 加载、错误重试、空态、说明与语义状态           |
| AdminDraftGuard                   | 草稿离开确认和刷新保护                         |

Button、Input、Select、Table、Form、Modal 等基础控件直接使用 Ant Design。共享封装只处理页面结构和重复业务，不模拟原 UI 库的 API。

列表优先显示资源、状态、时间和操作；搜索筛选在左、动作在右。已有服务端分页的页面保持原分页契约；仅返回有限集合的接口明确说明范围。原始日志、容器清单和次要操作进入详情。复杂编辑使用独立页面，中等编辑使用 Drawer，简单确认使用 Modal。

## 表单与提交

Ant Design Form 是字段的唯一状态来源。`useSettingsForm` 只额外记录基线和脏状态，保护查询刷新时的未保存输入；不建立第二份字段副本。复杂应用编辑用一个 Form 管理基本资料、动态功能、套餐、Offer、交付预设和来源。

Zod 与 contracts 保留业务校验、数值转换及 API 契约。`parseSettingsForm` 将 Zod 字段路径映射至实际表单；复杂应用提交先校验，再用 `getFieldsValue(true)` 取得完整草稿，保留尚未挂载标签中的 ID、关联与默认值。Form.List 处理动态条目，Code 变更同步引用，金额仍在原业务构造函数中转换为分。

保存失败保留输入；成功后更新基线。敏感字段留空保留原值，成功保存后清空输入；清除密钥独立确认并等待服务端结果。素材编辑保留版本冲突和引用限制。Manifest 同步只更新交付与来源基线，其他草稿继续保留。Markdown 编辑器在打开详情标签时加载。

服务器默认暂停分配；危险操作确认明确对象。退款、托管操作及套餐创建失败重试保留请求标识。保留期、退出、恢复、升级等规则继续由原服务端校验，UI 不替代权限或业务约束。

## 样式与维护

后台自有样式集中在 `styles/admin.css`，使用 `stack-admin` 与 `admin-*` 命名空间，CSS layer 与现有 Tailwind 共存。配置字段顺序保持已经对齐的 Edu SMTP、S3、微信支付设置；修改外观时不能改变配置优先级、密钥和清除语义。

默认内容宽度上限 1440px，表单使用较窄宽度；小屏筛选和操作可换行，表格在自身区域滚动，Drawer 限制为可用视口。主题弹窗使用 `App.useApp()` 或有上下文的 Modal 实例，避免静态调用丢失主题。

新增页面应使用上述模板，明确查询范围、权限、加载与错误状态，以及保存失败、脏草稿和危险操作行为。测试按实际交互断言业务结果，写入验收放在隔离数据库中。后台 UI 发布只更新 Stack 控制端；应用接入、支付、授权、部署接口和客户应用运行实例继续沿用现有服务。
