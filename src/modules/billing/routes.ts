import type { FastifyPluginAsync } from 'fastify';
import type { AppEnv } from '../../lib/env';

function hasWeChatPayConfig(env: AppEnv) {
  return Boolean(
    env.WECHAT_PAY_MCH_ID &&
      env.WECHAT_PAY_CERT_SERIAL_NO &&
      env.WECHAT_PAY_API_V3_KEY &&
      env.WECHAT_PAY_PRIVATE_KEY_PATH
  );
}

function hasAlipayConfig(env: AppEnv) {
  return Boolean(
    env.ALIPAY_APP_ID &&
      env.ALIPAY_PRIVATE_KEY_PATH &&
      env.ALIPAY_PUBLIC_KEY_PATH
  );
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/billing/providers', async () => {
    return {
      wechatPay: {
        enabled: hasWeChatPayConfig(app.appEnv),
        notifyUrl: app.appEnv.WECHAT_PAY_NOTIFY_URL || null
      },
      alipay: {
        enabled: hasAlipayConfig(app.appEnv),
        notifyUrl: app.appEnv.ALIPAY_NOTIFY_URL || null
      }
    };
  });

  app.post('/v1/billing/providers/wechat/notify', async (request) => {
    request.log.info(
      {
        headers: request.headers,
        body: request.body
      },
      'wechat pay notify received'
    );

    return {
      code: 'SUCCESS',
      message: '成功'
    };
  });

  app.post('/v1/billing/providers/alipay/notify', async (request, reply) => {
    request.log.info(
      {
        headers: request.headers,
        body: request.body
      },
      'alipay notify received'
    );

    return reply.type('text/plain').send('success');
  });
};
