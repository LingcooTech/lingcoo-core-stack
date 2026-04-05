import MDEditor from '@uiw/react-md-editor';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';

import { AppEditFaqCard } from './AppEditFaqCard';
import { AppEditHighlightsCard } from './AppEditHighlightsCard';
import { AppEditLinksCard } from './AppEditLinksCard';
import { AppEditSaveBar } from './AppEditSaveBar';
import { AppEditScreenshotsCard } from './AppEditScreenshotsCard';
import type { AppEditFieldSetter, FormState } from './model';

interface AppEditContentTabProps {
  form: FormState;
  setField: AppEditFieldSetter;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditContentTab({
  form,
  setField,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditContentTabProps) {
  return (
    <TabsContent value="content" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>详情内容</CardTitle>
          <CardDescription>使用 Markdown 编辑应用详情页的正文内容。</CardDescription>
        </CardHeader>
        <CardContent>
          <div data-color-mode="light">
            <MDEditor
              value={form.content}
              onChange={(value) => setField('content', value ?? '')}
              height={400}
              style={{ minHeight: 300 }}
            />
          </div>
        </CardContent>
      </Card>

      <AppEditHighlightsCard
        highlights={form.highlights}
        onChange={(value) => setField('highlights', value)}
      />

      <AppEditScreenshotsCard
        screenshots={form.screenshots}
        onChange={(value) => setField('screenshots', value)}
      />

      <AppEditFaqCard faq={form.faq} onChange={(value) => setField('faq', value)} />

      <AppEditLinksCard links={form.links} onChange={(value) => setField('links', value)} />

      <AppEditSaveBar
        title="保存展示内容"
        description="保存 Markdown 正文、亮点、截图、FAQ 和相关链接。"
        isSaving={isSaving}
        disabled={saveDisabled}
        onSave={onSave}
      />
    </TabsContent>
  );
}
