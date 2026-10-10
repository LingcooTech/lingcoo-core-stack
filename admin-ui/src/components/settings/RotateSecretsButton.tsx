import { useMutation } from '@tanstack/react-query';
import { App, Button, Modal } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import { rotateSettingSecrets } from '@/api/settings';
export function RotateSecretsButton({ disabled }: { disabled: boolean }) {
  const { message } = App.useApp();
  const [modal, context] = Modal.useModal();
  const mutation = useMutation({
    mutationFn: rotateSettingSecrets,
    onSuccess: (result) => {
      void message.success(result.rotated ? `已轮换 ${result.rotated} 项敏感设置` : '无需轮换');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  return (
    <>
      {context}
      <Button
        icon={<KeyOutlined aria-hidden="true" />}
        disabled={disabled || mutation.isPending}
        onClick={() => {
          modal.confirm({
            title: '轮换数据库中的敏感设置密文？',
            content:
              '系统将使用当前主密钥重新加密旧密钥保存的敏感设置。此操作不会展示或更改明文，不会更换 SMTP 密码或存储 AK/SK。',
            okText: '开始轮换',
            cancelText: '取消',
            onOk: () => mutation.mutateAsync(),
          });
        }}
      >
        轮换敏感设置密文
      </Button>
    </>
  );
}
