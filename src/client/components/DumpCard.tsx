import { ArrowUpRight, Check, Circle, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Collection, Dump } from '../../shared/schema';
import { cn } from '../lib/utils';
import { ListDot } from './ListDot';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export type DumpActions = {
  complete: (dump: Dump) => void;
  remove: (dump: Dump) => void;
  file: (dump: Dump, list: string | null) => void;
  tag: (tag: string) => void;
};

export function DumpCard({
  dump,
  lists,
  actions,
  compact = false,
}: {
  dump: Dump;
  lists: Collection[];
  actions: DumpActions;
  compact?: boolean;
}) {
  const list = lists.find((item) => item.id === dump.list);
  return (
    <article
      className={cn(
        'relative flex animate-card-in flex-wrap items-start rounded-[11px] border bg-card shadow-soft',
        compact
          ? 'gap-1.75 px-2.5 py-3.5'
          : 'gap-2.75 px-4 pt-4.75 pb-4 max-phone:gap-2.25 max-phone:px-3 max-phone:py-4.25',
      )}
    >
      <button
        className={cn(
          'min-h-7 shrink-0 pt-0.75 text-muted-foreground opacity-70 hover:text-accent-foreground hover:opacity-100 max-phone:min-h-8',
          compact ? 'w-4' : 'w-5.25',
        )}
        aria-label={dump.done ? `Mark incomplete: ${dump.text}` : `Complete: ${dump.text}`}
        onClick={() => actions.complete(dump)}
      >
        {dump.done ? <Check size={compact ? 15 : 18} /> : <Circle size={compact ? 15 : 19} />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            compact ? 'text-[12px]' : 'text-[14px]',
            'leading-[1.7] whitespace-pre-wrap wrap-anywhere',
            dump.done && 'line-through opacity-60',
          )}
        >
          {dump.text}
        </p>
        <div
          className={cn(
            'mt-2.25 flex flex-wrap items-center gap-2.25 text-muted-foreground',
            compact ? 'text-[9px]' : 'text-[10px]',
          )}
        >
          <time dateTime={new Date(dump.created_at).toISOString()}>
            {formatDistanceToNow(dump.created_at, { addSuffix: true })}
          </time>
          {dump.tags.map((tag) => (
            <button className="text-accent-foreground" key={tag} onClick={() => actions.tag(tag)}>
              #{tag}
            </button>
          ))}
          {dump.url && (
            <a
              className="inline-flex max-w-full items-center gap-0.75 wrap-anywhere"
              href={dump.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {new URL(dump.url).hostname.replace(/^www\./, '')}
              <ArrowUpRight size={12} />
            </a>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'mt-[-1px] size-7 text-muted-foreground max-phone:min-h-8 max-phone:min-w-8',
              compact && 'w-5.25',
            )}
            aria-label={`Actions: ${dump.text}`}
          >
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => actions.file(dump, null)}>
            <ListDot />
            Inbox{!dump.list && <Check className="ml-auto" />}
          </DropdownMenuItem>
          {lists.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => actions.file(dump, item.id)}>
              <ListDot color={item.color} />
              {item.label}
              {item.id === dump.list && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.complete(dump)}>
            <Check />
            {dump.done ? 'Mark incomplete' : 'Mark done'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(dump)}>
            <Trash2 />
            Remove dump
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {list && !compact && (
        <span className="ml-8 flex w-full items-center gap-1.5 text-[10px] text-muted-foreground">
          <ListDot color={list.color} className="size-1.25 min-w-1.25" />
          {list.label}
        </span>
      )}
    </article>
  );
}
