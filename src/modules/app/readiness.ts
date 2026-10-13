import { freeAcquisitionPlan } from '../../lib/free-acquisition';
import { deliveryManifestSchema, hostingProfileSchema } from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import type { AppDependencies } from './dependencies';
import { AppRepository } from './repository';
import { httpError } from '../../lib/errors';
import { queryBatch } from '../../db/query-batch';
import { AppLifecycleRepository } from './lifecycle-repository';
import { applicationReleaseSchema } from '@lingcoo/contracts';
import { compileComposePlan } from './compose-plan';
export class AppReadiness {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv | undefined,
    private readonly capabilities: Pick<
      AppDependencies,
      'createLicenseAccess' | 'createDeliverySettings' | 'now'
    >,
  ) {}
  async inspect(appCode: string) {
    const repo = new AppRepository(this.db),
      app = await repo.findAppByCode(appCode);
    if (!app) throw httpError(404, '应用不存在');
    const license = this.capabilities.createLicenseAccess(this.db);
    const [plans, features, mappings, offers] = await queryBatch(this.db, [
      () => license.listPlansByAppId(app.id),
      () => license.listFeaturesByAppId(app.id),
      () => license.listPlanFeatureMappings(),
      () => repo.listOffersByAppId(app.id),
    ]);
    const meta = (app.meta ?? {}) as Record<string, unknown>;
    const checks: {
      code: string;
      title: string;
      status: 'passed' | 'blocked' | 'unverified';
      detail: string;
      blocking: boolean;
    }[] = [];
    const check = (code: string, title: string, ok: boolean, detail: string) =>
      checks.push({ code, title, status: ok ? 'passed' : 'blocked', detail, blocking: true });
    const activeOffers = offers.filter((o) => o.status === 'active');
    if (meta.acquisition === 'free') {
      check(
        'free_acquisition',
        '免费领取权益',
        !!freeAcquisitionPlan(plans, features, mappings) && activeOffers.length === 0,
        '免费应用需唯一有效的零价永久套餐及权益映射，不发布软件付费报价；托管单独计费。',
      );
    } else {
      check(
        'offers',
        '有效售价',
        activeOffers.length > 0 &&
          activeOffers.every((o) => o.priceAmount > 0 && o.currency === 'CNY'),
        '需要至少一个启用的正式人民币报价；零价或验收价格请保留草稿。',
      );
      const activePlans = plans.filter((p) => activeOffers.some((o) => o.planId === p.id));
      check(
        'plans',
        '套餐与权益映射',
        activePlans.length > 0 &&
          activeOffers.every((o) => {
            const plan = plans.find((p) => p.id === o.planId);
            const linked = plan ? mappings.filter((m) => m.planId === plan.id) : [];
            return (
              !!plan &&
              plan.status === 'active' &&
              plan.currency === o.currency &&
              !(plan.meta as Record<string, unknown>)?.acceptanceOnlyPrice &&
              linked.length > 0 &&
              linked.every((m) =>
                features.some((f) => f.id === m.featureId && f.status === 'active'),
              )
            );
          }),
        '每个报价需关联有效套餐及有效权益；验收用途套餐不能作为正式售价。',
      );
    }
    const project = await new AppLifecycleRepository(this.db).project(appCode);
    const standard = meta.deliveryProtocol === 'compose_v2' && !!project?.definition;
    if (standard) {
      const row =
        typeof meta.deliveryReleaseId === 'string'
          ? await new AppLifecycleRepository(this.db).release(app.id, meta.deliveryReleaseId)
          : undefined;
      const valid = !!row && row.appId === app.id && row.status === 'published';
      check(
        'delivery_version',
        '已发布交付版本',
        valid,
        '选择属于当前商品、已完成验证并发布的交付版本。',
      );
      if (valid && this.env) {
        const release = applicationReleaseSchema.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          publishedAt: row.publishedAt?.toISOString() ?? null,
        });
        if (release.definition.delivery.kind === 'compose') {
          const plan = compileComposePlan(release, {
            instanceId: release.id,
            mode: release.definition.delivery.modes[0]!,
          });
          const settings = await this.capabilities
            .createDeliverySettings(this.db, this.env)
            .getOverview(appCode);
          check(
            'presets',
            '平台必填配置',
            plan.fields.env
              .filter((f) => f.scope === 'preset' && f.required)
              .every((f) => {
                const value = settings.values[f.key] ?? f.defaultValue;
                return value !== undefined && value !== '' && !String(value).startsWith('PENDING_');
              }),
            '填写版本声明中必填的平台预设。',
          );
          const generated = new Set(plan.fields.generatedSecrets?.map((f) => f.key) ?? []);
          check(
            'secrets',
            '交付凭据已配置',
            plan.fields.secrets
              .filter((f) => f.scope === 'preset' && f.required && !generated.has(f.key))
              .every((f) => settings.secrets[f.key]?.configured),
            '只检查凭据是否已配置；运行验证由版本发布门禁负责。',
          );
        }
      }
    }
    if (meta.deliveryMode === 'one_click' && !standard) {
      const parsed = deliveryManifestSchema.safeParse(meta.deliveryManifest);
      check(
        'manifest',
        '标准交付清单',
        parsed.success,
        '使用受支持的 Manifest 版本，密钥字段不能带默认值。',
      );
      if (parsed.success) {
        const manifest = parsed.data;
        check(
          'installer_integrity',
          '安装脚本完整性',
          /^[a-f0-9]{64}$/.test(manifest.installer.remoteInstallScriptSha256 ?? ''),
          '交付声明必须提供安装脚本的 SHA-256；执行前下载并验证，缺少摘要时不能发放安装命令。',
        );
        const installer = new URL(manifest.installer.remoteInstallScriptUrl);
        check(
          'installer',
          '安装入口',
          installer.protocol === 'https:' &&
            !installer.username &&
            !installer.password &&
            !/pending|\.invalid/i.test(installer.href),
          '安装脚本需使用有效 HTTPS 发布地址；此检查不会下载或执行脚本。',
        );
        if (!this.env) throw httpError(503, '交付配置检查未初始化');
        const settings = await this.capabilities
          .createDeliverySettings(this.db, this.env)
          .getOverview(appCode);
        const allKeys = [...manifest.envFields, ...manifest.secretFields].map((f) => f.key);
        check(
          'field_keys',
          '参数定义',
          new Set(allKeys).size === allKeys.length,
          '配置与密钥的环境变量名称不能重复。',
        );
        const presets = manifest.envFields.filter((f) => f.scope === 'preset' && f.required);
        check(
          'presets',
          '平台必填配置',
          presets.every((f) => {
            const value = settings.values[f.key] ?? f.defaultValue;
            return value !== undefined && value !== '' && !String(value).startsWith('PENDING_');
          }),
          '所有平台必填配置必须填写；不会在报告中返回配置值。',
        );
        const requiredSecrets = new Set([
          ...manifest.secretFields
            .filter((f) => f.scope === 'preset' && f.required)
            .map((f) => f.key),
          ...manifest.assets.filter((a) => a.required && a.authSecret).map((a) => a.authSecret!),
        ]);
        check(
          'secrets',
          '交付凭据已配置',
          [...requiredSecrets].every((key) => settings.secrets[key]?.configured),
          '只检查必填凭据是否存在，不代表权限范围和在线拉取已验证。',
        );
        const assets = manifest.assets.filter((a) => a.required);
        check(
          'assets',
          '交付资源声明',
          assets.length > 0 &&
            new Set(manifest.assets.map((a) => a.key)).size === manifest.assets.length,
          '至少声明一项必需交付资源，资源标识不能重复。',
        );
        const images = assets.filter((a) => a.type === 'docker_image');
        check(
          'image_digest',
          '不可变镜像版本',
          images.every((a) => {
            const image =
              a.image ||
              (a.imageEnv
                ? (settings.values[a.imageEnv] ??
                  manifest.envFields.find((f) => f.key === a.imageEnv)?.defaultValue)
                : undefined);
            return (
              typeof image === 'string' && /^[-a-zA-Z0-9./:_]+@sha256:[a-f0-9]{64}$/.test(image)
            );
          }),
          '必需 Docker 镜像应固定到完整 sha256 digest，不能使用浮动标签。',
        );
        check(
          'asset_bindings',
          '资源参数引用',
          assets.every(
            (a) =>
              (!a.imageEnv || manifest.envFields.some((f) => f.key === a.imageEnv)) &&
              (a.visibility !== 'private' || !!a.authSecret) &&
              (!a.authSecret || manifest.secretFields.some((f) => f.key === a.authSecret)),
          ),
          '镜像参数与凭据引用必须能在清单字段中找到。',
        );
      }
      if (meta.hostingProfile !== undefined) {
        const profile = hostingProfileSchema.safeParse(meta.hostingProfile);
        check(
          'hosting_profile',
          '托管资源和运行清单',
          profile.success && !!profile.data.monitoring,
          '支持托管的应用需声明资源预算、运行服务与备份要求。',
        );
      }
      checks.push({
        code: 'registry_live',
        title: '镜像在线拉取与只读权限',
        status: 'unverified',
        blocking: false,
        detail: '需用专用只读凭据在干净环境拉取固定镜像；配置检查不代替在线验收。',
      });
      checks.push({
        code: 'delivery_live',
        title: '真实交付和恢复验证',
        status: 'unverified',
        blocking: false,
        detail: '需记录安装、健康、备份与恢复的版本对应证据。',
      });
    }
    checks.push({
      code: 'commerce_live',
      title: '真实付款退款',
      status: 'unverified',
      blocking: false,
      detail: '模拟支付不代替真实渠道验收；正式售价与资金操作需单独确认。',
    });
    return {
      appCode,
      appStatus: app.status,
      configurationReady: checks.filter((c) => c.blocking).every((c) => c.status === 'passed'),
      scope: 'configuration' as const,
      checks,
      checkedAt: this.capabilities.now().toISOString(),
    };
  }
  async assertConfiguration(appCode: string) {
    const report = await this.inspect(appCode);
    if (!report.configurationReady)
      throw httpError(
        422,
        '发布配置未通过：' +
          report.checks
            .filter((c) => c.blocking && c.status === 'blocked')
            .map((c) => c.title)
            .join('、') +
          '。请先保存草稿并完成交付配置。',
      );
    return report;
  }
}
