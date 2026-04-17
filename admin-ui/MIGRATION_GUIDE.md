# UI 重构迁移指南

本指南帮助开发者理解 UI 重构带来的变化，以及如何在新代码中遵循新的设计规范。

## 快速参考

### 圆角 (Border Radius)

| 用途 | 旧样式 | 新样式 |
|------|--------|--------|
| 按钮 | `rounded-xl` | `rounded-md` |
| 输入框 | `rounded-xl` | `rounded-md` |
| 卡片 | `rounded-2xl` | `rounded-lg` |
| 对话框 | `rounded-2xl` | `rounded-lg` |
| 图标容器 | `rounded-[24px]` | `rounded-lg` |
| 徽章 | `rounded-full` | `rounded-full` (不变) |

### 字体粗细 (Font Weight)

| 用途 | 旧样式 | 新样式 |
|------|--------|--------|
| 标题 | `font-black` (900) | `font-semibold` (600) |
| 按钮 | `font-bold` (700) | `font-medium` (500) |
| 标签 | `font-bold` (700) | `font-semibold` (600) |
| 正文 | `font-normal` (400) | `font-normal` (400) (不变) |

### 颜色系统

| 用途 | 旧样式 | 新样式 |
|------|--------|--------|
| 主文本 | `text-slate-950` | `text-gray-900` |
| 次要文本 | `text-slate-600` | `text-gray-600` |
| 辅助文本 | `text-slate-500` | `text-gray-500` |
| 边框 | `border-slate-200` | `border-gray-200` |
| 背景 | `bg-slate-50` | `bg-gray-50` |

### 输入框样式

**旧样式：**
```tsx
<input className="h-9 rounded-xl border border-input focus-visible:ring-1" />
```

**新样式：**
```tsx
<input className="h-10 rounded-md border border-gray-300 focus-visible:ring-2 focus-visible:ring-primary" />
```

### 按钮样式

**旧样式：**
```tsx
<button className="rounded-xl font-bold px-4 py-2">
  点击
</button>
```

**新样式：**
```tsx
<button className="rounded-md font-medium px-4 py-2">
  点击
</button>
```

### 卡片样式

**旧样式：**
```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-5">
  内容
</div>
```

**新样式：**
```tsx
<div className="rounded-lg border border-gray-200 bg-white p-6">
  内容
</div>
```

## 组件使用指南

### Button 组件

```tsx
import { Button } from '@/components/ui/button';

// 主要按钮
<Button variant="default">保存</Button>

// 次要按钮
<Button variant="outline">取消</Button>

// 危险操作
<Button variant="destructive">删除</Button>

// 幽灵按钮
<Button variant="ghost">更多</Button>

// 不同尺寸
<Button size="sm">小按钮</Button>
<Button size="default">默认按钮</Button>
<Button size="lg">大按钮</Button>
```

### Card 组件

```tsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>
    内容区域
  </CardContent>
  <CardFooter>
    底部操作
  </CardFooter>
</Card>
```

### Input 组件

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

<div className="space-y-2">
  <Label htmlFor="email">邮箱</Label>
  <Input 
    id="email" 
    type="email" 
    placeholder="your@email.com"
  />
</div>
```

### Dialog 组件

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>确认操作</DialogTitle>
      <DialogDescription>
        此操作不可撤销，请确认。
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        取消
      </Button>
      <Button onClick={handleConfirm}>
        确认
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## 常见模式

### 表单布局

```tsx
<form className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="name">名称</Label>
    <Input id="name" placeholder="输入名称" />
  </div>
  
  <div className="space-y-2">
    <Label htmlFor="description">描述</Label>
    <Textarea id="description" placeholder="输入描述" />
  </div>
  
  <div className="flex gap-3">
    <Button type="submit">提交</Button>
    <Button type="button" variant="outline">取消</Button>
  </div>
</form>
```

### 列表卡片

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {items.map((item) => (
    <Card key={item.id} className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600">{item.description}</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">查看详情</Button>
      </CardFooter>
    </Card>
  ))}
</div>
```

### 数据表格

```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>名称</TableHead>
      <TableHead>状态</TableHead>
      <TableHead>操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((row) => (
      <TableRow key={row.id}>
        <TableCell>{row.name}</TableCell>
        <TableCell>
          <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
            {row.status}
          </Badge>
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm">编辑</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

## 自定义样式指南

### 使用 Tailwind 类

优先使用 Tailwind 的标准类，而不是自定义值：

**❌ 不推荐：**
```tsx
<div className="rounded-[18px] text-[#333333]">
```

**✅ 推荐：**
```tsx
<div className="rounded-lg text-gray-900">
```

### 间距规范

使用 Tailwind 的标准间距系统：

- `space-y-2` (8px) - 紧密间距
- `space-y-4` (16px) - 标准间距
- `space-y-6` (24px) - 宽松间距
- `space-y-8` (32px) - 很宽松的间距

### 响应式设计

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 移动端 1 列，平板 2 列，桌面 3 列 */}
</div>
```

## 避免的做法

### ❌ 不要使用过大的圆角

```tsx
// 不推荐
<div className="rounded-[32px]">
<div className="rounded-3xl">
```

### ❌ 不要使用过粗的字体

```tsx
// 不推荐
<h1 className="font-black">
<button className="font-bold">
```

### ❌ 不要使用 Slate 颜色

```tsx
// 不推荐
<p className="text-slate-600">
<div className="bg-slate-50">
```

### ❌ 不要使用自定义的字间距

```tsx
// 不推荐
<span className="tracking-[0.24em]">
```

## 迁移现有代码

如果你需要迁移现有代码，可以使用以下 sed 命令：

```bash
# 在组件文件中批量替换
sed -i \
  -e 's/rounded-3xl/rounded-lg/g' \
  -e 's/rounded-2xl/rounded-lg/g' \
  -e 's/rounded-xl/rounded-md/g' \
  -e 's/font-black/font-semibold/g' \
  -e 's/font-bold/font-medium/g' \
  -e 's/text-slate-/text-gray-/g' \
  -e 's/bg-slate-/bg-gray-/g' \
  -e 's/border-slate-/border-gray-/g' \
  your-component.tsx
```

## 获取帮助

如果你在迁移过程中遇到问题：

1. 查看 `UI_REFACTOR_SUMMARY.md` 了解完整的变更列表
2. 参考 `fd-frontend` 项目的实现
3. 查看 `TESTING_CHECKLIST.md` 确保样式正确

## 设计原则

新的 UI 设计遵循以下原则：

1. **简洁性**：使用标准的圆角和间距，避免过度设计
2. **一致性**：所有组件使用统一的设计语言
3. **可读性**：适中的字重和清晰的层次
4. **可访问性**：足够的对比度和清晰的焦点状态
5. **响应式**：在所有设备上都有良好的体验

## 参考资源

- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Radix UI 文档](https://www.radix-ui.com/docs/primitives/overview/introduction)
- fd-frontend 项目设计系统
