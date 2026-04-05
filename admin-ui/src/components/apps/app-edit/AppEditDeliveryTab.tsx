import { ExternalLink, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';

interface AppEditDeliveryTabProps {
  deliveryEligible: boolean;
  formType: string;
}

export function AppEditDeliveryTab({
  deliveryEligible,
  formType,
}: AppEditDeliveryTabProps) {
  return (
    <TabsContent value="delivery" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>交付配置</CardTitle>
          <CardDescription>交付参数仍在独立页面维护，这里提供状态说明和快捷跳转。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={deliveryEligible ? 'info' : 'neutral'}
              label={deliveryEligible ? '支持交付配置' : '当前类型无需交付配置'}
            />
            <StatusPill tone={statusToTone(formType)} label={`类型: ${formType}`} />
          </div>

          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-sm font-black">集中编辑入口已补齐导航</p>
                <p className="text-sm text-muted-foreground">
                  当前版本先把交付配置纳入应用编辑页的信息架构中，实际参数编辑仍在独立交付页完成，避免一次性改动后端配置语义。
                </p>
              </div>
            </div>
          </div>

          <Button asChild>
            <Link to="/admin/delivery">
              前往交付设置页
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
