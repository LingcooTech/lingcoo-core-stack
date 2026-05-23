export interface TocItem {
  level: number;
  text: string;
  id: string;
}

/**
 * 把任意标题文本转成稳定的 anchor id —— ascii / 中文 / 数字保留，其余替换成 `-`。
 * 与 DocsSpacePage 内联函数保持一致，提取出来给文章和文档共用。
 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 扫描 Markdown 提取 h2/h3/h4 大纲。仅靠开头的 `#` 数量识别，对代码块内的 `#` 会误判，
 * 但当前发布内容里基本不会出现这种情况，先用最简实现。
 */
export function extractToc(content: string): TocItem[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{2,4}\s+/.test(line))
    .map((line) => {
      const matched = line.match(/^(#{2,4})\s+(.+)$/);
      const level = matched?.[1]?.length ?? 2;
      const text = matched?.[2]?.trim() ?? '';
      return { level, text, id: headingId(text) };
    })
    .filter((item) => item.text && item.id);
}

/**
 * 估算阅读时间（分钟，向上取整，最少 1 分钟）。
 * 中文字符按 300 字/分钟，英文按 200 词/分钟混合估算。
 */
export function estimateReadingTime(content: string): number {
  const stripped = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[[^\]]*\]\([^)]+\)/g, '');

  const chineseChars = (stripped.match(/[一-龥]/g) ?? []).length;
  const englishWords = stripped
    .replace(/[一-龥]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = chineseChars / 300 + englishWords / 200;
  return Math.max(1, Math.ceil(minutes));
}
