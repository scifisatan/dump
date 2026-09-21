import { ArrowUpRight, Check, Circle, MoreHorizontal, Trash2 } from 'lucide-react';
import { differenceInHours, differenceInMinutes, format, isToday } from 'date-fns';
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

// Rows sit under a day heading, so today's rows show a short age and older rows their time.
function shortTime(time: number) {
  if (!isToday(time)) return format(time, 'h:mm a');
  const minutes = differenceInMinutes(Date.now(), time);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${differenceInHours(Date.now(), time)}h`;
}

export function DumpCard({
  dump,
  lists,
  actions,
  showList = true,
  sorting = false,
}: {
  dump: Dump;
  lists: Collection[];
  actions: DumpActions;
  showList?: boolean;
  // Jev is still choosing this dump's list.
  sorting?: boolean;
}) {
  const list = showList ? lists.find((item) => item.id === dump.list) : undefined;
  const hasMeta = list || sorting || dump.tags.length > 0 || dump.url;
  return (
    <article className="group flex animate-card-in items-start gap-2.5 px-3.5 py-2.5 hover:bg-muted/40 max-phone:gap-2 max-phone:px-3">
      <button
        className="grid min-h-6 w-5 shrink-0 place-items-center text-muted-foreground opacity-70 hover:text-accent-foreground hover:opacity-100 max-phone:min-h-8"
        aria-label={dump.done ? `Mark incomplete: ${dump.text}` : `Complete: ${dump.text}`}
        onClick={() => actions.complete(dump)}
      >
        {dump.done ? <Check size={16} /> : <Circle size={17} />}
      </button>
      <div className="min-w-0 flex-1 py-0.5 max-phone:py-1">
        <p
          className={cn(
            'text-[14px] leading-[1.5] whitespace-pre-wrap wrap-anywhere',
            dump.done && 'line-through opacity-60',
          )}
        >
          {dump.text}
        </p>
        {hasMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {list && (
              <span className="flex items-center gap-1.25">
                <ListDot color={list.color} className="size-1.5 min-w-1.5" />
                {list.label}
              </span>
            )}
            {sorting && !list && (
              <span className="flex items-center gap-1.25">
                <span className="size-1.5 rounded-full bg-ring motion-safe:animate-pulse" />
                Sorting…
              </span>
            )}
            {dump.tags.map((tag) => (
              <button className="text-accent-foreground" key={tag} onClick={() => actions.tag(tag)}>
                #{tag}
              </button>
            ))}
            {dump.url && (
              <a
                className="inline-flex max-w-full items-center gap-0.75 rounded-[4px] bg-muted px-1.5 py-0.25 wrap-anywhere hover:text-foreground"
                href={dump.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {new URL(dump.url).hostname.replace(/^www\./, '')}
                <ArrowUpRight size={11} />
              </a>
            )}
          </div>
        )}
      </div>
      <time
        className="shrink-0 pt-1 text-[11px] text-muted-foreground tabular-nums max-phone:pt-1.5"
        dateTime={new Date(dump.created_at).toISOString()}
        title={format(dump.created_at, 'PPpp')}
      >
        {shortTime(dump.created_at)}
      </time>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100 max-phone:size-8"
            aria-label={`Actions: ${dump.text}`}
          >
            <MoreHorizontal size={17} />
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
    </article>
  );
}
