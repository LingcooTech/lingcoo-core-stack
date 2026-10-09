# 旧项目清理记录

2026-10-09，按用户明确授权，在 82.157.22.93 清除 ts-app-starter-demo、WordPress 和旧 Retail deploy。118.25.36.15 未执行清理。

删除前逐项验证容器、卷、挂载和网络引用，确认无保留项目使用。删除后保留的 20 个容器运行状态不变，Nginx 配置验证及重载成功。共享基础镜像保留。

```json
{
  "removedContainers": [
    "retail-admin-web",
    "retail-api",
    "retail-caddy",
    "retail-postgres",
    "retail-redis",
    "retail-shop-web",
    "ts-app-starter-demo-api-1",
    "ts-app-starter-demo-caddy-1",
    "ts-app-starter-demo-postgres-1",
    "ts-app-starter-demo-worker-1",
    "wordpress-db-1",
    "wordpress-phpmyadmin-1",
    "wordpress-redis-1",
    "wordpress-wordpress-1"
  ],
  "removedVolumes": [
    "b17d5b707eec5c6bf2b84c85d6070fdff11864b4904066770d3e8e45e61736d1",
    "deploy_retail_caddy_config",
    "deploy_retail_caddy_data",
    "deploy_retail_postgres_data",
    "deploy_retail_redis_data",
    "ts-app-starter-demo_caddy_config",
    "ts-app-starter-demo_caddy_data",
    "ts-app-starter-demo_postgres_data"
  ],
  "removedNetworks": ["deploy_default", "ts-app-starter-demo_default", "wordpress_default"],
  "removedDirectories": [
    "/opt/ts-app-starter-demo",
    "/opt/wordpress",
    "/opt/lingcoo-retail-system",
    "/opt/fd-retail-system"
  ],
  "removedProxyFiles": [
    "frame.lingcoo.com.conf",
    "frame.lingcoo.com.conf.disabled",
    "retail.lingcoo.com.conf",
    "shop.conf.disabled",
    "shop.conf.bak-20260717-1755",
    "wordpress.conf",
    "phpmyadmin.conf"
  ],
  "removedImageTags": [
    "crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/ts-app-starter-npx-demo:7a8d49394a155da5006d9e3b8efdf75f13895157",
    "crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/lingcoo-retail-shop-web:delivery-b0bf30d7ee71edcb30921de939992538a8a9b5ca",
    "crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/lingcoo-retail-admin-web:delivery-b0bf30d7ee71edcb30921de939992538a8a9b5ca",
    "crpi-8y82lbqoc1haiday.cn-beijing.personal.cr.aliyuncs.com/futuredecade/lingcoo-retail-api:delivery-b0bf30d7ee71edcb30921de939992538a8a9b5ca",
    "wordpress:latest",
    "phpmyadmin/phpmyadmin:latest"
  ],
  "preservedContainers": 20
}
```

## 后续清理核验

另确认无任何保留容器引用后，删除 `mariadb:10.11`、`redis:latest` 两个旧项目遗留镜像标签。核验 Nginx 无引用、证书 SAN 只含对应旧域名后，删除 `frame.lingcoo.com`、`retail.lingcoo.com` 的 Certbot 证书及续期配置。未删除共享或当前通配符证书，未修改 DNS 记录。清理后磁盘约 50GB，总使用约 23GB，可用约 27GB。
