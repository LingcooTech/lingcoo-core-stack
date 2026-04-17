import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  as?: 'div' | 'section' | 'main' | 'header' | 'footer';
}

/**
 * 统一的容器组件
 * 确保 Header、Main、Footer 使用相同的最大宽度和内边距
 */
export function Container({
  children,
  className = '',
  size = 'xl',
  as: Component = 'div',
}: ContainerProps) {
  // 定义不同尺寸的最大宽度
  const sizeClasses: Record<string, string> = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-5xl',
    xl: 'max-w-7xl', // 1280px - 标准容器宽度
    full: 'max-w-full',
  };

  // 统一的响应式内边距
  // 移动端: 16px, 平板: 24px, 桌面: 32px
  const paddingClasses = 'px-4 sm:px-6 lg:px-8';

  return (
    <Component className={cn(sizeClasses[size], 'mx-auto', paddingClasses, className)}>
      {children}
    </Component>
  );
}
