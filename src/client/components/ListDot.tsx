// A list's colour mark. The colour is data the owner picked (shared/schema.ts), so it is painted
// inline; the default is the inbox's colour.
const sizes = { sm: 'size-1.5', md: 'size-2', lg: 'size-3' };

export function ListDot({ color, size = 'md' }: { color?: string; size?: keyof typeof sizes }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${sizes[size]}`}
      style={{ background: color ?? '#aca2b7' }}
    />
  );
}
