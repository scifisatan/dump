import { Asterisk } from 'lucide-react';

// The tilted lime badge and wordmark. Astryx has no logo component; the colours come from the
// theme's accent tokens. `hero` tops the landing page; `compact` sits in the notebook's top bar
// and the landing footer, where `badgeOnPhone` drops the wordmark on narrow screens.
const sizes = {
  hero: {
    word: 'gap-2.75 text-[34px] tracking-[-1.7px] max-phone:text-[26px]',
    badge: 'size-8.75 rounded-[11px]',
    icon: 30,
  },
  compact: {
    word: 'gap-2 text-[22px] tracking-[-1px]',
    badge: 'size-7 rounded-[9px]',
    icon: 20,
  },
};

export function Brand({
  size = 'hero',
  badgeOnPhone = false,
}: {
  size?: keyof typeof sizes;
  badgeOnPhone?: boolean;
}) {
  const { word, badge, icon } = sizes[size];
  return (
    <span className={`inline-flex items-center font-[760] text-primary ${word}`}>
      <span className={`grid -rotate-5 place-items-center bg-accent-bg text-on-accent ${badge}`}>
        <Asterisk size={icon} strokeWidth={2.6} />
      </span>
      <span className={badgeOnPhone ? 'max-phone:hidden' : undefined}>
        dump<span className="text-secondary">.</span>
      </span>
    </span>
  );
}
