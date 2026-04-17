import { ArrowLeft, CreditCard, FileText, KeyRound, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const supportSections = [
  {
    title: '1. 账号、授权与付款问题',
    points: [
      '优先登录 FD Stack 账户，检查订单页和授权页是否已经同步。',
      '如果支付已经完成，但 Pro 还未解锁，先刷新授权状态，再回到扩展设置页的“套餐 / 授权”查看。',
      '如果是登录、邮箱验证或密码重置问题，请直接使用 FD Stack 的账户流程处理。'
    ]
  },
  {
    title: '2. OpenRouter 相关问题',
    points: [
      '确认你填写的是自己的 OpenRouter API key，而不是别的平台密钥。',
      '检查 OpenRouter 账户是否仍有可用额度，或目标模型是否仍然可用。',
      '如果浏览器重启后密钥丢失，说明你保存时使用的是“仅当前浏览器会话”模式。'
    ]
  },
  {
    title: '3. WordPress / Notion 导出问题',
    points: [
      'WordPress 先确认站点 URL、用户名和应用密码是否可用，再检查目标站点 REST API 是否正常。',
      'Notion 先确认 Token 是否有效，以及目标数据库是否已经共享给对应集成。',
      '这些导出请求都是直接发往你配置的目标服务，FutureDecade / FD Stack 不中转正文内容。'
    ]
  },
  {
    title: '4. 排障时建议一起提供的信息',
    points: [
      'Chrome 版本、扩展版本、出现问题的页面 URL。',
      '问题发生时选择的模型、翻译模式、校对模式。',
      '相关报错文案、截图，以及你已经尝试过的排查步骤。'
    ]
  },
  {
    title: '5. 当前已知边界',
    points: [
      '扩展只支持大多数普通 HTTP / HTTPS 页面；浏览器内部页和部分特殊协议页面不会注入工具栏。',
      '保存工具栏默认状态设置后，浏览器会请求网页访问权限；授权后，工具栏会在普通网页打开时自动注入。',
      '如果你把默认状态设为“默认折叠”，仍然可以通过白名单让常用媒体站点在打开页面时自动展开工具栏。',
      '自动翻译是否执行，仍然取决于你在设置页里选择的触发方式。',
      'WordPress 发布、公众号导出这类高级导出能力在首次使用时，浏览器可能会额外询问站点访问权限；如果拒绝，相关操作不会继续。'
    ]
  },
  {
    title: '6. 人工联系',
    points: [
      '如果自助排障仍无法解决，请把问题材料发送到 contact@futuredecade.com。',
      '建议邮件里附带订单号、账号邮箱、页面 URL、错误截图和复现步骤。'
    ]
  }
];

export function AiTranslateWorkflowSupportPage() {
  return (
    <div className="space-y-10 py-4">
      <div className="space-y-4">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/apps/ai-translate-workflow">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回 AI Translate Workflow
          </Link>
        </Button>

        <section className="rounded-lg border border-gray-200/80 bg-white/95 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Support</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">AI Translate Workflow 支持页</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
            这份页面优先给出自助排障路径。因为扩展默认使用你自己的 OpenRouter key 和你自己的导出目标，
            最常见的问题通常出在凭据、额度、站点权限或当前页面本身。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/apps/ai-translate-workflow/privacy">查看隐私政策</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/orders">我的订单</Link>
            </Button>
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: '订单与授权', icon: CreditCard, desc: '先看订单页、授权状态和账号登录情况。' },
          { title: 'API Key', icon: KeyRound, desc: '确认 OpenRouter key、额度和模型可用性。' },
          { title: '导出配置', icon: Wrench, desc: '检查 WordPress / Notion 目标配置与权限。' },
          { title: '问题材料', icon: FileText, desc: '准备 URL、截图、错误文案和复现步骤。' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-gray-200/80 bg-white/95">
              <CardHeader className="space-y-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-slate-800">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="leading-6">{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
        <div className="space-y-6">
          {supportSections.map((section) => (
            <Card key={section.title} className="border-gray-200/80 bg-white/95">
              <CardHeader>
                <CardTitle className="text-xl">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-7 text-gray-700">
                {section.points.map((point) => (
                  <p key={point}>{point}</p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-gray-200/80 bg-white/95">
            <CardHeader>
              <CardTitle>支持入口</CardTitle>
              <CardDescription>当前可用的自助入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" asChild>
                <Link to="/login">登录 FD Stack</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to="/apps/ai-translate-workflow/privacy">隐私政策</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <a href="mailto:contact@futuredecade.com">contact@futuredecade.com</a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-200/80 bg-white/95">
            <CardHeader>
              <CardTitle>排障顺序</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-gray-700">
              <p>1. 先确认账号与授权。</p>
              <p>2. 再确认 OpenRouter key、额度与模型。</p>
              <p>3. 最后检查 WordPress / Notion 目标配置。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
