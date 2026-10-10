import { Modal } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { AdminDraftContext } from './draft-context';
export function AdminDraftGuard({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Set<string>>(new Set());
  const register = useCallback(
    (id: string, dirty: boolean) =>
      setDrafts((current) => {
        if (current.has(id) === dirty) return current;
        const next = new Set(current);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const dirty = drafts.size > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  const [modal, context] = Modal.useModal();
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty],
    ),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const confirmation = modal.confirm({
      title: '放弃未保存的修改？',
      content: '离开当前页面会丢失未保存的表单内容。',
      okText: '放弃修改并离开',
      cancelText: '继续编辑',
      onOk: blocker.proceed,
      onCancel: blocker.reset,
    });
    return () => confirmation.destroy();
  }, [blocker.state, blocker.proceed, blocker.reset, modal]);
  return (
    <AdminDraftContext.Provider value={register}>
      {context}
      {children}
    </AdminDraftContext.Provider>
  );
}
