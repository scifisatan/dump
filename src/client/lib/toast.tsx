import { useEffect, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

// Astryx toasts come from a hook. This bridge lets any code raise one, including code outside
// React such as the service-worker update prompt; toasts raised before <ToastBridge> mounts wait.
type Options = { action?: { label: string; onClick: () => void }; persistent?: boolean };
type Show = (body: ReactNode, type: 'info' | 'error', options?: Options) => void;

let show: Show | null = null;
const waiting: Parameters<Show>[] = [];

function raise(...args: Parameters<Show>) {
  if (show) show(...args);
  else waiting.push(args);
}

export const toast = Object.assign(
  (message: ReactNode, options?: Options) => raise(message, 'info', options),
  { error: (message: ReactNode) => raise(message, 'error') },
);

export function ToastBridge() {
  const showToast = useToast();
  useEffect(() => {
    show = (body, type, options) => {
      let dismiss = () => {};
      dismiss = showToast({
        body,
        type,
        isAutoHide: options?.persistent ? false : undefined,
        endContent: options?.action ? (
          <Button
            size="sm"
            label={options.action.label}
            onClick={() => {
              dismiss();
              options.action!.onClick();
            }}
          />
        ) : undefined,
      });
    };
    waiting.splice(0).forEach((args) => show!(...args));
    return () => {
      show = null;
    };
  }, [showToast]);
  return null;
}
