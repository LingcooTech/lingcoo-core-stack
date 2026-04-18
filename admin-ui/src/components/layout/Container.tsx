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
  const sizeClasses: Record<string, string> = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-5xl',
    xl: 'max-w-container',
    full: 'max-w-full',
  };

  const paddingClasses = 'px-4 sm:px-5 md:px-6 xl:px-6';

  return (
    <Component className={cn(sizeClasses[size], 'mx-auto', paddingClasses, className)}>
      {children}
    </Component>
  );
}
