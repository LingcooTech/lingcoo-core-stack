import { ArrowLeft, Save } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

import { APP_EDIT_TABS, type AppEditTabKey } from './model';

interface AppEditHeaderProps {
  title: string;
  appCode: string;
  isCreateMode: boolean;
  visibleTabKeys: AppEditTabKey[];
  formStatus: string;
  hasUnsavedChanges: boolean;
  activeTab: AppEditTabKey;
  offersCount: number;
  plansCount: number;
  featuresCount: number;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditHeader({
  title,
  appCode,
  isCreateMode,
  visibleTabKeys,
  formStatus,
  hasUnsavedChanges,
  activeTab,
  offersCount,
  plansCount,
  featuresCount,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditHeaderProps) {
  const visibleTabs = APP_EDIT_TABS.filter((tab) => visibleTabKeys.includes(tab.key));
  const activeTabMeta = visibleTabs.find((tab) => tab.key === activeTab) ?? visibleTabs[0] ?? APP_EDIT_TABS[0];

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link to="/admin/apps">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" />
                返回
              </Button>
            </Link>
            <Separator orientation="vertical" className="hidden h-8 lg:block" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold">{title}</p>
                {isCreateMode ? (
                  <Badge variant="outline">New App</Badge>
                ) : null}
                <StatusPill tone={statusToTone(formStatus)} label={formStatus} />
                <StatusPill
                  tone={hasUnsavedChanges ? 'warn' : 'ok'}
                  label={hasUnsavedChanges ? '有未保存变更' : '已保存'}
                />
              </div>
              <p className="text-xs font-mono text-muted-foreground">
                {appCode || '请先填写 App Code'}
              </p>
              <p className="text-xs text-muted-foreground">{activeTabMeta.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{offersCount} Offers</Badge>
            <Badge variant="outline">{plansCount} Plans</Badge>
            <Badge variant="outline">{featuresCount} Features</Badge>
            <Button onClick={onSave} disabled={saveDisabled}>
              <Save className="h-4 w-4" />
              {isSaving ? '保存中...' : `保存${activeTabMeta.label}`}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-lg bg-muted/70 p-1">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="min-w-[108px] rounded-md">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
    </div>
  );
}
