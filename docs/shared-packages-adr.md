# 共享协议包与构建决策

后端继续使用 CommonJS，Admin 使用 Vite/ESM。npm workspaces 保留根后端和 `admin-ui` 路径，以根 lockfile 作为唯一冻结安装依据。contracts 与 api-client 同时输出 `dist/cjs` 和 `dist/esm`，由 package exports 选择消费入口；ESM 子目录明确声明 type。先构建共享包，再检查和构建后端及 Admin。

共享请求 Schema 保留原名称，通过模块兼容出口引用；响应协议保留旧 error 字符串和现有业务字段。API Client 校验关键响应，区分 HTTP、协议、网络和取消错误，错误携带 requestId。contracts 不读取环境、连接数据库或依赖 UI；api-client 不依赖 React 或路由。

Admin 和后端固定使用已有后端锁定版本 Zod 4.3.6，表单 resolver 使用 5.2.2，安装前已核对 React Hook Form 的兼容要求。迁移依据：[Zod 4 迁移指南](https://zod.dev/v4/changelog)、[Resolver 发行记录](https://github.com/react-hook-form/resolvers/releases)。前端编译与关键表单浏览器验证检查类型和交互兼容。

运行镜像只需要根 production dependencies 以及 contracts 的 manifest 与 dist；api-client 已进入 Admin 静态产物。不能仅复制根 node_modules 内的 workspace 符号链接。镜像检查验证 CommonJS 的真实 require 和浏览器构建产物。
