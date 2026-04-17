# 视觉变更对比指南

本文档提供了 UI 优化前后的视觉对比，帮助快速理解变更内容。

---

## 1. 应用卡片（AppCard）

### 变更前
```tsx
// 卡片容器
className="rounded-[28px] hover:shadow-lg"

// 渐变背景
className="from-slate-50 via-sky-50/70 to-transparent"

// 图标
className="h-24 w-24 rounded-[22%]"
```

### 变更后
```tsx
// 卡片容器
className="rounded-xl hover:shadow-md"

// 渐变背景
className="from-slate-100 via-sky-50/80 to-white"

// 图标（尺寸保持不变）
className="h-24 w-24 rounded-[22%]"
```

### 视觉效果
- **圆角**: 从 28px 减小到 12px（rounded-xl），更符合现代设计
- **阴影**: 从 shadow-lg 减弱到 shadow-md，更加柔和
- **渐变**: 起始色更深（slate-100），透明度更高（80%），结束色为白色而非透明

---

## 2. 应用列表页（HomePage）

### 2.1 页面容器

#### 变更前
```tsx
<div className="space-y-10">
  {/* 内容 */}
</div>
```

#### 变更后
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <div className="space-y-10">
    {/* 内容 */}
  </div>
</div>
```

### 视觉效果
- **最大宽度**: 添加 1280px 的最大宽度限制
- **居中对齐**: 内容在超宽屏上居中显示
- **响应式边距**: 移动端 16px，平板 24px，桌面 32px

---

### 2.2 分类筛选栏

#### 变更前
```tsx
<button className="rounded-full px-4 py-2 text-sm">
  全部应用
</button>
```

#### 变更后
```tsx
<button className="rounded-md px-3 py-1.5 text-[15px]">
  全部应用
</button>
```

### 视觉效果
- **圆角**: 从圆形（rounded-full）改为圆角矩形（rounded-md）
- **内边距**: 从 16px 8px 减小到 12px 6px
- **文字大小**: 从 14px 增大到 15px
- **按钮间距**: 从 12px 增大到 32px

---

### 2.3 热门应用轮播

#### 变更前
```tsx
// 卡片
<div className="rounded-[28px]">
  {/* 图标 */}
  <img className="h-28 w-28" />
  
  {/* 渐变背景 */}
  <div className="bg-[radial-gradient(...)]" />
  
  {/* 价格卡片 */}
  <div className="rounded-[24px]">
    <p className="tracking-[0.08em]">起始价格</p>
  </div>
</div>
```

#### 变更后
```tsx
// 卡片
<div className="rounded-xl">
  {/* 图标 */}
  <img className="h-32 w-32" />
  
  {/* 渐变背景 */}
  <div className="from-slate-100 via-sky-50/80 to-white" />
  
  {/* 价格卡片 */}
  <div className="rounded-xl">
    <p className="tracking-wide">起始价格</p>
  </div>
</div>
```

### 视觉效果
- **卡片圆角**: 从 28px 减小到 12px
- **图标尺寸**: 从 112px 增大到 128px（更突出）
- **渐变背景**: 简化为线性渐变，更清晰
- **价格卡片**: 圆角从 24px 减小到 12px
- **字间距**: 从 0.08em 改为标准 tracking-wide

---

## 3. 应用详情页（AppCatalogPage）

### 3.1 页面容器

#### 变更前
```tsx
<div className="space-y-6">
  {/* 内容 */}
</div>
```

#### 变更后
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <div className="space-y-6">
    {/* 内容 */}
  </div>
</div>
```

### 视觉效果
- 与列表页保持一致的容器宽度和边距

---

### 3.2 Hero 区域

#### 变更前
```tsx
<section className="-mx-4 sm:-mx-6 lg:-mx-8 from-slate-100 via-sky-50/75 to-white">
  <div className="xl:grid-cols-[minmax(0,1fr),300px]">
    <div className="md:grid-cols-[112px,minmax(0,1fr)]">
      <img className="h-28 w-28" />
    </div>
  </div>
</section>
```

#### 变更后
```tsx
<section className="w-full -mx-4 sm:-mx-6 lg:-mx-8 from-slate-100 via-sky-50/80 to-white">
  <div className="xl:grid-cols-[minmax(0,1fr),320px]">
    <div className="md:grid-cols-[128px,minmax(0,1fr)]">
      <img className="h-32 w-32" />
    </div>
  </div>
</section>
```

### 视觉效果
- **全屏宽度**: 添加 w-full 确保全屏显示
- **渐变透明度**: 从 75% 增加到 80%
- **图标尺寸**: 从 112px 增大到 128px
- **侧边栏宽度**: 从 300px 增大到 320px

---

### 3.3 Tab 导航

