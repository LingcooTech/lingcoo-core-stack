import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { FormState } from './model';

interface AppEditFaqCardProps {
  faq: FormState['faq'];
  onChange: (value: FormState['faq']) => void;
}

export function AppEditFaqCard({ faq, onChange }: AppEditFaqCardProps) {
  const updateFaq = (index: number, patch: Partial<FormState['faq'][number]>) => {
    const next = [...faq];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>常见问题</CardTitle>
            <CardDescription>最多 30 条 FAQ。</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={faq.length >= 30}
            onClick={() => onChange([...faq, { question: '', answer: '' }])}
          >
            <Plus className="h-4 w-4" />
            添加问题
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {faq.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无常见问题，点击右上角添加。</p>
        ) : null}
        {faq.map((item, index) => (
          <div key={index} className="space-y-2 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Q{index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange(faq.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div>
              <Label>问题</Label>
              <Input
                value={item.question}
                onChange={(event) => updateFaq(index, { question: event.target.value })}
                placeholder="常见问题"
              />
            </div>
            <div>
              <Label>回答</Label>
              <Textarea
                value={item.answer}
                onChange={(event) => updateFaq(index, { answer: event.target.value })}
                placeholder="问题的回答"
                rows={3}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
