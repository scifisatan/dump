import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';

type Props = Omit<ComponentProps<'a'>, 'href'> & { href?: string; to?: string };

// Astryx renders every link through this (LinkProvider in main.tsx): app paths go through React
// Router, anything else (external links, #anchors) stays a plain anchor.
export function RouterLink({ href, to, ...props }: Props) {
  const target = to ?? href ?? '';
  if (target.startsWith('/') && !target.startsWith('//')) return <Link to={target} {...props} />;
  return <a href={target} {...props} />;
}
