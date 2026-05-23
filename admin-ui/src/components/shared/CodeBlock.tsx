import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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

/**
 * Markdown 代码块通用渲染：保留浏览器默认等宽字体，
 * 提供右上角语言徽标 + 一键复制 + 成功反馈。
 *
 * 真·语法高亮（shiki / prism）可作为后续增强，目前先保证可读性与交互。
 */
export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = getCodeString(children).replace(/\n$/, '');

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
        'group relative my-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="复制代码"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-100"
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
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-slate-100">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
