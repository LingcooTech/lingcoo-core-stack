import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const;

interface ThemeToggleProps {
  /** 控制按钮变体，默认 ghost；UserShell 头部可传 outline 显得更显眼 */
  variant?: 'ghost' | 'outline';
  className?: string;
}

export function ThemeToggle({ variant = 'ghost', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={cn(
            'h-9 w-9 rounded-full focus-visible:ring-0 focus-visible:ring-offset-0',
            className,
          )}
          aria-label="切换主题"
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(value);
            }}
            className={cn(
              'gap-2 rounded-md text-sm',
              theme === value && 'font-semibold text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
