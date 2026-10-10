import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { rotateSettingSecrets } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
export function RotateSecretsButton({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: rotateSettingSecrets,
    onSuccess: (r) => {
      setOpen(false);
      toast.success(r.rotated ? `已轮换 ${r.rotated} 项敏感设置` : '无需轮换');
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button
        variant="outline"
        className="rounded-full"
        disabled={disabled || mutation.isPending}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="size-4" />
        轮换敏感设置密文
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="轮换数据库中的敏感设置密文？"
        description="系统将使用当前主密钥重新加密旧密钥保存的敏感设置。此操作不会展示或更改明文，不会更换 SMTP 密码或存储 AK/SK。"
        confirmText="开始轮换"
        isConfirming={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}
