import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { PublicSiteSettings } from '@/api/types';
import { Container } from '@/components/layout/Container';
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
    <footer className="border-t border-gray-200 bg-[#f8fafc]">
      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)] lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {siteSettings?.logoUrl ? (
                <img
                  src={siteSettings.logoUrl}
                  alt={siteName}
                  className="h-10 w-10 rounded-2xl border border-gray-200 bg-white object-contain p-1.5 shadow-sm"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-gray-800 to-blue-600 text-sm font-semibold tracking-wide text-white shadow-lg shadow-gray-900/10">
                  {getInitials(siteName)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold tracking-tight text-gray-900">{siteName}</p>
              </div>
            </div>
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

        <div className="mt-6 flex flex-col gap-2 border-t border-gray-200 pt-5 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightText}</p>
        </div>
      </Container>
    </footer>
  );
}
