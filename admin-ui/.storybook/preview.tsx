import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

import '../src/index.css';
import { TooltipProvider } from '../src/components/ui/tooltip';

/**
 * 让每个 story 都注册一个主题切换 toolbar 项（light/dark/system），
 * 通过 .dark class on <html> 触发 Tailwind v4 的 @custom-variant dark。
 */
function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = theme;
}

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as 'light' | 'dark' | undefined) ?? 'light';
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-[160px] bg-background p-6 text-foreground">
        <Story />
      </div>
    </TooltipProvider>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
    a11y: {
      // 'todo' - show a11y violations in the panel
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  globalTypes: {
    theme: {
      description: '主题切换',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
