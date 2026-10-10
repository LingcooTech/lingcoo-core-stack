import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Flex, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { PageTitleContext } from './page-context';

export function PageToolbar({ filters, actions }: { filters?: ReactNode; actions?: ReactNode }) {
  if (!filters) return actions ? <div className="admin-command-bar">{actions}</div> : null;
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
  backTo,
  backLabel = '返回列表',
  children,
}: {
  title: string;
  description?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const setTitle = useContext(PageTitleContext);
  useLayoutEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
  return (
    <section className="admin-page" aria-label={title}>
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      {(backTo || navigation || (!filters && actions)) && (
        <div className="admin-command-bar">
          {(backTo || navigation) && (
            <div className="admin-page-navigation">
              {backTo && <BackButton to={backTo} label={backLabel} />}
              {navigation}
            </div>
          )}
          {!filters && actions && <div className="admin-toolbar__actions">{actions}</div>}
        </div>
      )}
      {filters && <PageToolbar filters={filters} actions={actions} />}
      {children}
    </section>
  );
}
function BackButton({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <Button aria-label={label} icon={<ArrowLeftOutlined />} onClick={() => void navigate(to)}>
      {label}
    </Button>
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
