import { toast as sonner } from 'sonner';

/**
 * 项目内统一的 toast 调用约定，替代散点 toast.success / toast.error。
 *
 * 约定：
 *  - 成功：2.5s 自动消失，不带关闭按钮（操作已完成，不打扰）。
 *  - 错误：4s 自动消失，附关闭按钮，message 优先取 Error.message。
 *  - 警告：3.5s 自动消失，附关闭按钮（半失败、批量任务部分失败等）。
 *  - 信息：2.5s 自动消失（中性提示）。
 *  - promise：自动展示 loading → success / error。
 *
 * 迁移建议：新代码一律走这套 helper；老代码逐步替换 `toast.success(...)` / `toast.error(...)`。
 */

const SUCCESS_DURATION = 2500;
const INFO_DURATION = 2500;
const WARNING_DURATION = 3500;
const ERROR_DURATION = 4000;

export function toastOk(message: string, description?: string) {
  return sonner.success(message, { description, duration: SUCCESS_DURATION });
}

export function toastInfo(message: string, description?: string) {
  return sonner(message, { description, duration: INFO_DURATION });
}

export function toastWarn(message: string, description?: string) {
  return sonner.warning(message, {
    description,
    duration: WARNING_DURATION,
    closeButton: true,
  });
}

export function toastErr(error: unknown, fallback = '操作失败') {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  return sonner.error(message, {
    duration: ERROR_DURATION,
    closeButton: true,
  });
}

/** 包装 Promise 自动 loading → ok / err。 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string | ((data: T) => string); error?: string },
) {
  return sonner.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: (err) =>
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : (messages.error ?? '操作失败'),
  });
}
