import {
  Activity,
  Bell,
  BookOpen,
  BookOpenText,
  Boxes,
  FileText,
  FolderOpen,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * 后台所有引用 Lucide 图标的「数据源」（foundation.ts / adminCommandItems）
 * 都按组件名字符串存 icon 字段，渲染时通过本 map lookup。
 *
 * 这样 foundation.ts 保持纯数据，不需要 import React 组件。
 */
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Package,
  FileText,
  FolderOpen,
  BookOpen,
  BookOpenText,
  KeyRound,
  Receipt,
  Wallet,
  Settings,
  Users,
  ShieldCheck,
  Boxes,
  LifeBuoy,
  Bell,
  Activity,
  Gauge,
};

export function resolveIcon(name: string): LucideIcon {
  return iconMap[name] ?? LayoutDashboard;
}
