import { BrandMark } from '@/components/portal/BrandMark';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { PublicSiteSettings } from '@/api/types';
import { Container } from '@/components/layout/Container';
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
    <footer className="border-t border-border bg-muted/40">
      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <BrandMark src={siteSettings?.logoUrl} name={siteName} />
              <div>
                <p className="text-sm font-semibold tracking-tight text-foreground">{siteName}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold tracking-tight text-foreground">页脚菜单</p>
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
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                        to={item.url}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={`${item.label}:${item.url}`}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                      href={item.url}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    >
                      {content}
                    </a>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">当前未配置页脚菜单。</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightText}</p>
          {filingInfo ? <p className="sm:text-right">{filingInfo}</p> : null}
        </div>
      </Container>
    </footer>
  );
}