#### 变更前
```tsx
<button className={`
  ${activeTab === 'intro' 
    ? 'border-sky-500 text-sky-600' 
    : 'border-transparent text-gray-500'
  }
`}>
  应用介绍
</button>
```

#### 变更后
```tsx
<button className={`
  ${activeTab === 'intro' 
    ? 'border-blue-500 text-blue-600' 
    : 'border-transparent text-gray-500'
  }
`}>
  应用介绍
</button>
```

### 视觉效果
- **激活颜色**: 从 sky-500/600 改为 blue-500/600
- **更统一**: 与 fd-frontend 的主色调保持一致

---

### 3.4 内容区域布局

#### 变更前
```tsx
<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr),280px]">
  <div className="min-w-0">
    {/* 主内容 */}
  </div>
  <aside className="w-full shrink-0">
    {/* 侧边栏 */}
  </aside>
</div>
```

#### 变更后
```tsx
<div className="flex flex-col lg:flex-row gap-8">
  <div className="flex-1 min-w-0 lg:max-w-[calc(100%-320px-2rem)]">
    {/* 主内容 */}
  </div>
  <aside className="w-full shrink-0 lg:w-80">
    {/* 侧边栏 */}
  </aside>
</div>
```

### 视觉效果
- **布局方式**: 从 grid 改为 flex，更灵活
- **间距**: 从 40px 减小到 32px
- **侧边栏宽度**: 从 280px 增大到 320px（lg:w-80）
- **主内容区**: 添加最大宽度限制，防止过宽

---

### 3.5 卡片圆角统一

#### 变更前
```tsx
// 功能卡片
<div className="rounded-2xl">

// FAQ 卡片
<div className="rounded-2xl">

// 资源卡片
<div className="rounded-2xl">

// 侧边栏卡片
<div className="rounded-2xl">

// 价格卡片
<div className="rounded-[24px]">
```

#### 变更后
```tsx
// 所有卡片统一
<div className="rounded-xl">
```

### 视觉效果
- **统一圆角**: 所有卡片都使用 rounded-xl（12px）
- **视觉一致**: 整个页面的圆角规范统一

---

### 3.6 Hover 效果优化

#### 变更前
```tsx
// 资源卡片
<div className="hover:border-sky-200 hover:bg-sky-50/40">

// 截图卡片
<div className="hover:border-sky-200">
```

#### 变更后
```tsx
// 资源卡片
<div className="hover:border-blue-200 hover:bg-blue-50/40">

// 截图卡片
<div className="hover:border-blue-200">
```

### 视觉效果
- **颜色统一**: 从 sky 改为 blue，与主色调一致

---

## 4. 设计规范对比表

### 圆角规范

| 元素 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 应用卡片 | `rounded-[28px]` (28px) | `rounded-xl` (12px) | ⬇️ 减小 |
| 价格卡片 | `rounded-[24px]` (24px) | `rounded-xl` (12px) | ⬇️ 减小 |
| 功能卡片 | `rounded-2xl` (16px) | `rounded-xl` (12px) | ⬇️ 减小 |
| 分类按钮 | `rounded-full` (圆形) | `rounded-md` (6px) | ⬇️ 减小 |
| 操作按钮 | `rounded-2xl` (16px) | `rounded-xl` (12px) | ⬇️ 减小 |

### 颜色规范

| 用途 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| Tab 激活 | `sky-500/600` | `blue-500/600` | 🔄 更换 |
| 链接 hover | `sky-200/50` | `blue-200/50` | 🔄 更换 |
| 分类 Badge | `sky-50/700` | `sky-50/700` | ✅ 保持 |
| 中性色 | `gray-*` | `gray-*` | ✅ 保持 |

### 尺寸规范

| 元素 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 列表页图标 | 96px | 96px | ✅ 保持 |
| 详情页图标 | 112px | 128px | ⬆️ 增大 |
| 轮播图标 | 112px | 128px | ⬆️ 增大 |
| 侧边栏宽度 | 280px/300px | 320px | ⬆️ 增大 |
| 页面最大宽度 | 无限制 | 1280px | ➕ 新增 |

### 间距规范

| 元素 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 分类按钮间距 | `gap-3` (12px) | `gap-8` (32px) | ⬆️ 增大 |
| 内容区间距 | `gap-10` (40px) | `gap-8` (32px) | ⬇️ 减小 |
| 字间距 | `tracking-[0.08em]` | `tracking-wide` | 🔄 标准化 |

### 阴影规范

| 元素 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 卡片 hover | `shadow-lg` | `shadow-md` | ⬇️ 减弱 |
| 卡片默认 | `shadow-sm` | `shadow-sm` | ✅ 保持 |

---

## 5. 响应式变化

### 移动端（< 640px）
- ✅ 页面边距: 16px
- ✅ 单列布局
- ✅ 图标尺寸: 保持不变
- ✅ 分类筛选: 横向滚动

