import { Asterisk } from 'lucide-react';
import { cn } from '../lib/utils';

export function Brand({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.75 text-[34px] font-[760] tracking-[-1.7px]',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-8.75 -rotate-5 place-items-center rounded-[11px] bg-[#d8ee79] text-[#30332b]',
          markClassName,
        )}
      >
        <Asterisk size={30} strokeWidth={2.6} />
      </span>
      <span>
        dump<span className="text-[#919784]">.</span>
      </span>
    </span>
  );
}
