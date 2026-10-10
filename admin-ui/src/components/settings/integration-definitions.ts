import type { IntegrationField } from './IntegrationFields';

// Keep the reference application's explicit row-major order, independent of service schema order.
export const STORAGE_FIELDS: readonly IntegrationField[] = [
  {
    key: 'provider',
    label: '存储驱动',
    description: '本地磁盘适合单机部署；S3 兼容 AWS S3、MinIO、R2、七牛 Kodo S3 等服务。',
    control: 'select',
    options: [
      { label: '本地磁盘', value: 'local' },
      { label: 'S3 兼容存储', value: 's3' },
    ],
  },
  {
    key: 'accessKey',
    label: '存储访问密钥标识',
    description: '七牛 Kodo 填写账号 AK，并与 SK 成对配置；使用 AWS 实例角色时可留空。',
    control: 'secret',
  },
  {
    key: 'secretKey',
    label: '存储访问密钥',
    description: '七牛 Kodo 填写账号 SK，并与 AK 成对配置；保存后只显示是否已配置。',
    control: 'secret',
  },
  {
    key: 'bucket',
    label: '存储空间名称',
    description: '填写对象存储 Bucket；七牛 Kodo 填写对应的空间名称，建议保持私有访问。',
  },
  {
    key: 'defaultPrefix',
    label: '默认上传目录',
    description: '素材在 Bucket 中的默认目录，例如 stack/assets；只影响今后上传的文件。',
  },
  {
    key: 'region',
    label: '存储区域',
    description: '填写 S3 服务的区域标识；七牛 Kodo 请填写对应区域 ID，例如 cn-east-1。',
  },
  {
    key: 'endpoint',
    label: '存储服务地址',
    description:
      '七牛 Kodo 请填写对应区域的 S3 Endpoint，例如 https://s3.cn-east-1.qiniucs.com；AWS S3 可留空。',
    control: 'url',
  },
  {
    key: 'forcePathStyle',
    label: '强制路径寻址',
    description:
      '七牛 Kodo S3 通常可关闭并使用虚拟主机寻址；若端点、证书或代理要求路径寻址再开启。',
    control: 'boolean',
  },
];
export const SMTP_FIELDS: readonly IntegrationField[] = [
  {
    key: 'transport',
    label: '投递方式',
    description: '开发环境可使用 Capture；生产发送请选择 SMTP。',
    control: 'select',
    options: [
      { label: '测试捕获（不外发）', value: 'capture' },
      { label: '邮件服务器投递', value: 'smtp' },
    ],
  },
  { key: 'host', label: '邮件服务器地址', description: 'SMTP 服务地址。' },
  {
    key: 'port',
    label: '邮件服务器端口',
    description: '常用端口为 465 或 587。',
    control: 'number',
  },
  {
    key: 'secure',
    label: '直接加密连接',
    description: '465 端口通常启用；587 通常关闭并使用 STARTTLS。',
    control: 'boolean',
  },
  { key: 'user', label: '邮件服务器用户名', description: 'SMTP 登录账号。' },
  {
    key: 'password',
    label: '邮件服务器密码',
    description: '加密保存，接口和管理后台永不回显明文。',
    control: 'secret',
  },
  { key: 'from', label: '发件地址', description: '邮件 From 地址。', control: 'email' },
  { key: 'fromName', label: '发件名称', description: '邮件 From 显示名称。' },
];
