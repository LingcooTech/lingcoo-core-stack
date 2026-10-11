import { lazy, Suspense, useRef, useState } from 'react';
import { Button, ConfigProvider, Input, Skeleton, Space } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { AssetImagePickerDialog } from './AssetImagePickerDialog';
const MarkdownEditor = lazy(() => import('@uiw/react-md-editor'));

export function AssetMarkdownField({
  value = '',
  onChange,
  id,
  rich = false,
  rows = 22,
  'aria-label': label = '正文',
}: {
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  rich?: boolean;
  rows?: number;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const { componentDisabled } = ConfigProvider.useConfig();
  const selectImage = (url: string) => {
    if (componentDisabled) return;
    const start = Math.min(selection.current?.start ?? value.length, value.length);
    const end = Math.min(selection.current?.end ?? value.length, value.length);
    const safeUrl = url.replace(/[<>\r\n]/g, encodeURIComponent);
    const image = `\n![图片](<${safeUrl}>)\n`;
    onChange?.(value.slice(0, start) + image + value.slice(end));
    selection.current = { start: start + image.length, end: start + image.length };
  };
  return (
    <div ref={container}>
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        <Button
          icon={<PictureOutlined />}
          onClick={() => {
            const input = container.current?.querySelector('textarea');
            if (input && focused.current)
              selection.current = { start: input.selectionStart, end: input.selectionEnd };
            setOpen(true);
          }}
        >
          插入云存储图片
        </Button>
        {rich ? (
          <Suspense fallback={<Skeleton active />}>
            <MarkdownEditor
              value={value}
              onChange={(next) => onChange?.(next ?? '')}
              height={400}
              textareaProps={{
                id,
                'aria-label': label,
                disabled: componentDisabled,
                onFocus: () => {
                  focused.current = true;
                },
                onSelect: (event) => {
                  const input = event.currentTarget;
                  selection.current = { start: input.selectionStart, end: input.selectionEnd };
                },
              }}
              commandsFilter={(command) =>
                command.name === 'image'
                  ? {
                      ...command,
                      buttonProps: {
                        ...command.buttonProps,
                        'aria-label': '插入云存储图片',
                        title: '插入云存储图片',
                      },
                      execute: (state) => {
                        if (!componentDisabled) {
                          selection.current = state.selection;
                          setOpen(true);
                        }
                      },
                    }
                  : command
              }
            />
          </Suspense>
        ) : (
          <Input.TextArea
            id={id}
            aria-label={label}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onFocus={() => {
              focused.current = true;
            }}
            rows={rows}
            className="font-mono"
            onSelect={(event) => {
              const input = event.currentTarget;
              selection.current = { start: input.selectionStart, end: input.selectionEnd };
            }}
          />
        )}
        <AssetImagePickerDialog
          open={open && !componentDisabled}
          onOpenChange={setOpen}
          onSelect={selectImage}
          title="插入图片"
        />
      </Space>
    </div>
  );
}
