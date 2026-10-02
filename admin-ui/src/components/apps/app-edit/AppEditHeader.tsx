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
  const activeTabMeta = visibleTabs.find((tab) => tab.key === activeTab) ??
    visibleTabs[0] ??
    APP_EDIT_TABS[0] ?? { key: 'intro', label: '应用', description: '' };

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link to="/admin/apps">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                返回
              </Button>
            </Link>
            <Separator orientation="vertical" className="hidden h-8 lg:block" />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
                {isCreateMode ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    新建
                  </Badge>
                ) : null}
                <StatusPill tone={statusToTone(formStatus)} label={formStatus} />
                <StatusPill
                  tone={hasUnsavedChanges ? 'warn' : 'ok'}
                  label={hasUnsavedChanges ? '有未保存变更' : '已保存'}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{appCode || '请先填写 App Code'}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>{activeTabMeta.description}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-3 text-[11px] text-muted-foreground tabular-nums sm:flex">
              <span>{offersCount} Offers</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{plansCount} Plans</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{featuresCount} Features</span>
            </div>
            <Button size="sm" onClick={onSave} disabled={saveDisabled}>
              <Save className="h-3.5 w-3.5" />
              {isSaving ? '保存中' : `保存${activeTabMeta.label}`}
            </Button>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 bg-transparent p-0">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-[13px]">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
    </div>
  );
}
