import { Asterisk } from 'lucide-react';

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Asterisk size={30} strokeWidth={2.6} />
      </span>
      <span>
        dump<span className="brand-period">.</span>
      </span>
    </span>
  );
}
