import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Asterisk,
  CalendarDays,
  CheckCheck,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useLocation, useNavigate, useMatch } from 'react-router-dom';
import {
  byDay,
  DAY_EXAMPLES,
  dayLabel,
  dueLabel,
  dumpsIn,
  home,
  longDate,
  needsAttention,
  notebook,
  placeOf,
  type Place,
} from '../core/views';
import { parseDue } from '../shared/due';
import { prefixFor, type Collection, type Dump } from '../shared/schema';
import { client, exportDumps, session, useDumpStore } from './store';
import { cn } from './lib/utils';
import { useVisualViewport } from './lib/viewport';
import { Brand } from './components/Brand';
import { DumpCard, type DumpActions } from './components/DumpCard';
import { DraftDue } from './components/DueDate';
import { ListDot } from './components/ListDot';
import { ListEditor } from './components/ListEditor';
import { SearchDialog } from './components/SearchDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { holdBoot } from './boot';
import { TriageDialog } from './components/TriageDialog';
import { Button } from './components/ui/button';

const column = 'mx-auto w-full max-w-190 px-10 max-tablet:px-7 max-phone:px-3.5';
const composer =
  'border border-ring/50 bg-capture shadow-capture focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15';
const hint = 'rounded-[3px] bg-secondary px-1 py-0.5 [font:inherit]';
const pathOf = (place: Place) =>
  place.kind === 'done' ? '/done' : place.kind === 'list' ? `/lists/${place.id}` : '/';

