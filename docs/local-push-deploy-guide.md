# 本机提交、Push 与部署说明

适用目录：`/Users/admin/Desktop/fd-core-stack`

当前项目的生产发布链路是：

`本机提交 -> push 到 GitHub main -> GitHub Actions CI -> 构建镜像 -> 推送镜像仓库 -> SSH 到服务器部署`

服务器不会本地构建镜像，所以你在本机真正需要做的核心动作只有：检查改动、提交、push、观察工作流结果。

## 1. 进入项目目录

```bash
cd /Users/admin/Desktop/fd-core-stack
```

## 2. 查看当前改动

```bash
git status --short --branch
git diff
```

如果只想看某几个文件：

```bash
git diff -- src/modules/app/service.ts admin-ui/src/pages/AppsPage.tsx
```

## 3. 本地校验

常规发布前至少执行：

```bash
npm run build:all
```

如果你只想先做轻量检查：

```bash
npm run typecheck
npm run build
```

## 4. 暂存并提交

只提交这次要发布的文件，不要直接无脑 `git add .`。

示例：

```bash
git add \
  admin-ui/src/api/apps.ts \
  admin-ui/src/api/types.ts \
  admin-ui/src/pages/AppsPage.tsx \
  src/modules/app/schemas.ts \
  src/modules/app/service.ts \
  src/modules/license/repository.ts \
  docs/local-push-deploy-guide.md

git commit -m "feat(apps): manage checkout plans from admin"
```

提交前如果想再确认一次：

```bash
git status --short
```

## 5. Push 到远端

```bash
git push origin main
```

只要 push 到 `main`，就会自动触发：

1. `CI`
2. `Deploy`

## 6. 查看 GitHub Actions

本机已安装 `gh` 的话，可以直接看：

```bash
gh run list --repo FutureDecade/fd-core-stack --limit 10
```

查看某次 run 的实时状态：

```bash
gh run watch <RUN_ID> --repo FutureDecade/fd-core-stack --exit-status
```

例如先找最新 run：

```bash
gh run list --repo FutureDecade/fd-core-stack --limit 10
```

然后把其中的 `Deploy` run id 带进 `gh run watch`。

## 7. 判断是否部署成功

部署成功的标准是：

1. `CI` 成功
2. `Deploy` 成功
3. `Deploy` job 里的 `Deploy to server` 步骤成功

如果 `Deploy` 成功，说明服务器已经执行了：

1. `git pull --ff-only origin main`
2. 登录镜像仓库
3. 拉取对应 SHA 镜像
4. 执行数据库迁移
5. 重启 `api/worker/caddy`
6. 做健康检查

## 8. 常用排查

如果 push 后没触发部署，先检查：

```bash
gh run list --repo FutureDecade/fd-core-stack --limit 20
```

重点看：

1. `CI` 是否失败
2. 是否 push 到了 `main`
3. `Deploy` 是否因为上游 `CI` 失败而没跑

如果需要看某次 run 详情：

```bash
gh run view <RUN_ID> --repo FutureDecade/fd-core-stack --log
```

## 9. 回滚思路

回滚不是在本机 `git revert` 才能做，最直接的是重新部署上一个成功的镜像标签。

完整回滚说明见：

- [DEPLOYMENT.md](/Users/admin/Desktop/fd-core-stack/DEPLOYMENT.md)

## 10. 关于 Chrome 扩展目录

`/Users/admin/Desktop/ai-web-translator` 当前不是 git 仓库，所以：

1. 不能像 `fd-core-stack` 一样直接 `git commit` / `git push`
2. 本地修改后，需要你在 Chrome 扩展管理页手动重新加载
3. 如果后续要纳入版本管理，先把它初始化为独立 git 仓库或确认它原本的远端仓库位置
