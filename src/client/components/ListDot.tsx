import { cn } from '../lib/utils';

export function ListDot({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 min-w-2 rounded-full bg-[#aca2b7]', className)}
      style={color ? { background: color } : undefined}
    />
  );
}
