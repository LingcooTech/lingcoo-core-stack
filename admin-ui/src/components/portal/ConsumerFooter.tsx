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
    siteSettings?.footerCopyright?.trim() || '© {year} FutureDecade. All rights reserved.',
  );
  const filingInfo = siteSettings?.filingInfo?.trim() || '';

  return (
    <footer className="border-border border-t bg-[#f8fafc]">
      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)] lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {siteSettings?.logoUrl ? (
                <img
                  src={siteSettings.logoUrl}
                  alt={siteName}
                  className="border-border bg-card h-10 w-10 rounded-xl border object-contain p-1.5 shadow-sm"
                />
              ) : (
                <div className="bg-foreground text-background flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold tracking-wide">
                  {getInitials(siteName)}
                </div>
              )}
              <div>
                <p className="text-foreground text-sm font-semibold tracking-tight">{siteName}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-foreground text-sm font-semibold tracking-tight">页脚菜单</p>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {footerLinks.length ? (
                footerLinks.map((item) => {
                  const content = (
                    <>
                      <span>{item.label}</span>
                      {item.openInNewTab || isExternalSiteUrl(item.url) ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : null}
                    </>
                  );

                  if (!item.openInNewTab && item.url.startsWith('/')) {
                    return (
                      <Link
                        key={`${item.label}:${item.url}`}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition"
                        to={item.url}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={`${item.label}:${item.url}`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition"
                      href={item.url}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    >
                      {content}
                    </a>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm">当前未配置页脚菜单。</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-border text-muted-foreground mt-6 flex flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightText}</p>
          {filingInfo ? <p className="sm:text-right">{filingInfo}</p> : null}
        </div>
      </Container>
    </footer>
  );
}
