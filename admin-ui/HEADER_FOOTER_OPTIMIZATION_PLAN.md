# Header 和 Footer 优化方案

## 目标

1. 参照 fd-frontend 的 Header 和顶部主菜单，对 fd-core-stack 的 header 和顶部菜单进行优化重构
2. 确保 header、主内容区、footer 的容器宽度严格一致，左右严格对齐

## 当前状态分析

### fd-core-stack 当前实现

#### UserShell.tsx (用户侧布局)
- **Header 容器**: `max-w-consumer` (自定义值)
- **Main 容器**: `max-w-consumer`
- **Footer 容器**: `max-w-7xl` (1280px)
- **问题**: Header/Main 使用 `max-w-consumer`，Footer 使用 `max-w-7xl`，容器宽度不一致！

#### ConsumerFooter.tsx
- **容器**: `max-w-7xl` (1280px)
- **内边距**: `px-4 sm:px-6 lg:px-8`

### fd-frontend 参考实现

#### Header.tsx
- **容器**: `max-w-container`
- **内边距**: `px-4 sm:px-6 tablet:px-8 desktop:px-6`
- **布局**: 三列布局 (Logo 1/5, Nav 3/5, Tools 1/5)
- **特性**: 
  - 支持透明模式
  - 搜索框切换动画
  - 响应式导航

#### Container.tsx
- **容器**: `max-w-container` (使用 CSS 变量 `--container-max-width`)
- **内边距**: `px-4 sm:px-6 tablet:px-8 desktop:px-6`

#### Footer.tsx
- **容器**: `max-w-container`
- **内边距**: `px-4 sm:px-6 tablet:px-8 desktop:px-6`

## 优化方案

### 1. 统一容器宽度

**目标**: 所有容器使用相同的最大宽度和内边距

#### 方案 A: 使用 max-w-7xl (推荐)
```tsx
// 统一使用 max-w-7xl (1280px)
const containerClass = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";
```

**优点**:
- 与之前的应用页面优化保持一致
- 标准 Tailwind 类名，易于维护
- 1280px 是常见的容器宽度

#### 方案 B: 使用 CSS 变量
```tsx
// 定义 CSS 变量
--container-max-width: 1280px;

// 使用自定义类
const containerClass = "max-w-container mx-auto px-4 sm:px-6 lg:px-8";
```

**优点**:
- 更灵活，可以全局配置
- 与 fd-frontend 完全一致

**决定**: 使用方案 A (max-w-7xl)，因为更简单直接，且与已完成的优化保持一致。

### 2. Header 优化

#### 2.1 布局结构优化

**当前结构**:
```tsx
<header>
  <div className="max-w-consumer"> // 问题：自定义宽度
    <div className="flex flex-col lg:flex-row">
      <div>Logo + 汉堡菜单</div>
      <nav>导航菜单（移动端）</nav>
      <div>用户信息 + 按钮</div>
    </div>
    <nav>导航菜单（移动端）</nav>
  </div>
</header>
```

**优化后结构** (参照 fd-frontend):
```tsx
<header>
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col tablet:flex-row justify-between items-center">
      {/* 左侧: Logo 区域 (1/5) */}
      <div className="flex items-center justify-between w-full lg:w-1/5">
        <Logo />
        <MobileMenuButton />
      </div>
      
      {/* 中间: 导航菜单 (3/5) */}
      <div className="hidden lg:flex items-center justify-center w-full lg:w-3/5">
        <NavigationMenu />
      </div>
      
      {/* 右侧: 工具区域 (1/5) */}
      <div className="hidden lg:flex items-center justify-end w-full lg:w-1/5">
        <UserMenu />
      </div>
    </div>
  </div>
</header>
```

#### 2.2 导航菜单优化

**当前实现**:
- 使用 NavLink 组件
- 固定的导航项
- 简单的激活状态样式

**优化方案** (参照 fd-frontend):
- 提取 NavigationMenu 组件
- 支持子菜单
- 优化激活状态样式
- 添加 hover 动画

#### 2.3 样式优化

**当前样式**:
```tsx
// Header
className="sticky top-0 z-40 border-b border-white/70 bg-white/82 backdrop-blur-xl"

// 导航按钮
className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3.5 py-2.5 text-sm font-bold"
```

**优化后样式** (参照 fd-frontend):
```tsx
// Header
className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-sm"

// 导航按钮
className="text-base font-normal whitespace-nowrap transition-colors duration-200"
```

**主要变更**:
- z-index: 40 → 30
- 背景透明度: 82% → 80%
- 边框: 移除 border-b
- 导航按钮: 简化样式，移除边框和背景

### 3. Footer 优化

#### 3.1 容器宽度统一

**当前**:
```tsx
<div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
```

