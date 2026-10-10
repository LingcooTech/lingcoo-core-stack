import { useState } from 'react';
import { AutoComplete, Input, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/admin/PageContainer';
import { SiteSettingsPanel } from '@/components/settings/SiteSettingsPanel';
import { PublicPagesSettingsPanel } from '@/components/settings/PublicPagesSettingsPanel';
import { SmtpSettingsPanel } from '@/components/settings/SmtpSettingsPanel';
import { StorageSettingsPanel } from '@/components/storage/StorageSettingsPanel';
import { ContentImportSettingsPanel } from '@/components/settings/ContentImportSettingsPanel';
import { AiSettingsPanel } from '@/components/settings/AiSettingsPanel';
interface SettingsSearchHit {
  tab: string;
  tabLabel: string;
  field: string;
  keywords: string[];
}
const SETTINGS_SEARCH_INDEX: SettingsSearchHit[] = [
  { tab: 'site', tabLabel: '品牌与页脚', field: '站点名称', keywords: ['站点', 'name', '名称'] },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: 'Logo / Favicon',
    keywords: ['logo', 'favicon', '图标', '徽标'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '主题色',
    keywords: ['颜色', 'color', '主题色', '品牌色'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '导航菜单',
    keywords: ['导航', 'navigation', '菜单', '顶栏'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '页脚',
    keywords: ['footer', '页脚', '版权', 'beian', '备案'],
  },
  {
    tab: 'public-pages',
    tabLabel: '公共页面',
    field: '内容中心 Hub',
    keywords: ['内容中心', 'hub', '文章', '观点'],
  },
  {
    tab: 'public-pages',
    tabLabel: '公共页面',
    field: '文档中心 Hub',
    keywords: ['文档中心', 'docs hub', '产品文档'],
  },
  {
    tab: 'smtp',
    tabLabel: '邮件服务',
    field: 'SMTP 主机 / 端口',
    keywords: ['smtp', '邮件', '邮箱', 'host', 'port', '发件'],
  },
  {
    tab: 'smtp',
    tabLabel: '邮件服务',
    field: '发送测试邮件',
    keywords: ['测试邮件', 'test', '发件人'],
  },
  {
    tab: 'storage',
    tabLabel: '文件存储',
    field: 'S3 兼容存储',
    keywords: ['七牛', 'qiniu', '存储', '媒体', 'oss', '上传'],
  },
  {
    tab: 'content',
    tabLabel: '内容导入',
    field: 'WordPress 连接',
    keywords: ['wordpress', 'wp', '导入'],
  },
  { tab: 'content', tabLabel: '内容导入', field: 'Notion 连接', keywords: ['notion', '笔记'] },
  {
    tab: 'content',
    tabLabel: '内容导入',
    field: '微信公众号',
    keywords: ['微信', '公众号', 'wechat', 'mp'],
  },
  {
    tab: 'ai',
    tabLabel: 'AI Hub',
    field: 'OpenRouter / Provider',
    keywords: ['ai', 'openrouter', 'provider', 'gpt', 'claude', 'gemini', 'model', 'llm'],
  },
];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const items = [
    { key: 'site', label: '品牌与页脚', children: <SiteSettingsPanel /> },
    { key: 'public-pages', label: '公共页面', children: <PublicPagesSettingsPanel /> },
    { key: 'smtp', label: '邮件服务', children: <SmtpSettingsPanel /> },
    { key: 'storage', label: '文件存储', children: <StorageSettingsPanel /> },
    { key: 'content', label: '内容导入', children: <ContentImportSettingsPanel /> },
    { key: 'ai', label: 'AI 服务', children: <AiSettingsPanel /> },
  ];
  const active = items.some((item) => item.key === params.get('tab')) ? params.get('tab')! : 'site';
  const jump = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };
  return (
    <PageContainer
      title="系统设置"
      actions={
        <AutoComplete
          style={{ width: 300, maxWidth: '100%' }}
          value={search}
          onChange={setSearch}
          options={
            search.trim()
              ? SETTINGS_SEARCH_INDEX.filter((hit) =>
                  [hit.field, hit.tabLabel, ...hit.keywords]
                    .join(' ')
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ).map((hit) => ({ value: hit.tab, label: `${hit.tabLabel} · ${hit.field}` }))
              : []
          }
          onSelect={(value) => {
            jump(value);
            setSearch('');
          }}
        >
          <Input.Search aria-label="搜索设置" placeholder="搜索设置项" />
        </AutoComplete>
      }
    >
      <Tabs
        activeKey={active}
        onChange={jump}
        items={items.map((item) => ({ ...item, forceRender: true }))}
      />
    </PageContainer>
  );
}
