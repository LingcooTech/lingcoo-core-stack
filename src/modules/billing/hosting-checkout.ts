import { createAppAccess } from '../app/public';
import { hostingLicenseAccess } from '../license/public';
import type { HostingTermsFactory } from '../deployment/public';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { HostingOfferCatalog } from './hosting-offers';
import type { HostingOrderTarget } from '@lingcoo/contracts';
export class HostingCheckoutSelection {
  constructor(
    private readonly db: DbExecutor,
    private readonly createHostingTerms: HostingTermsFactory,
    private readonly clock = () => new Date(),
  ) {}
  async resolve(input: {
    userId: string;
    appCode: string;
    planCode: string;
    hosting?: { offerId: string; version: number };
    hostingOnly: { entitlementId: string; deploymentId?: string };
  }) {
    if (!input.hosting) throw httpError(422, '请选择托管套餐');
    const app = await createAppAccess(this.db).findAppByCode(input.appCode);
    const license = hostingLicenseAccess(this.db);
    const entitlement = await license.find(input.hostingOnly.entitlementId);
    if (!app || !entitlement || entitlement.userId !== input.userId || entitlement.appId !== app.id)
      throw httpError(404, '未找到对应软件授权');
    const now = this.clock();
    if (
      entitlement.status !== 'active' ||
      (entitlement.startsAt && entitlement.startsAt > now) ||
      (entitlement.expiresAt && entitlement.expiresAt <= now)
    )
      throw httpError(409, '软件授权当前无效');
    const plan = await license.plan(entitlement.planId);
    if (!plan || plan.code !== input.planCode) throw httpError(409, '软件授权与套餐不匹配');
    const offer = await new HostingOfferCatalog(this.db).resolve(
      input.hosting.offerId,
      app.id,
      input.hosting.version,
    );
    let target: HostingOrderTarget = { kind: 'new', entitlementId: entitlement.id };
    if (input.hostingOnly.deploymentId) {
      const service = await this.createHostingTerms(this.db, this.clock).quoteRenewal(
        input.hostingOnly.deploymentId,
        input.userId,
        entitlement.id,
        offer.interval,
        offer.graceDays,
        offer.retentionDays,
      );
      target = {
        kind: 'renewal',
        entitlementId: entitlement.id,
        deploymentId: input.hostingOnly.deploymentId,
        serviceId: service.id,
      };
    }
    return { app, plan, offer, target };
  }
}