**优化后**:
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
```

**变更**: 保持 max-w-7xl，但调整内边距顺序以保持一致性

#### 3.2 布局优化

**当前布局**:
```tsx
<div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)]">
```

**优化后布局** (参照 fd-frontend):
```tsx
<div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-6 tablet:gap-8">
```

**变更**: 从 2 列改为 4 列响应式布局，更灵活

### 4. 主内容区优化

#### 4.1 容器统一

**当前**:
```tsx
<main className="mx-auto max-w-consumer px-4 py-10 sm:px-6 lg:px-8">
```

**优化后**:
```tsx
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
```

**变更**: 
- max-w-consumer → max-w-7xl
- 调整类名顺序以保持一致性

### 5. 响应式内边距统一

**统一的内边距规范**:
```tsx
// 标准容器内边距
px-4 sm:px-6 lg:px-8

// 对应的像素值:
// < 640px: 16px
// 640px - 1024px: 24px
// > 1024px: 32px
```

**应用到**:
- Header 容器
- Main 容器
- Footer 容器
- 所有页面内容容器

## 实施步骤

### Phase 1: 创建统一的容器组件
1. 创建 `Container.tsx` 组件
2. 定义统一的容器样式

### Phase 2: 优化 Header
1. 重构 UserShell.tsx 的 Header 部分
2. 提取 NavigationMenu 组件
3. 优化导航样式
4. 统一容器宽度

### Phase 3: 优化 Footer
1. 更新 ConsumerFooter.tsx
2. 统一容器宽度
3. 优化布局结构

### Phase 4: 优化主内容区
1. 更新 UserShell.tsx 的 Main 部分
2. 统一容器宽度
3. 确保所有页面使用统一容器

### Phase 5: 验证对齐
1. 检查 Header、Main、Footer 的左右对齐
2. 测试不同屏幕尺寸
3. 验证响应式布局

## 对齐验证清单

### 桌面端 (> 1024px)
- [ ] Header 左边缘与 Main 左边缘对齐
- [ ] Header 右边缘与 Main 右边缘对齐
- [ ] Main 左边缘与 Footer 左边缘对齐
- [ ] Main 右边缘与 Footer 右边缘对齐
- [ ] 最大宽度都是 1280px

### 平板端 (640px - 1024px)
- [ ] 所有容器内边距都是 24px
- [ ] 左右边缘严格对齐

### 移动端 (< 640px)
- [ ] 所有容器内边距都是 16px
- [ ] 左右边缘严格对齐

## 设计规范

### 容器规范
| 元素 | 最大宽度 | 内边距 |
|------|---------|--------|
| Header | `max-w-7xl` (1280px) | `px-4 sm:px-6 lg:px-8` |
| Main | `max-w-7xl` (1280px) | `px-4 sm:px-6 lg:px-8` |
| Footer | `max-w-7xl` (1280px) | `px-4 sm:px-6 lg:px-8` |

### Header 规范
| 元素 | 样式 |
|------|------|
| 背景 | `bg-white/80 backdrop-blur-sm` |
| 阴影 | `shadow-sm` |
| z-index | `z-30` |
| 定位 | `sticky top-0` |

### 导航规范
| 元素 | 样式 |
|------|------|
| 文字大小 | `text-base` |
| 字体粗细 | `font-normal` |
| 激活颜色 | `text-primary` |
| Hover 颜色 | `hover:text-primary` |

### Footer 规范
| 元素 | 样式 |
|------|------|
| 背景 | `bg-gray-50` |
| 边框 | `border-t border-gray-200` |
| 内边距 | `py-6 tablet:py-8` |

## 预期效果

优化后将实现：

1. ✅ **容器宽度统一**: 所有容器都使用 `max-w-7xl` (1280px)
2. ✅ **内边距统一**: 所有容器都使用 `px-4 sm:px-6 lg:px-8`
3. ✅ **左右严格对齐**: Header、Main、Footer 的左右边缘完全对齐
4. ✅ **响应式一致**: 在所有屏幕尺寸下都保持对齐
5. ✅ **设计统一**: 与 fd-frontend 的设计系统保持一致
6. ✅ **视觉清晰**: 更清晰的视觉层次和布局结构

## 注意事项

1. **保持功能不变**: 只调整 UI，不修改功能逻辑
2. **保持响应式**: 确保在所有设备上都正常显示
3. **保持可访问性**: 保持 ARIA 标签和语义化 HTML
4. **保持性能**: 不增加额外的渲染负担
5. **保持兼容性**: 确保与现有代码兼容

## 相关文档

- [应用页面优化方案](./APP_PAGES_OPTIMIZATION_PLAN.md)
- [应用页面优化完成报告](./APP_PAGES_OPTIMIZATION_COMPLETE.md)
- [UI 优化总结](./UI_OPTIMIZATION_SUMMARY.md)