### 平板端（640px - 1024px）
- ✅ 页面边距: 24px
- ✅ 2列网格布局
- ✅ 图标尺寸: 保持不变
- ✅ 分类筛选: 横向滚动

### 桌面端（1024px - 1440px）
- ✅ 页面边距: 32px
- ✅ 3列网格布局
- ✅ 图标尺寸: 增大到 128px
- ✅ 侧边栏: 320px 固定宽度

### 超宽屏（> 1440px）
- ✅ 页面最大宽度: 1280px
- ✅ 内容居中显示
- ✅ 保持桌面端布局

---

## 6. 视觉层次优化

### 优化前的问题
1. 圆角过大（28px），显得笨重
2. 阴影过强（shadow-lg），视觉噪音大
3. 渐变背景复杂，层次不清晰
4. 颜色不统一（sky 和 blue 混用）
5. 字间距不规范（自定义值）

### 优化后的改进
1. ✅ 圆角适中（12px），更现代
2. ✅ 阴影柔和（shadow-md），更舒适
3. ✅ 渐变简洁，层次清晰
4. ✅ 颜色统一（blue 主色调）
5. ✅ 字间距标准（tracking-wide）

---

## 7. 快速检查清单

在浏览器中打开页面后，检查以下内容：

### 应用列表页（HomePage）
- [ ] 页面内容在超宽屏上居中显示（最大宽度 1280px）
- [ ] 分类筛选按钮是圆角矩形（不是圆形）
- [ ] 分类按钮间距较大（32px）
- [ ] 热门应用的图标是 128px（较大）
- [ ] 轮播卡片的圆角是 12px（不是 28px）
- [ ] 应用卡片的圆角是 12px（不是 28px）
- [ ] 卡片 hover 时阴影适中（不是很强）

### 应用详情页（AppCatalogPage）
- [ ] 页面内容在超宽屏上居中显示（最大宽度 1280px）
- [ ] Hero 区域的图标是 128px（较大）
- [ ] Tab 激活时是蓝色（不是天蓝色）
- [ ] 侧边栏宽度是 320px（较宽）
- [ ] 所有卡片的圆角都是 12px
- [ ] 资源卡片 hover 时是蓝色边框（不是天蓝色）
- [ ] 价格卡片的圆角是 12px（不是 24px）

### 响应式检查
- [ ] 移动端（375px）: 单列布局，边距 16px
- [ ] 平板端（768px）: 2列布局，边距 24px
- [ ] 桌面端（1440px）: 3列布局，边距 32px
- [ ] 超宽屏（1920px）: 内容居中，最大宽度 1280px

---

## 8. 常见问题

### Q: 为什么要减小圆角？
A: 28px 的圆角在现代设计中显得过大，12px（rounded-xl）更符合当前的设计趋势，也与 fd-frontend 保持一致。

### Q: 为什么要增大图标尺寸？
A: 128px 的图标在详情页和轮播中更突出，提升视觉层次，也与 fd-frontend 的设计保持一致。

### Q: 为什么要统一使用 blue 而不是 sky？
A: blue 是 fd-frontend 的主色调，统一使用 blue 可以保持设计系统的一致性。

### Q: 为什么要添加页面最大宽度？
A: 在超宽屏上，无限宽的内容会导致阅读困难。1280px 的最大宽度是最佳的阅读宽度。

### Q: 为什么要简化渐变背景？
A: 复杂的 radial-gradient 会增加视觉噪音，简单的线性渐变更清晰，也更容易维护。

---

## 9. 浏览器开发者工具检查

### 检查圆角
```javascript
// 在浏览器控制台运行
document.querySelectorAll('[class*="rounded"]').forEach(el => {
  console.log(el.className);
});
```

### 检查颜色
```javascript
// 检查所有使用 sky 颜色的元素
document.querySelectorAll('[class*="sky-"]').forEach(el => {
  console.log(el.className);
});

// 检查所有使用 blue 颜色的元素
document.querySelectorAll('[class*="blue-"]').forEach(el => {
  console.log(el.className);
});
```

### 检查尺寸
```javascript
// 检查图标尺寸
document.querySelectorAll('img[alt*="图标"], img[alt*="icon"]').forEach(el => {
  console.log(`${el.alt}: ${el.offsetWidth}x${el.offsetHeight}`);
});
```

---

## 10. 总结

本次 UI 优化主要聚焦于：

1. **简化设计**: 减小圆角、减弱阴影、简化渐变
2. **统一规范**: 统一颜色、统一间距、统一字间距
3. **提升层次**: 增大图标、优化布局、添加容器
4. **保持一致**: 与 fd-frontend 的设计系统对齐

所有变更都遵循"只调整 UI，不修改功能"的原则，确保用户体验的连续性。
