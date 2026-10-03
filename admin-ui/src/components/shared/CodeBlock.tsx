import { handleAsync } from '@/lib/async-events';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

interface CodeBlockProps {
  language?: string;
  children: ReactNode;
  className?: string;
}

function getCodeString(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getCodeString).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    const props = (children as { props?: { children?: ReactNode } }).props;
    if (props?.children !== undefined) return getCodeString(props.children);
  }
  return '';
}

const SHIKI_LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  cs: 'csharp',
  md: 'markdown',
  'c++': 'cpp',
  text: 'text',
  plaintext: 'text',
};

const SUPPORTED_LANGS = new Set([
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'json',
  'bash',
  'html',
  'css',
  'scss',
  'python',
  'go',
  'rust',
  'sql',
  'yaml',
  'toml',
  'xml',
  'markdown',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'dockerfile',
  'diff',
  'text',
]);

function normalizeLang(raw?: string): string {
  if (!raw) return 'text';
  const lower = raw.toLowerCase();
  const aliased = SHIKI_LANG_ALIAS[lower] ?? lower;
  return SUPPORTED_LANGS.has(aliased) ? aliased : 'text';
}

/**
 * Markdown 代码块：shiki 双主题高亮 + 一键复制。
 * shiki 通过 dynamic import 异步加载，未就绪时退化为纯文本 pre。
 */
export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const code = getCodeString(children).replace(/\n$/, '');
  const lang = normalizeLang(language);

  useEffect(() => {
    let cancelled = false;
    void import('shiki')
      .then(async (shiki) => {
        try {
          const result = await shiki.codeToHtml(code, {
            lang,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: 'light',
          });
          if (!cancelled) setHtml(result);
        } catch {
          if (!cancelled) setHtml(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('代码已复制');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('复制失败，请手动选择');
    }
  };

  return (
    <div
      className={cn(
        'group relative my-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleAsync(handleCopy)}
          aria-label="复制代码"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              复制
            </>
          )}
        </button>
      </div>
      {html ? (
        <div
          className="codeblock-shiki overflow-x-auto text-[13px] leading-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto bg-muted/20 p-4 text-[13px] leading-6 text-foreground">
          <code className="font-mono">{code}</code>
        </pre>
      )}
    </div>
  );
}
