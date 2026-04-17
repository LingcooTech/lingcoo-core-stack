# 用户侧布局优化方案

## 概述

参照 fd-frontend 的应用页面布局和样式，对 fd-core-stack 的用户侧应用中心进行布局优化。

## 优化目标

1. **统一布局容器**：使用 `max-w-7xl mx-auto` 作为主容器，与 fd-frontend 保持一致
2. **优化间距系统**：使用标准的 Tailwind 间距，提升视觉呼吸感
3. **改进卡片样式**：简化阴影和边框，使用更清爽的设计
4. **统一颜色使用**：使用 gray 色系，避免过多的颜色变化
5. **优化响应式布局**：确保在各种设备上都有良好的体验

## 主要变更

### 1. 页面容器

**之前：**
```tsx
<div className="space-y-12">
  {/* 内容 */}
</div>
```

**优化后：**
```tsx
<div className="max-w-7xl mx-auto space-y-12 px-4 sm:px-6 lg:px-8">
  {/* 内容 */}
</div>
```

### 2. Hero 区域

**优化点：**
- 简化边框和阴影
- 使用更清晰的颜色对比
- 优化文字行高和间距

**之前：**
```tsx
<div className="rounded-lg border border-gray-200/80 bg-white/92 p-8 shadow-sm shadow-gray-900/5">
```

**优化后：**
```tsx
<div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
```

### 3. 徽章样式

**优化点：**
- 使用更标准的颜色
- 简化字间距
- 统一大小写处理

**之前：**
```tsx
<div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700">
```

**优化后：**
```tsx
<div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-700">
```

### 4. 标题样式

**优化点：**
- 使用 `font-bold` 而不是 `font-semibold`
- 优化行高为 `leading-tight`

**之前：**
```tsx
<h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
```

**优化后：**
```tsx
<h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
```

### 5. 正文样式

**优化点：**
- 使用 `leading-relaxed` 提升可读性

**之前：**
```tsx
<p className="mt-5 max-w-3xl text-base leading-8 text-gray-600 sm:text-lg">
```

**优化后：**
```tsx
<p className="mt-5 max-w-3xl text-base leading-relaxed text-gray-600 sm:text-lg">
```

### 6. 卡片样式

**优化点：**
- 移除不必要的透明度
- 简化阴影效果
- 统一圆角大小

**之前：**
```tsx
<Card className="border-gray-200/80 bg-white/92 shadow-sm shadow-gray-900/5">
```

**优化后：**
```tsx
<Card className="border-gray-200 bg-white shadow-sm">
```

### 7. 应用卡片

**优化点：**
- 使用更清晰的悬停效果
- 优化图标容器样式
- 改进信息层次

**之前：**
```tsx
<Card className="overflow-hidden rounded-lg border-gray-200/80 bg-white/95 shadow-sm shadow-gray-900/5 transition hover:-translate-y-1 hover:shadow-lg">
```

**优化后：**
```tsx
<Card className="overflow-hidden rounded-lg border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-gray-300">
```

### 8. 精选应用区域

**优化点：**
- 简化渐变背景
- 优化文字对比度
- 改进布局间距

**之前：**
```tsx
<div className="relative overflow-hidden border-b border-gray-200/80 bg-gradient-to-br from-slate-900 via-gray-800 to-sky-700 p-8 text-white lg:border-b-0 lg:border-r">
```

**优化后：**
```tsx
<div className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-gray-900 via-gray-800 to-blue-700 p-8 text-white lg:border-b-0 lg:border-r">
```

### 9. 统计卡片

**优化点：**
- 简化背景色
- 优化数字大小
- 改进文字层次

**之前：**
```tsx
<div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
  <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
```

**优化后：**
```tsx
<div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
```

### 10. 按钮样式

**优化点：**
- 统一使用 `font-medium`
- 简化过渡效果

**之前：**
```tsx
<button className="rounded-full border px-4 py-2 text-sm font-bold transition">
```

**优化后：**
```tsx
<button className="rounded-full border px-4 py-2 text-sm font-medium transition-colors">
```

## 详情页优化

### 1. 页面容器

添加最大宽度和居中：

```tsx
<div className="max-w-7xl mx-auto space-y-12 px-4 sm:px-6 lg:px-8">
```

### 2. Hero 区域

**优化点：**
- 简化渐变效果
- 优化信息密度
- 改进响应式布局

### 3. 侧边栏

**优化点：**
- 使用 sticky 定位
- 优化卡片间距
- 改进视觉层次

### 4. 内容区域

**优化点：**
- 使用 prose 样式
- 优化图片展示
- 改进列表样式

## 响应式优化

### 移动端 (< 768px)

- 单列布局
- 增大触摸目标
- 优化间距

### 平板 (768px - 1024px)

- 两列布局
- 适中的间距
- 优化卡片大小

### 桌面 (> 1024px)

- 三列布局
- 宽松的间距
- 最佳的阅读体验

## 实施步骤

1. ✅ 更新 HomePage 的容器和布局
2. ✅ 优化卡片样式和间距
3. ✅ 统一颜色和字体使用
4. ✅ 更新 AppCatalogPage 的布局
5. ✅ 优化详情页的信息层次
6. ✅ 测试响应式布局
7. ✅ 验证无障碍性

## 参考

- fd-frontend 的 shop 页面
- fd-frontend 的 dashboard/apps 页面
- fd-frontend 的 post-type 列表页
- Tailwind CSS 文档

## 注意事项

1. 保持功能不变，只调整布局和样式
2. 确保所有交互正常工作
3. 测试各种屏幕尺寸
4. 验证颜色对比度
5. 检查加载状态和空状态

## 效果对比

### 之前
- 较多的透明度和复杂阴影
- 不一致的间距系统
- 过多的颜色变化
- 较重的视觉风格

### 优化后
- 清爽简洁的设计
- 统一的间距系统
- 一致的颜色使用
- 更好的可读性和层次感
