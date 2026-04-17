import { ArrowUpRight, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ConsumerFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/88 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr,1fr,1fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-600 text-sm font-black tracking-[0.18em] text-white shadow-lg shadow-slate-900/10">
                FD
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-slate-950">FD Stack</p>
                <p className="text-xs text-slate-500">应用交付与授权平台</p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-600">
              用统一账号体系承接应用发现、购买、授权、部署与后续交付，让产品从“能用”走到“能稳定运营”。
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                账号与授权统一管理
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                <Mail className="h-3.5 w-3.5 text-blue-600" />
                contact@futuredecade.com
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-black tracking-tight text-slate-950">用户入口</p>
            <div className="space-y-2 text-sm text-slate-600">
              <Link className="block transition hover:text-slate-950" to="/">
                应用中心
              </Link>
              <Link className="block transition hover:text-slate-950" to="/orders">
                我的订单
              </Link>
              <Link className="block transition hover:text-slate-950" to="/access">
                我的应用
              </Link>
              <Link className="block transition hover:text-slate-950" to="/deploy">
                部署管理
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-black tracking-tight text-slate-950">帮助与说明</p>
            <div className="space-y-2 text-sm text-slate-600">
              <Link className="block transition hover:text-slate-950" to="/apps/ai-translate-workflow/privacy">
                隐私政策
              </Link>
              <Link className="block transition hover:text-slate-950" to="/apps/ai-translate-workflow/support">
                支持页
              </Link>
              <a
                className="inline-flex items-center gap-1 transition hover:text-slate-950"
                href="mailto:contact@futuredecade.com"
              >
                联系邮箱
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} FutureDecade. All rights reserved.</p>
          <p>FD Stack 用户侧界面已与产品前台标准对齐，面向购买、授权和交付链路优化。</p>
        </div>
      </div>
    </footer>
  );
}
