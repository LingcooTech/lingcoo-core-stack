#!/bin/bash

# UI 重构样式验证脚本
# 用于快速检查是否还有旧样式残留

echo "🔍 开始验证 UI 样式..."
echo ""

# 检查是否还有大圆角
echo "📐 检查圆角样式..."
LARGE_RADIUS=$(grep -r "rounded-\[" src/ --include="*.tsx" --include="*.ts" | wc -l)
ROUNDED_3XL=$(grep -r "rounded-3xl" src/ --include="*.tsx" --include="*.ts" | wc -l)
ROUNDED_2XL=$(grep -r "rounded-2xl" src/ --include="*.tsx" --include="*.ts" | wc -l)

if [ $LARGE_RADIUS -gt 0 ]; then
  echo "  ⚠️  发现 $LARGE_RADIUS 处使用自定义圆角值 (rounded-[...])"
  grep -r "rounded-\[" src/ --include="*.tsx" --include="*.ts" -n | head -5
else
  echo "  ✅ 未发现自定义圆角值"
fi

if [ $ROUNDED_3XL -gt 0 ]; then
  echo "  ⚠️  发现 $ROUNDED_3XL 处使用 rounded-3xl"
else
  echo "  ✅ 未发现 rounded-3xl"
fi

if [ $ROUNDED_2XL -gt 0 ]; then
  echo "  ⚠️  发现 $ROUNDED_2XL 处使用 rounded-2xl"
else
  echo "  ✅ 未发现 rounded-2xl"
fi

echo ""

# 检查字体粗细
echo "🔤 检查字体粗细..."
FONT_BLACK=$(grep -r "font-black" src/ --include="*.tsx" --include="*.ts" | wc -l)

if [ $FONT_BLACK -gt 0 ]; then
  echo "  ⚠️  发现 $FONT_BLACK 处使用 font-black"
  grep -r "font-black" src/ --include="*.tsx" --include="*.ts" -n | head -5
else
  echo "  ✅ 未发现 font-black"
fi

echo ""

# 检查颜色系统
echo "🎨 检查颜色系统..."
SLATE_COLORS=$(grep -r "slate-" src/ --include="*.tsx" --include="*.ts" | grep -v "// " | wc -l)

if [ $SLATE_COLORS -gt 0 ]; then
  echo "  ⚠️  发现 $SLATE_COLORS 处使用 slate 颜色"
  grep -r "slate-" src/ --include="*.tsx" --include="*.ts" -n | grep -v "// " | head -5
else
  echo "  ✅ 未发现 slate 颜色"
fi

echo ""

# 检查自定义字间距
echo "📏 检查字间距..."
CUSTOM_TRACKING=$(grep -r "tracking-\[" src/ --include="*.tsx" --include="*.ts" | wc -l)

if [ $CUSTOM_TRACKING -gt 0 ]; then
  echo "  ⚠️  发现 $CUSTOM_TRACKING 处使用自定义字间距"
  grep -r "tracking-\[" src/ --include="*.tsx" --include="*.ts" -n | head -5
else
  echo "  ✅ 未发现自定义字间距"
fi

echo ""

# 统计结果
TOTAL_ISSUES=$((LARGE_RADIUS + ROUNDED_3XL + ROUNDED_2XL + FONT_BLACK + SLATE_COLORS + CUSTOM_TRACKING))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $TOTAL_ISSUES -eq 0 ]; then
  echo "✅ 验证通过！所有样式已正确更新。"
else
  echo "⚠️  发现 $TOTAL_ISSUES 处可能需要调整的样式。"
  echo ""
  echo "建议："
  echo "1. 检查上述列出的文件和行号"
  echo "2. 确认是否需要手动调整"
  echo "3. 某些特殊情况可能需要保留旧样式"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查关键文件
echo "📋 检查关键配置文件..."

if grep -q "font-family: -apple-system" src/index.css; then
  echo "  ✅ index.css 字体系统已更新"
else
  echo "  ⚠️  index.css 字体系统可能未更新"
fi

if grep -q "borderRadius:" tailwind.config.ts; then
  echo "  ✅ tailwind.config.ts 圆角配置已更新"
else
  echo "  ⚠️  tailwind.config.ts 圆角配置可能未更新"
fi

echo ""
echo "🎉 验证完成！"
