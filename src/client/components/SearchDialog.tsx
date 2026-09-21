import { FileText, Inbox, LayoutDashboard, ListFilter, Settings } from 'lucide-react';
import type { Collection, Dump } from '../../shared/schema';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from './ui/command';

export function SearchDialog({ open, onOpenChange, initialQuery, onQueryChange, dumps, lists, navigate, select, settings }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialQuery: string; onQueryChange: (query: string) => void; dumps: Dump[]; lists: Collection[];
  navigate: (path: string) => void; select: (dump: Dump) => void; settings: () => void;
}) {
  function go(path: string) { navigate(path); onOpenChange(false); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="search-dialog" showCloseButton={false}>
    <DialogTitle className="sr-only">Find something in your space</DialogTitle><DialogDescription className="sr-only">Search thoughts, links, tags, and lists. Use arrow keys to choose a result.</DialogDescription>
    <Command><CommandInput value={initialQuery} onValueChange={onQueryChange} placeholder="A thought, a link, a little possibility…" aria-label="Search dumps" /><CommandList>
      <CommandEmpty>No matches yet. Try a shorter phrase.</CommandEmpty>
      <CommandGroup heading="Your space"><CommandItem value="Open inbox" onSelect={() => go('/')}><Inbox />Inbox</CommandItem><CommandItem value="Open board dashboard" onSelect={() => go('/board')}><LayoutDashboard />Board</CommandItem><CommandItem value="Open settings appearance import export" onSelect={() => { onOpenChange(false); settings(); }}><Settings />Settings</CommandItem></CommandGroup>
      <CommandSeparator /><CommandGroup heading="Lists">{lists.map((list) => <CommandItem key={list.id} value={`List ${list.label}`} onSelect={() => go(`/lists/${list.id}`)}><ListFilter style={{ color: list.color }} />{list.label}</CommandItem>)}</CommandGroup>
      <CommandSeparator /><CommandGroup heading="Thoughts & links">{dumps.map((dump) => <CommandItem key={dump.id} value={`${dump.id} ${dump.text} ${dump.tags.map((tag) => `#${tag}`).join(' ')} ${lists.find((list) => list.id === dump.list)?.label ?? 'Inbox'}`} onSelect={() => { onOpenChange(false); select(dump); }}><FileText /><span className="search-result"><span>{dump.text}</span><small>{dump.done ? 'Done' : lists.find((list) => list.id === dump.list)?.label ?? 'Inbox'}</small></span></CommandItem>)}</CommandGroup>
    </CommandList><div className="search-footer"><span>↑ ↓ to explore · Enter to open</span><kbd>esc</kbd></div></Command>
  </DialogContent></Dialog>;
}
