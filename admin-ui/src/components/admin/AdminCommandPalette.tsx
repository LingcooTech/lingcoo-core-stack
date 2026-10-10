import { App, AutoComplete, Input, Modal } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminCommandItems, adminSectionMeta } from '@/lib/foundation';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';

const recentKey = 'fd:command-palette:recent';
function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(recentKey) || '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
export function AdminCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const visible = useMemo(
    () =>
      adminCommandItems.filter(
        (item) =>
          !item.sectionKey ||
          hasPermission(normalizeRole(user?.role), adminSectionMeta[item.sectionKey].permission),
      ),
    [user?.role],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (
        (event.key === 'k' && (event.metaKey || event.ctrlKey)) ||
        (event.key === '/' && !editing)
      ) {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onOpenChange]);
  const matches = visible.filter((item) =>
    [item.label, item.note, ...item.keywords]
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const recentItems = search
    ? []
    : recent
        .map((id) => visible.find((item) => item.id === id))
        .filter((item) => item !== undefined);
  const groups = [...new Set(matches.map((item) => item.group))];
  return (
    <Modal
      title="搜索页面、资源、操作"
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      afterClose={() => setSearch('')}
      destroyOnHidden
    >
      <AutoComplete
        autoFocus
        style={{ width: '100%' }}
        value={search}
        onChange={setSearch}
        notFoundContent="未找到相关结果"
        options={[
          ...(recentItems.length
            ? [
                {
                  label: '最近访问',
                  options: recentItems.map((item) => ({ value: item.id, label: item.label })),
                },
              ]
            : []),
          ...groups.map((group) => ({
            label: group,
            options: matches
              .filter((item) => item.group === group)
              .map((item) => ({ value: item.id, label: item.label })),
          })),
        ]}
        onSelect={(id) => {
          const item = visible.find((candidate) => candidate.id === id);
          if (!item) return;
          const next = [id, ...readRecent().filter((previous) => previous !== id)].slice(0, 5);
          try {
            localStorage.setItem(recentKey, JSON.stringify(next));
          } catch {
            /* private browsing */
          }
          setRecent(next);
          onOpenChange(false);
          if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer');
          else
            void Promise.resolve(navigate(item.href)).catch((error: unknown) => {
              void message.error(error instanceof Error ? error.message : '页面跳转失败');
            });
        }}
      >
        <Input.Search placeholder="搜索页面、资源、操作…" aria-label="搜索页面、资源、操作" />
      </AutoComplete>
    </Modal>
  );
}
