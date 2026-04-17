import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { PublicSiteSettings } from '@/api/types';
import { getInitials } from '@/lib/utils';
import { getSiteDisplayName, isExternalSiteUrl, resolveFooterCopyright } from '@/lib/site-settings';

interface ConsumerFooterProps {
  siteSettings?: PublicSiteSettings | null;
}

export function ConsumerFooter({ siteSettings }: ConsumerFooterProps) {
  const siteName = getSiteDisplayName(siteSettings);
  const footerLinks = siteSettings?.footerLinks ?? [];
  const copyrightText = resolveFooterCopyright(
    siteSettings?.footerCopyright?.trim() || '© {year} FutureDecade. All rights reserved.'
  );

  return (
    <footer className="border-t border-gray-200/80 bg-white/88 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {siteSettings?.logoUrl ? (
                <img
                  src={siteSettings.logoUrl}
                  alt={siteName}
                  className="h-11 w-11 rounded-lg border border-gray-200 bg-white object-contain p-1 shadow-sm"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 via-gray-800 to-blue-600 text-sm font-semibold tracking-wide text-white shadow-lg shadow-gray-900/10">
                  {getInitials(siteName)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold tracking-tight text-gray-900">{siteName}</p>
                <p className="text-xs text-gray-500">应用发现、购买授权与交付入口</p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-7 text-gray-600">
              统一承接应用发现、购买、授权和部署交付，让用户侧体验与后台配置保持一致。
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold tracking-tight text-gray-900">页脚菜单</p>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {footerLinks.length ? (
                footerLinks.map((item) => {
                  const content = (
                    <>
                      <span>{item.label}</span>
                      {item.openInNewTab || isExternalSiteUrl(item.url) ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
                    </>
                  );

                  if (!item.openInNewTab && item.url.startsWith('/')) {
                    return (
                      <Link
                        key={`${item.label}:${item.url}`}
                        className="inline-flex items-center gap-1 text-sm text-gray-600 transition hover:text-gray-900"
                        to={item.url}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={`${item.label}:${item.url}`}
                      className="inline-flex items-center gap-1 text-sm text-gray-600 transition hover:text-gray-900"
                      href={item.url}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    >
                      {content}
                    </a>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">当前未配置页脚菜单。</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-gray-200 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightText}</p>
          <p>页脚菜单、品牌 Logo 与 favicon 均可在管理后台系统设置中维护。</p>
        </div>
      </div>
    </footer>
  );
}
