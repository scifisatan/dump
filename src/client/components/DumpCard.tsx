import { ArrowUpRight, Check, Circle, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Collection, Dump } from '../../shared/schema';
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
}: {
  dump: Dump;
  lists: Collection[];
  actions: DumpActions;
}) {
  const list = lists.find((item) => item.id === dump.list);
  return (
    <article className={`dump-card ${dump.done ? 'is-done' : ''}`}>
      <button
        className="done-toggle"
        aria-label={dump.done ? `Mark incomplete: ${dump.text}` : `Complete: ${dump.text}`}
        onClick={() => actions.complete(dump)}
      >
        {dump.done ? <Check size={18} /> : <Circle size={19} />}
      </button>
      <div className="dump-content">
        <p className="dump-text">{dump.text}</p>
        <div className="dump-meta">
          <time dateTime={new Date(dump.created_at).toISOString()}>
            {formatDistanceToNow(dump.created_at, { addSuffix: true })}
          </time>
          {dump.tags.map((tag) => (
            <button className="tag" key={tag} onClick={() => actions.tag(tag)}>
              #{tag}
            </button>
          ))}
          {dump.url && (
            <a className="link-chip" href={dump.url} target="_blank" rel="noopener noreferrer">
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
            className="card-menu"
            aria-label={`Actions: ${dump.text}`}
          >
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => actions.file(dump, null)}>
            <span className="list-dot" />
            Inbox{!dump.list && <Check className="ml-auto" />}
          </DropdownMenuItem>
          {lists.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => actions.file(dump, item.id)}>
              <span className="list-dot" style={{ background: item.color }} />
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
      {list && (
        <span className="card-list-label">
          <span className="list-dot" style={{ background: list.color }} />
          {list.label}
        </span>
      )}
    </article>
  );
}
