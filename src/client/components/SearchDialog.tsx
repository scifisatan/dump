import { useEffect, useMemo } from 'react';
import { CalendarDays, CheckCheck, FileText, ListFilter, Plus, Settings } from 'lucide-react';
import {
  CommandPalette,
  CommandPaletteInput,
  useCommandPaletteContext,
} from '@astryxdesign/core/CommandPalette';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { SearchSource } from '@astryxdesign/core/Typeahead';
import { fold, search, type Notebook } from '../../core/views';
import type { Dump } from '../../shared/schema';

type Entry = {
  id: string;
  label: string;
  auxiliaryData: {
    group: string;
    /** What a query may match, folded; dumps match through the core's `search` instead. */
    haystack: string;
    dump?: Dump;
    icon: React.ReactNode;
    detail?: string;
    run: () => void;
  };
};

// Every word of the query has to appear in the entry, ignoring case and accents; dumps match
// through the core's `search`, as on the phone and the Mac. An empty query lists everything.
function sourceOf(entries: Entry[], book: Notebook): SearchSource<Entry> {
  return {
    bootstrap: () => entries,
    search: (query) => {
      const words = fold(query).split(/\s+/).filter(Boolean);
      const found = new Set(search(query, book));
      return entries.filter(({ auxiliaryData: { dump, haystack } }) =>
        dump ? found.has(dump) : words.every((word) => haystack.includes(word)),
      );
    },
  };
}

// Opens on the query a tag click asked for, then keeps the app's copy of the query current.
function QueryInput({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const palette = useCommandPaletteContext();
  useEffect(() => {
    if (query) palette?.setSearch(query);
    // Only the opening query; typing goes through onValueChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <CommandPaletteInput
      label="Search dumps"
      placeholder="A thought, a link, a little possibility…"
      onValueChange={(value) => {
        onQueryChange(value);
        palette?.setSearch(value);
      }}
    />
  );
}

export function SearchDialog({
  open,
  onOpenChange,
  initialQuery,
  onQueryChange,
  book,
  navigate,
  select,
  settings,
  newList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onQueryChange: (query: string) => void;
  book: Notebook;
  navigate: (path: string) => void;
  select: (dump: Dump) => void;
  settings: () => void;
  newList: () => void;
}) {
  const entries = useMemo<Entry[]>(() => {
    const entry = (
      id: string,
      label: string,
      group: string,
      icon: React.ReactNode,
      run: () => void,
      haystack = label,
      detail?: string,
      dump?: Dump,
    ): Entry => ({
      id,
      label,
      auxiliaryData: { group, haystack: fold(haystack), icon, detail, run, dump },
    });
    return [
      entry(
        'today',
        'Today',
        'Your space',
        <Icon icon={CalendarDays} size="sm" />,
        () => navigate('/'),
        'Open today home inbox due overdue',
      ),
      entry(
        'done',
        'Done',
        'Your space',
        <Icon icon={CheckCheck} size="sm" />,
        () => navigate('/done'),
        'Open done completed',
      ),
      entry(
        'settings',
        'Settings',
        'Your space',
        <Icon icon={Settings} size="sm" />,
        settings,
        'Open settings appearance import export',
      ),
      entry(
        'new-list',
        'New list',
        'Lists',
        <Icon icon={Plus} size="sm" />,
        newList,
        'New list create',
      ),
      ...book.lists.map((list) =>
        entry(
          `list:${list.id}`,
          list.label,
          'Lists',
          <Icon icon={ListFilter} size="sm" style={{ color: list.color }} />,
          () => navigate(`/lists/${list.id}`),
          `List ${list.label}`,
        ),
      ),
      ...book.dumps.map((dump) =>
        entry(
          `dump:${dump.id}`,
          dump.text,
          'Thoughts & links',
          <Icon icon={FileText} size="sm" />,
          () => select(dump),
          '',
          dump.done ? 'Done' : book.listLabel(dump.list),
          dump,
        ),
      ),
    ];
  }, [book, navigate, select, settings, newList]);
  const source = useMemo(() => sourceOf(entries, book), [entries, book]);
  return (
    <CommandPalette<Entry>
      isOpen={open}
      onOpenChange={onOpenChange}
      label="Find something in your space"
      width={620}
      searchSource={source}
      input={<QueryInput query={initialQuery} onQueryChange={onQueryChange} />}
      emptySearchText="No matches yet. Try a shorter phrase."
      // Picking an entry closes the palette, then runs it.
      onValueChange={(id) => entries.find((entry) => entry.id === id)?.auxiliaryData.run()}
      renderItem={(item) => (
        <HStack gap={2} vAlign="center" className="min-w-0">
          {item.auxiliaryData.icon}
          <VStack gap={0.5} className="min-w-0">
            <Text maxLines={1}>{item.label}</Text>
            {item.auxiliaryData.detail && (
              <Text type="supporting" size="2xs">
                {item.auxiliaryData.detail}
              </Text>
            )}
          </VStack>
        </HStack>
      )}
    />
  );
}
