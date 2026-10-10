import { Card, Flex, Typography } from 'antd';
import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { PageTitleContext } from './page-context';

export function PageToolbar({ filters, actions }: { filters?: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="admin-toolbar" size="small">
      <div className="admin-toolbar__row">
        <div className="admin-toolbar__filters">{filters}</div>
        {actions && <div className="admin-toolbar__actions">{actions}</div>}
      </div>
    </Card>
  );
}
export function PageContainer({
  title,
  description,
  filters,
  actions,
  navigation,
  width = 'default',
  children,
}: {
  title: string;
  description?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  width?: 'default' | 'form' | 'wide';
  children: ReactNode;
}) {
  const setTitle = useContext(PageTitleContext);
  useLayoutEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
  return (
    <section className={`admin-page admin-page--${width}`} aria-label={title}>
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      {navigation}
      {(filters || actions) && <PageToolbar filters={filters} actions={actions} />}
      {children}
    </section>
  );
}
export function FormActions({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <Flex className="admin-form-actions" justify="space-between" align="center" wrap gap={12}>
      <Typography.Text type="secondary">{hint}</Typography.Text>
      <Flex wrap gap={8}>
        {children}
      </Flex>
    </Flex>
  );
}
