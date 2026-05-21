import {
  ArrowLeft,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const sections = [
  {
    title: '1. 这份政策覆盖什么',
    body: [
      '本页面适用于 Chrome 扩展 AI Translate Workflow，以及该扩展与 FD Stack 账号、订单、授权服务之间发生的数据处理。',
      '最后更新日期：April 16, 2026。',
    ],
  },
  {
    title: '2. 直接发送到 OpenRouter 的数据',
    body: [
      '当你主动发起翻译、校对或模型测试时，扩展会把你选择处理的网页文本、提示词、目标语言、模型参数等内容直接发送到 OpenRouter。',
      '你的 OpenRouter API key 不会发送到 FutureDecade / FD Stack 服务器。',
    ],
  },
  {
    title: '3. 发送到 FutureDecade / FD Stack 的数据',
    body: [
      '账号注册、登录、邮箱验证、密码重置、订单、支付会话、授权状态和 Pro 功能校验会发送到 FD Stack。',
      '我们不会通过这些接口接收你提交给 OpenRouter 的翻译正文，也不会在自己的服务器中转你的 OpenRouter API key。',
    ],
  },
  {
    title: '4. 仅保存在当前浏览器的数据',
    body: [
      'OpenRouter API key 默认只保存在当前浏览器会话中；如果你主动勾选“在当前浏览器记住 API Key”，它会保存在当前浏览器本地。',
      'WordPress 站点地址、用户名、应用密码，以及 Notion Token、数据库配置，仅保存在当前浏览器本地，不做跨设备同步。',
      '翻译设置、提示词、导出草稿、临时缓存和部分调试数据可能保存在扩展本地存储，以便恢复当前工作流。',
    ],
  },
  {
    title: '5. 发送到你自己配置的第三方服务',
    body: [
      '如果你启用了 WordPress、Notion 或公众号相关导出能力，扩展会把你确认导出的内容直接发送到你配置的目标服务或目标站点。',
      '这些导出请求不会经过 FutureDecade / FD Stack 服务器中转。',
    ],
  },
  {
    title: '6. 扩展会使用哪些权限',
    body: [
      'storage：保存你的翻译设置、本地导出配置、账号状态缓存和当前浏览器里的敏感配置。',
      'activeTab 与 scripting：用于把页面工具栏和翻译逻辑注入网页。',
      '当你保存工具栏默认状态设置并授权网页访问权限后，扩展会在普通网页打开时自动注入工具栏；如果你启用了白名单规则，白名单站点会在默认折叠模式下仍然自动展开工具栏。',
      'openrouter.ai、api.notion.com 与 stack.futuredecade.com：分别用于 OpenRouter 模型请求、Notion API 调用，以及 FD Stack 的账号、支付、订单、授权接口。',
      '当你使用 WordPress 发布或公众号导出等高级能力时，扩展可能会在操作当下额外请求站点访问权限，用于连接目标站点和下载远程图片。',
    ],
  },
  {
    title: '7. 我们如何使用这些数据',
    body: [
      '提供账号登录、授权同步、支付完成后的 Pro 解锁、订单查询与基础风控。',
      '不会出售你的浏览数据。',
      '不会把你的 OpenRouter API key 作为平台侧共享密钥使用。',
    ],
  },
  {
    title: '8. 数据保留与安全',
    body: [
      '浏览器本地数据会一直保留到你手动清除、重置相关配置或卸载扩展。',
      'FD Stack 侧的账号、订单、授权和基础审计记录会按平台运营、安全和支付对账需要保留。',
      '敏感配置不会再通过 Chrome 跨设备同步保存；OpenRouter key 默认仅保存在当前浏览器会话。',
    ],
  },
  {
    title: '9. 你如何删除数据',
    body: [
      '你可以在扩展设置页清空或改写 API key、WordPress 和 Notion 配置。',
      '你也可以通过清除扩展本地数据或卸载扩展来删除浏览器本地保存的敏感配置。',
      '账号、订单与授权记录属于 FD Stack 账户体系数据，会按平台运营和合规需要保留。',
    ],
  },
  {
    title: '10. 联系方式与政策更新',
    body: [
      '如果你对这份政策有疑问，或需要人工协助，请使用支持页提供的入口，或发送邮件到 contact@futuredecade.com。',
      '当扩展的数据流、权限或第三方服务发生变化时，本页面会同步更新，并标注新的更新时间。',
    ],
  },
];

const highlightCards = [
  {
    title: 'OpenRouter Key',
    description: '默认仅浏览器会话可用，可选记住到当前浏览器本地。',
    icon: KeyRound,
  },
  {
    title: 'FD Stack 服务器',
    description: '处理账号、订单、支付会话和授权，不中转 OpenRouter key。',
    icon: Server,
  },
  {
    title: '权限使用',
    description: '授权后可在普通网页自动注入，白名单站点还能覆盖默认折叠规则。',
    icon: LockKeyhole,
  },
  {
    title: '本地浏览器存储',
    description: '保存导出目标配置、工作流设置和当前会话所需缓存。',
    icon: ShieldCheck,
  },
  {
    title: '删除与退出',
    description: '你可以清除扩展本地数据、退出账户或直接卸载扩展。',
    icon: Trash2,
  },
];

export function AiTranslateWorkflowPrivacyPage() {
  return (
    <div className="space-y-10 py-4">
      <div className="space-y-4">
        <Button variant="ghost" asChild className="text-muted-foreground px-0">
          <Link to="/apps/ai-translate-workflow">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回 AI Translate Workflow
          </Link>
        </Button>

        <section className="border-border/80 bg-card/95 rounded-lg border p-8 shadow-sm">
          <p className="text-primary text-xs font-semibold uppercase tracking-[0.28em]">
            Privacy Policy
          </p>
          <h1 className="text-foreground mt-3 text-4xl font-semibold tracking-tight">
            AI Translate Workflow 隐私政策
          </h1>
          <p className="text-muted-foreground mt-4 max-w-3xl text-base leading-7">
            这份页面只说明当前扩展的真实数据流。核心原则很直接：翻译与校对正文直接发给 OpenRouter，
            账号和授权走 FD Stack，导出内容直接发给你自己配置的目标服务。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/apps/ai-translate-workflow/support">查看支持页</Link>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://openrouter.ai" target="_blank" rel="noreferrer">
                OpenRouter
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {highlightCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-border/80 bg-card/95">
              <CardHeader className="space-y-3">
                <span className="bg-muted text-foreground flex h-11 w-11 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="leading-6">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
        <div className="space-y-6">
          {sections.map((section) => (
            <Card key={section.title} className="border-border/80 bg-card/95">
              <CardHeader>
                <CardTitle className="text-xl">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-foreground space-y-3 text-sm leading-7">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle>快速摘要</CardTitle>
              <CardDescription>可以直接复用到商店后台和对外说明。</CardDescription>
            </CardHeader>
            <CardContent className="text-foreground space-y-3 text-sm leading-6">
              <p>OpenRouter key 不上传到我们的服务器。</p>
              <p>翻译和校对正文直接发到 OpenRouter。</p>
              <p>WordPress / Notion 凭据仅保存到当前浏览器本地。</p>
              <p>FD Stack 仅处理账号、支付、订单和授权。</p>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle>相关页面</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" asChild>
                <Link to="/apps/ai-translate-workflow">应用主页</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to="/apps/ai-translate-workflow/support">支持页</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <a href="mailto:contact@futuredecade.com">contact@futuredecade.com</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
