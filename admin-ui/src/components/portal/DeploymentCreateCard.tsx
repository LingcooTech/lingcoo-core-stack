import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DeployableAppOption {
  appCode: string;
  appName: string;
  appType: string;
  products: Array<{
    code: string;
    name: string;
    featureCount: number;
  }>;
}

export function DeploymentCreateCard({
  options,
  pending,
  onSubmit
}: {
  options: DeployableAppOption[];
  pending?: boolean;
  onSubmit: (payload: {
    appCode: string;
    productCode?: string;
    label: string;
    environment: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
  }) => void;
}) {
  const [appCode, setAppCode] = useState('');
  const [productCode, setProductCode] = useState('');
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [serverHost, setServerHost] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [adminDomain, setAdminDomain] = useState('');
  const [wsDomain, setWsDomain] = useState('');
  const [installPath, setInstallPath] = useState('/opt/fd-headless-wp-system');

  useEffect(() => {
    if (!appCode && options[0]) {
      setAppCode(options[0].appCode);
    }
  }, [appCode, options]);

  const selectedApp = useMemo(() => options.find((item) => item.appCode === appCode) ?? null, [options, appCode]);

  useEffect(() => {
    if (!selectedApp) return;
    if (!label) {
      setLabel(`${selectedApp.appName} Production`);
    }
    if (selectedApp.products.length === 1) {
      setProductCode(selectedApp.products[0]?.code ?? '');
    } else if (!selectedApp.products.some((product) => product.code === productCode)) {
      setProductCode(selectedApp.products[0]?.code ?? '');
    }
  }, [selectedApp, label, productCode]);

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader>
        <CardTitle>创建部署记录</CardTitle>
        <CardDescription>先记录系统部署目标和域名信息，再签发一次性 deploy token，供后续安装脚本接入。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="deployment-app">系统产品</Label>
            <select
              id="deployment-app"
              value={appCode}
              onChange={(event) => {
                setAppCode(event.target.value);
                setLabel('');
              }}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {options.map((option) => (
                <option key={option.appCode} value={option.appCode}>
                  {option.appName} ({option.appType})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deployment-product">授权产品</Label>
            <select
              id="deployment-product"
              value={productCode}
              onChange={(event) => setProductCode(event.target.value)}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {(selectedApp?.products ?? []).map((product) => (
                <option key={product.code} value={product.code}>
                  {product.name} ({product.featureCount} abilities)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="deployment-label">部署名称</Label>
            <Input id="deployment-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="FutureDecade Production" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deployment-env">环境</Label>
            <Input id="deployment-env" value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="production" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="deployment-server">服务器 / Host</Label>
            <Input id="deployment-server" value={serverHost} onChange={(event) => setServerHost(event.target.value)} placeholder="144.48.8.218" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deployment-path">安装路径</Label>
            <Input id="deployment-path" value={installPath} onChange={(event) => setInstallPath(event.target.value)} placeholder="/opt/fd-headless-wp-system" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="deployment-primary-domain">前台域名</Label>
            <Input id="deployment-primary-domain" value={primaryDomain} onChange={(event) => setPrimaryDomain(event.target.value)} placeholder="www.futuredecade.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deployment-admin-domain">后台域名</Label>
            <Input id="deployment-admin-domain" value={adminDomain} onChange={(event) => setAdminDomain(event.target.value)} placeholder="admin.futuredecade.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deployment-ws-domain">WS 域名</Label>
            <Input id="deployment-ws-domain" value={wsDomain} onChange={(event) => setWsDomain(event.target.value)} placeholder="ws.futuredecade.com" />
          </div>
        </div>

        <Button
          className="w-full"
          disabled={!appCode || !label.trim() || pending}
          onClick={() =>
            onSubmit({
              appCode,
              productCode: productCode || undefined,
              label,
              environment,
              serverHost: serverHost || undefined,
              primaryDomain: primaryDomain || undefined,
              adminDomain: adminDomain || undefined,
              wsDomain: wsDomain || undefined,
              installPath: installPath || undefined
            })
          }
        >
          {pending ? '创建中...' : '创建部署记录'}
        </Button>
      </CardContent>
    </Card>
  );
}
