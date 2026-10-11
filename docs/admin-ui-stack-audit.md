# 后台与 Web UI 技术栈盘点

盘点时间：2026-10-10 至 2026-10-11。依据仓库源码、实际运行依赖图和锁文件，不依据安装依赖列表判断某个页面是否迁移。

## 后台迁移状态

后台共 22 条页面路由、17 个业务模块，包括后台登录；应用和内容的新建/编辑分别统计路由。三个历史入口仅重定向。静态运行图覆盖 63 个 TSX 文件，基础交互使用 Ant Design 6.6.2：

| 范围                               | 实现                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| 登录、导航、账户、搜索、主题       | Ant Design Form、Layout、Menu、Dropdown、Modal、Avatar             |
| 仪表盘、应用、内容、文档、文件存储 | Card、Statistic、Table、Tabs、Tree、Form、Upload/文件选择          |
| 订单、授权、用户、安装、通知、工单 | Table、Form、Modal、统一 ManagementDrawer、Card、Typography        |
| 托管资源、部署、日志与告警         | Table、Card、Descriptions、Tabs、Collapse、Modal、ManagementDrawer |
| 系统设置、支付和应用密钥           | Ant Design Form 与现有 Zod 业务契约                                |

后台页面运行依赖图不包含 `components/ui`、Radix、Sonner、React Hook Form、Hook Form Resolver 或 TanStack Table。根入口也不再提前加载任一侧的 UI 库；门户 Tooltip 和 Sonner Provider 移到门户路由，门户 Shell 按需加载。

保留的原生控件是两个素材文件选择器和一个微信证书文件选择器，均为浏览器 `input[type=file]` 能力。业务详情中的 JSON 展开、订单购买明细和托管履约分别提供后台 Ant Design 展示，门户保留自己的展示，共享接口契约与查询逻辑。

这不意味着页面仅能使用 Ant Design 标签：React 容器、文本、图片、布局 CSS、Tailwind 间距工具类仍合理存在。Markdown 编辑器、Markdown 渲染和 Shiki 高亮属于专用内容能力，未重写成 Ant Design。静态盘点不能替代弹层、移动端及真实数据的浏览器验收。

## 本轮内容与弹层规范

2026-10-11 上午反馈补充：待办按紧凑分组放置事项、数量与 Ant Design 操作按钮；文档的新建空间位于空间卡片标题；托管新增服务器位于服务器筛选工具栏，刷新位于分类导航；设置搜索与设置分类同一层级，窄屏自动换行。通知以统计、筛选和记录为主，发布表单改为统一抽屉，并保留发布确认与关闭草稿提示。云存储去除说明文案，设置和素材入口均使用按钮，从素材库或图片选择器进入设置后支持返回原后台页面并执行未保存修改检查。

修复带筛选 URL 导致的循环渲染：共享 `useTableState` 按内容稳定化 `knownFilters`，避免调用方内联数组导致已选状态 Effect 不断触发。验收增加仪表盘待支付入口点击、刷新、筛选清除，以及存储设置的未保存返回与保存后返回；静态路由可达性检查无法替代这些操作链路。

- 所有主页面统一使用最大 1440px 的内容区；设置、编辑和支付页不再单独限制为 1040px，宽屏下与顶栏标题、列表保持一致边界。
- 页面纵向区块统一 16px 间距。筛选工具栏使用 Card，纯页面操作不套空白 Card；返回按钮带左箭头并位于左侧，预览等操作靠右。
- 统计使用 Card + Statistic，统一字号、内边距、可选图标与补充说明；应用页不再裸露排放 Statistic。仪表盘待办改为事项、数量与入口的结构，去掉用户邮箱验证抽样和无关内容入口。
- 发布检查在紧凑卡片标题中显示状态标签，Collapse 展开检查明细和必要说明；保留已保存配置与在线验收的边界说明。
- 订单、用户、工单详情使用 Card 和 Typography 分区，长值换行，数据表在自身区域横向滚动。
- Modal 在后台 Provider 中统一居中、限制内容高度并允许正文滚动；移动端不超出视口，页脚操作可换行。确认弹窗继续保留原有权限、确认条件和提交逻辑。
- ManagementDrawer 维持与 Edu 相同的 560/840/1080px 尺寸，最大宽度为视口宽度，正文独立滚动，页脚统一内边距与操作排列。

## Web 门户技术栈

后台与门户在同一个 React/Vite 工程中，以路由及依赖图分开；不是两个独立构建项目。以下版本来自当前 `package-lock.json`：

| 层面           | 当前实现                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| 框架与构建     | React 19.3.0、TypeScript 5.9.3、Vite 6.4.3                                       |
| 路由与远程状态 | React Router 7.18.4、TanStack Query 5.104.0                                      |
| 门户样式和组件 | Tailwind CSS 4.3.3、Radix primitives、仓库 `components/ui` 本地封装、Lucide 图标 |
| 门户表单与校验 | React Hook Form 7.89.0、Resolver 5.2.2、Zod 4.3.6                                |
| 门户表格与通知 | TanStack Table 8.21.3、Sonner 2.0.8                                              |
| 内容能力       | React Markdown、Remark GFM、Shiki；后台 Markdown 编辑器按需加载                  |

门户、客户账户中心、购买与部署向导、公共文档站继续使用原技术栈，没有在本轮切换为 Ant Design。后台使用 Ant Design Form、Table 和通知组件，继续共用 Zod 契约、API client、权限和查询层。仓库保留 Radix 等依赖是门户仍在使用，不代表后台迁移漏做。

## 可重复盘点与验收

运行 `npm run check:admin-boundaries`；导出完整路由/组件/依赖清单：

本轮完整的逐路由依赖、运行组件和原生控件清单已保存为 [机器盘点记录](admin-ui-stack-inventory.json)。

```sh
node scripts/admin-ui-inventory.mjs --check --output=/tmp/stack-ui-inventory.json
```

检查会阻止后台重新引入旧 UI 库或原生业务输入控件，允许上述文件选择器；同时阻止门户引入后台 Ant Design，以及根入口提前加载任何一侧 UI 库。`uiAudit.customSurface` 额外标出手写业务面板供审阅，避免只检查 import 就声称视觉统一。

浏览器验收覆盖全后台路由、四种内容宽度、返回操作、统计卡片、桌面/移动端订单抽屉及用户编辑弹窗，并复查门户、账户和公共文档入口。运行与发布结果补充在 [迁移验收记录](admin-ant-design-migration-progress.md)。