export default function App() {
  const state = useDumpStore();
  const navigate = useNavigate();
  const location = useLocation();
  const listMatch = useMatch('/lists/:id');
  const [draft, setDraft] = useState('');
  const [skippedDue, setSkippedDue] = useState<string | null>(null);
  const [fatal, setFatal] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triage, setTriage] = useState(false);
  const [editor, setEditor] = useState<{ list?: Collection } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shownCount = useRef(0);
  const refocus = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  const atToday = useRef(false);
  useVisualViewport();
  const now = Date.now();
  const book = notebook(state);
  const { lists, unfiled, done: completed } = book;
  const currentList = book.list(listMatch?.params.id ?? null);
  const done = location.pathname === '/done';
  const isHome = !done && !currentList;
  const title = done ? 'Done' : (currentList?.label ?? 'Your space');
  const selectedId = new URLSearchParams(location.search).get('item');
  const plan = home(book, now);
  const todayGroups = plan.sections;
  const showToday = isHome && !selectedId;
  const history = showToday ? plan.earlier : [];
  const place: Place = done
    ? { kind: 'done' }
    : currentList
      ? { kind: 'list', id: currentList.id }
      : { kind: 'home' };
  const selected = showToday
    ? [...history, ...todayGroups.flatMap((group) => group.dumps)]
    : (selectedId ? book.dumps.filter((dump) => dump.id === selectedId) : dumpsIn(place, book))
        .slice()
        .reverse();
  const groups = byDay(showToday ? history : selected).map(({ day, dumps }) => ({
    key: day,
    label: dayLabel(day, now),
    dumps,
  }));
  const draftDue = parseDue(draft, now);
  const shownDue = draftDue === skippedDue ? null : draftDue;
  const empty = state.ready && selected.length === 0 && !showToday;
  const composing = !done;

  useEffect(() => {
    void session.get().ready.then(() => setFatal(session.get().openError ?? ''));
  }, []);
  useLayoutEffect(() => (state.ready || fatal ? undefined : holdBoot()), [state.ready, fatal]);
  useEffect(() => {
    if (state.ready && window.matchMedia('(pointer:fine)').matches) inputRef.current?.focus();
  }, [state.ready]);
  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchQuery('');
        setSearchOpen((open) => !open);
        return;
      }
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useLayoutEffect(() => {
    shownCount.current = 0;
    atBottom.current = true;
    atToday.current = false;
  }, [location.pathname, location.search]);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const count = state.ready ? selected.length : 0;
    if (scroller && count > shownCount.current) {
      const bottom = scroller.scrollHeight - scroller.clientHeight;
      const today = shownCount.current === 0 ? todayRef.current : null;
      const top = today
        ? today.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : bottom;
      scroller.scrollTop = Math.min(top, bottom);
      atToday.current = top < bottom;
      atBottom.current = !atToday.current;
    }
    shownCount.current = count;
    // The composer moves when a view gains or loses its first dump; keep focus with it.
    if (refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  });
  // Late layout changes (web fonts, the phone keyboard) keep the newest dump in view.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, empty]);

  // The dump may have been removed, or its list deleted, on another device meanwhile.
  function act(change: () => void, label: string) {
    try {
      change();
      toast(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change this dump.');
    }
  }
  const actions: DumpActions = {
    complete: (dump) =>
      act(
        () => client.setDone(dump.id, !dump.done),
        dump.done ? 'Marked incomplete' : 'A little less to do',
      ),
    remove: (dump) => act(() => client.remove(dump.id), 'Dump removed'),
    due: (dump, due) =>
      act(
        () => client.setDue(dump.id, due),
        due ? `Moved to ${dueLabel(due, Date.now())}` : 'Date cleared',
      ),
    file: (dump, list) =>
      act(
        () => client.file(dump.id, list),
        list ? `Filed in ${book.list(list)?.label ?? 'your list'}` : 'Moved to inbox',
      ),
    openList: (list) => navigate(`/lists/${list}`),
    tag: (tag) => {
      setSearchQuery(`#${tag}`);
      setSearchOpen(true);
    },
  };
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || !state.ready) return;
    try {
      const dump = client.capture(draft, currentList?.id ?? null, shownDue);
      setDraft('');
      setSkippedDue(null);
      refocus.current = true;
      if (dump.list && dump.list !== currentList?.id)
        toast(`Captured in ${book.list(dump.list)?.label ?? 'your list'}`);
      else if (!dump.list && currentList) toast('Captured in your inbox');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not capture this dump.');
    }
  }
  function openSearch() {
    setSearchQuery('');
    setSearchOpen(true);
  }
  const syncProblem = needsAttention(state);
  const syncText = state.storageError
    ? 'Storage needs attention'
    : state.saving
      ? 'Saving on this device…'
      : state.sync === 'local'
        ? 'Saved on this device'
        : state.sync === 'signed-out'
          ? 'Signed out · saved here'
          : state.sync === 'offline'
            ? 'Offline · saved here'
            : state.sync === 'synced'
              ? state.localServer
                ? 'Saved · local development'
                : 'Everything is synced'
              : state.sync === 'error'
                ? 'Saved here · sync pending'
                : 'Syncing your space…';

  const inputProps = {
    ref: inputRef,
    'aria-label': 'Capture a thought',
    placeholder: 'What’s on your mind?',
    value: draft,
    maxLength: 20_000,
    disabled: !state.ready,
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
      }
    },
  };
  const status = syncProblem ? (
    <span
      className="flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 text-[11px] text-destructive"
      role="status"
      title={syncText}
    >
      <span className="truncate">{syncText}</span>
      {state.sync === 'error' && (
        <button className="shrink-0 font-medium underline" onClick={() => void client.syncNow()}>
          Retry
        </button>
      )}
      {state.sync === 'signed-out' && (
        <button className="shrink-0 font-medium underline" onClick={() => setSettingsOpen(true)}>
          Sign in
        </button>
      )}
    </span>
  ) : (
    <span className="sr-only" role="status">
      {syncText}
    </span>
  );

  function dumpGroup(
    {
      key,
      label,
      dumps,
      overdue,
    }: { key: string; label: string; dumps: Dump[]; overdue?: boolean },
    Heading: 'h2' | 'h3',
  ) {
    return (
      <section key={key} aria-label={label}>
        <Heading
          className={cn(
            'mb-2 px-1 text-[9px] tracking-[1.3px] uppercase',
            overdue ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {label}
        </Heading>
        <div className="divide-y overflow-hidden rounded-[12px] border bg-card shadow-soft">
          {dumps.map((dump) => (
            <DumpCard
              key={dump.id}
              dump={dump}
              lists={lists}
              actions={actions}
              sorting={state.sorting.has(dump.id)}
              showList={!currentList}
            />
          ))}
        </div>
      </section>
    );
  }

  if (fatal)
    return (
      <main className="grid min-h-dvh place-content-center gap-5 text-center text-muted-foreground">
        <Asterisk size={40} />
        <h1>Your space couldn’t open.</h1>
        <p>{fatal}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
    );
  return (
    // Pinned to the visible viewport so the composer rides above the phone keyboard. The height
    // eases with the iOS keyboard's curve and duration, which is longer than other motion here.
    <div className="fixed inset-x-0 top-(--vv-top,0px) h-(--vv-height,100dvh) overflow-hidden pointer-coarse:transition-[height] pointer-coarse:duration-250 pointer-coarse:ease-[cubic-bezier(0.38,0.7,0.125,1)]">
      <main className="flex h-full min-w-0 flex-col">
        <header className="shrink-0 border-b">
          <div className={cn(column, 'flex h-16 items-center gap-2 max-phone:h-14')}>
            {isHome ? (
              <>
                <Link to="/" className="shrink-0" aria-label="Dump home">
                  <Brand
                    className="gap-2 text-[22px] tracking-[-1px] max-phone:[&>span+span]:hidden"
                    markClassName="size-7 rounded-[9px] [&_svg]:size-5"
                  />
                </Link>
                <h1 className="sr-only">{title}</h1>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 shrink-0 text-muted-foreground"
                  asChild
                >
                  <Link to="/" aria-label="Back to your space">
                    <ArrowLeft size={19} />
                  </Link>
                </Button>
                {currentList && <ListDot color={currentList.color} />}
                <h1 className="truncate text-[20px] font-[600] tracking-[-0.6px] max-phone:text-[18px]">
                  {title}
                </h1>
                <span className="text-[12px] text-muted-foreground">{selected.length}</span>
              </>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-1">
              {currentList && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  aria-label="Edit list"
                  onClick={() => setEditor({ list: currentList })}
                >
                  <Pencil size={16} />
                </Button>
              )}
              {done && !selectedId && completed.length > 0 && (
                <Button
                  variant={confirmClear ? 'destructive' : 'outline'}
                  className={cn(
                    'text-[11px]',
                    !confirmClear && 'bg-card text-muted-foreground dark:bg-card',
                  )}
                  onBlur={() => setConfirmClear(false)}
                  onClick={() => {
                    if (!confirmClear) return setConfirmClear(true);
                    setConfirmClear(false);
                    const count = client.clearDone();
                    toast(`Cleared ${count} done ${count === 1 ? 'dump' : 'dumps'}`);
                  }}
                >
                  <Trash2 size={15} />
                  <span>{confirmClear ? `Clear ${completed.length}?` : 'Clear done'}</span>
                </Button>
              )}
              {isHome && unfiled.length > 0 && (
                <Button
                  variant="outline"
                  className="bg-card text-[11px] text-muted-foreground dark:bg-card max-phone:size-9 max-phone:px-0"
                  aria-label="Sort inbox"
                  onClick={() => setTriage(true)}
                >
                  <Sparkles size={15} />
                  <span className="max-phone:hidden">Sort inbox</span>
                </Button>
              )}
              {status}
              <div className="flex items-center gap-0.5 rounded-full border bg-card p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full text-muted-foreground"
                  aria-label="Search your space"
                  title="Search (⌘K)"
                  onClick={openSearch}
                >
                  <Search size={17} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-8 rounded-full text-muted-foreground"
                  aria-label="Settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings size={17} />
                  {syncProblem && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-card"
                    />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </header>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={(event) => {
            const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
            atBottom.current = scrollHeight - scrollTop - clientHeight < (atToday.current ? 1 : 48);
          }}
        >
          <div
            ref={contentRef}
            className={cn(
              column,
              'flex min-h-full flex-col py-6 max-phone:py-4',
              empty ? 'justify-center' : 'justify-end',
            )}
          >
            {state.storageError && (
              <div
                className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-destructive p-3.75 text-[12px] max-phone:flex-col max-phone:items-start"
                role="alert"
              >
                {state.storageError}
                <Button variant="outline" onClick={exportDumps}>
                  Export now
                </Button>
              </div>
            )}
            {state.syncError && (
              <p className="mb-4 text-[12px] text-destructive">{state.syncError}</p>
            )}
            {selectedId && !empty && (
              <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Found in your space</span>
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => navigate(location.pathname)}
                >
                  <X size={13} />
                  Show all
                </button>
              </div>
            )}
            {!state.ready ? (
              <p className="py-10 text-center text-[12px] text-muted-foreground">
                Opening your space…
              </p>
            ) : empty ? (
              <div className="mx-auto w-full max-w-160 pb-[8vh] text-center max-phone:pb-0">
                <div className="mb-5 text-[10px] tracking-[1.8px] text-muted-foreground uppercase">
                  {longDate(now)}
                </div>
                <div className="mx-auto mb-3.75 grid size-14 place-items-center rounded-[18px] bg-secondary text-accent-foreground">
                  {done ? (
                    <CheckCheck size={29} />
                  ) : currentList ? (
                    <ListDot color={currentList.color} className="size-3 min-w-3" />
                  ) : (
                    <CalendarDays size={29} strokeWidth={1.5} />
                  )}
                </div>
                <h2 className="text-[22px] font-[550] tracking-[-0.6px] max-phone:text-[19px]">
                  {done
                    ? 'Small wins will live here.'
                    : currentList
                      ? 'Room for something good.'
                      : 'A clear head.'}
                </h2>
                <p className="mt-2 text-[12px] leading-[1.8] text-muted-foreground">
                  {done
                    ? 'Check off a thought when you’re finished with it.'
                    : currentList
                      ? `Dump something here, or type ${prefixFor(currentList)} anywhere.`
                      : 'Drop a thought, a link, or that thing you don’t want to forget. Give it a day, like “by friday”, and it waits for you in Today.'}
                </p>
                {composing && (
                  <form className={cn(composer, 'mt-7 rounded-[14px] text-left')} onSubmit={submit}>
                    <div className="flex items-start gap-3.5 px-5.5 pt-5.75 max-phone:gap-2.5 max-phone:px-4 max-phone:pt-4.75">
                      <Asterisk size={25} className="mt-0.5 shrink-0 text-accent-foreground" />
                      <textarea
                        {...inputProps}
                        className="max-h-70 min-h-17.75 w-full resize-none border-0 bg-transparent text-[17px] leading-[1.6] outline-none placeholder:text-muted-foreground placeholder:opacity-85 max-phone:text-[16px]"
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2.5 pt-3.25 pr-3.75 pb-3.75 pl-6 max-phone:pt-3 max-phone:pr-3.25 max-phone:pb-3.25 max-phone:pl-4.5">
                      {shownDue ? (
                        <DraftDue due={shownDue} skip={() => setSkippedDue(shownDue)} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Anything goes.
                          <span className="ml-1.75 max-phone:hidden">
                            Try <code className={hint}>!buy</code>,{' '}
                            <code className={hint}>#weekend</code> or{' '}
                            <code className={hint}>by friday</code>
                          </span>
                        </span>
                      )}
                      <Button
                        type="submit"
                        className="text-[11px]"
                        disabled={!draft.trim() || !state.ready}
                        aria-label="Save dump"
                        onPointerDown={(event) => event.preventDefault()}
                      >
                        Dump it
                        <ArrowUp size={17} />
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <>
                {showToday && completed.length > 0 && (
                  <Link
                    to="/done"
                    className="mb-4 self-center text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {completed.length} done →
                  </Link>
                )}
                {!selectedId && !showToday && (
                  <div className="flex flex-1 flex-col items-center justify-center py-14 text-center max-phone:py-10">
                    <div className="text-[10px] tracking-[1.8px] text-muted-foreground uppercase">
                      {new Date(now).toLocaleDateString(undefined, { weekday: 'long' })}
                    </div>
                    <div className="mt-1.5 text-[44px] leading-none font-[600] tracking-[-1.8px] max-phone:text-[36px]">
                      {new Date(now).toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      {done
                        ? `${selected.length} small ${selected.length === 1 ? 'win' : 'wins'}. A little more room in your mind.`
                        : `${selected.length} ${selected.length === 1 ? 'thought' : 'thoughts'} in ${currentList?.label ?? 'your space'}.`}
                    </p>
                  </div>
                )}
                <div className="grid gap-5" aria-label="Dumps">
                  {groups.map((group) => dumpGroup(group, 'h2'))}
                  {showToday && (
                    <section
                      ref={todayRef}
                      aria-label="Today"
                      className={cn('grid gap-5', history.length > 0 && 'mt-3 border-t pt-6')}
                    >
                      <div className="px-1">
                        <h2 className="text-[17px] font-[600] tracking-[-0.4px]">Today</h2>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{plan.heading}</p>
                      </div>
                      {todayGroups.map((group) => dumpGroup(group, 'h3'))}
                      {plan.quiet && (
                        <div className="rounded-[12px] border border-dashed px-5 py-6 text-center max-phone:px-4">
                          <p className="text-[15px] font-[550] tracking-[-0.2px]">A clear day.</p>
                          <p className="mx-auto mt-1 max-w-84 text-[12px] leading-[1.7] text-muted-foreground">
                            Nothing due and nothing dumped yet. Give a dump a day, and it waits for
                            you here when the day comes.
                          </p>
                          <div className="mt-4 flex flex-wrap justify-center gap-2 max-phone:gap-1.75">
                            {DAY_EXAMPLES.map((example) => (
                              <button
                                key={example}
                                className="flex items-center gap-1.5 rounded-[6px] border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setDraft(example);
                                  inputRef.current?.focus();
                                }}
                              >
                                <CalendarDays size={12} />
                                {example}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {!empty && composing && (
          <div className="shrink-0 pb-[max(16px,calc(env(safe-area-inset-bottom)+6px))] keyboard:pb-4">
            <div className={column}>
              <form
                className={cn(composer, 'flex items-end gap-2.5 rounded-[16px] py-1.5 pr-1.5 pl-4')}
                onSubmit={submit}
              >
                <Asterisk size={20} className="mb-2.5 shrink-0 text-accent-foreground" />
                <textarea
                  {...inputProps}
                  className="max-h-50 min-w-0 flex-1 resize-none border-0 bg-transparent py-2 text-[15px] leading-[1.5] outline-none placeholder:text-muted-foreground placeholder:opacity-85 max-phone:text-[16px]"
                  rows={1}
                />
                {shownDue && (
                  <div className="mb-1.5">
                    <DraftDue due={shownDue} skip={() => setSkippedDue(shownDue)} />
                  </div>
                )}
                <Button
                  type="submit"
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  disabled={!draft.trim() || !state.ready}
                  aria-label="Save dump"
                  // Keep focus in the composer so a tap does not close the phone keyboard.
                  onPointerDown={(event) => event.preventDefault()}
                >
                  <ArrowUp size={18} />
                </Button>
              </form>
              <p className="mt-2 px-1 text-[10px] text-muted-foreground max-phone:hidden">
                Enter to dump · Shift Enter for a new line · <code className={hint}>!buy</code>{' '}
                <code className={hint}>#weekend</code> <code className={hint}>by friday</code>
              </p>
            </div>
          </div>
        )}
      </main>
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
        book={book}
        navigate={navigate}
        select={(dump) => navigate(`${pathOf(placeOf(dump))}?item=${dump.id}`)}
        settings={() => setSettingsOpen(true)}
        newList={() => setEditor({})}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        ready={state.ready}
        signedOut={state.sync === 'signed-out'}
      />
      {editor && (
        <ListEditor
          list={editor.list}
          close={() => setEditor(null)}
          saved={(list) => {
            toast(editor.list ? 'List updated' : 'A new home for your thoughts');
            if (!editor.list) navigate(`/lists/${list.id}`);
          }}
          deleted={(list) => {
            toast(`Deleted ${list.label}`);
            navigate('/');
          }}
        />
      )}
      {triage && (
        <TriageDialog
          dumps={unfiled}
          lists={lists}
          actions={actions}
          close={() => setTriage(false)}
        />
      )}
    </div>
  );
}
