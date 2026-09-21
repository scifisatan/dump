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
  ArrowUp,
  Asterisk,
  Check,
  CheckCheck,
  Inbox,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { format, isToday, isYesterday, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { Link, NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import type { Collection, Dump } from '../shared/schema';
import {
  capture,
  clearDone,
  exportDumps,
  initializeStore,
  syncNow,
  updateDump,
  useDumpStore,
} from './store';
import { cn } from './lib/utils';
import { useVisualViewport } from './lib/viewport';
import { Brand } from './components/Brand';
import { DumpCard, type DumpActions } from './components/DumpCard';
import { ListDot } from './components/ListDot';
import { ListEditor } from './components/ListEditor';
import { SearchDialog } from './components/SearchDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { TriageDialog } from './components/TriageDialog';
import { Button } from './components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from './components/ui/sheet';

const navItem =
  'mb-0.75 flex min-h-10 w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] text-muted-foreground max-phone:min-h-11';
const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(navItem, isActive ? 'bg-secondary font-[550] text-secondary-foreground' : 'hover:bg-muted');
const navCount = 'ml-auto text-[11px] font-normal opacity-80';
const column = 'mx-auto w-full max-w-190 px-10 max-tablet:px-7 max-phone:px-3.5';
// The composer is the main action, so it carries a lime-tinted edge and a lifted shadow.
const composer =
  'border border-ring/50 bg-capture shadow-capture focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15';
const hint = 'rounded-[3px] bg-secondary px-1 py-0.5 [font:inherit]';

function dayLabel(time: number) {
  if (isToday(time)) return 'Today';
  if (isYesterday(time)) return 'Yesterday';
  return format(
    time,
    new Date(time).getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'EEEE, MMMM d, y',
  );
}
// Dumps arrive oldest first, so each day's group is contiguous.
function byDay(dumps: Dump[]) {
  const days: { day: number; dumps: Dump[] }[] = [];
  for (const dump of dumps) {
    const day = startOfDay(dump.created_at).getTime();
    const last = days.at(-1);
    if (last?.day === day) last.dumps.push(dump);
    else days.push({ day, dumps: [dump] });
  }
  return days;
}

const homeOf = (dump: Dump) => (dump.done ? '/done' : dump.list ? `/lists/${dump.list}` : '/');

export default function App() {
  const state = useDumpStore();
  const navigate = useNavigate();
  const location = useLocation();
  const listMatch = useMatch('/lists/:id');
  const [draft, setDraft] = useState('');
  const [fatal, setFatal] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triage, setTriage] = useState(false);
  const [editor, setEditor] = useState<{ list?: Collection } | null>(null);
  // Clearing is final, so the first click only arms the button.
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shownCount = useRef(0);
  const refocus = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useVisualViewport();
  const lists = state.lists.filter((list) => !list.deleted);
  const active = state.dumps.filter((dump) => !dump.deleted);
  // The inbox shows every open dump with its list; `unfiled` only feeds Sort inbox, and leaves
  // out dumps Jev is still sorting so the button does not flash after each capture.
  const open = active.filter((dump) => !dump.done);
  const unfiled = open.filter((dump) => dump.list === null && !state.sorting.has(dump.id));
  const completed = active.filter((dump) => dump.done);
  const currentList = lists.find((list) => list.id === listMatch?.params.id);
  const done = location.pathname === '/done';
  const isInbox = !done && !currentList;
  const title = done ? 'Done' : (currentList?.label ?? 'Inbox');
  const selectedId = new URLSearchParams(location.search).get('item');
  // Newest dumps sit at the bottom, next to the composer, like a chat.
  const selected = active
    .filter((dump) =>
      selectedId
        ? dump.id === selectedId
        : done
          ? dump.done
          : currentList
            ? dump.list === currentList.id && !dump.done
            : !dump.done,
    )
    .reverse();
  // An empty view centers a larger composer; otherwise it is pinned below the dumps.
  const empty = state.ready && selected.length === 0;
  // Done is a record of finished dumps, not a place to capture new ones.
  const composing = !done;

  useEffect(() => {
    void initializeStore().catch((error) =>
      setFatal(error instanceof Error ? error.message : 'Could not open local storage.'),
    );
  }, []);
  useEffect(() => {
    if (state.ready && window.matchMedia('(pointer:fine)').matches) inputRef.current?.focus();
  }, [state.ready]);
  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMenuOpen(false);
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
  // Open each view at its newest dump; follow new dumps only when they are added.
  useLayoutEffect(() => {
    shownCount.current = 0;
    atBottom.current = true;
  }, [location.pathname, location.search]);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const count = state.ready ? selected.length : 0;
    if (scroller && count > shownCount.current) scroller.scrollTop = scroller.scrollHeight;
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
  // Grow the composer with its text, up to the max height set in its classes.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, empty]);

  function act(dump: Dump, changes: Parameters<typeof updateDump>[1], label: string) {
    updateDump(dump.id, changes);
    toast(label);
  }
  const actions: DumpActions = {
    complete: (dump) =>
      act(dump, { done: !dump.done }, dump.done ? 'Marked incomplete' : 'A little less to do'),
    remove: (dump) => act(dump, { deleted: true }, 'Dump removed'),
    file: (dump, list) =>
      act(
        dump,
        { list, classified_by: 'user' },
        list
          ? `Filed in ${lists.find((item) => item.id === list)?.label ?? 'your list'}`
          : 'Moved to inbox',
      ),
    tag: (tag) => {
      setSearchQuery(`#${tag}`);
      setSearchOpen(true);
    },
  };
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || !state.ready) return;
    try {
      const dump = capture(draft);
      setDraft('');
      refocus.current = true;
      if (dump.list && dump.list !== currentList?.id)
        toast(`Captured in ${lists.find((list) => list.id === dump.list)?.label ?? 'your list'}`);
      else if (!dump.list && !isInbox) toast('Captured in your inbox');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not capture this dump.');
    }
  }
  function newList() {
    setMenuOpen(false);
    setEditor({});
  }
  function openSearch() {
    setMenuOpen(false);
    setSearchQuery('');
    setSearchOpen(true);
  }
  const syncPhase =
    state.storageError || state.sync === 'offline' || state.sync === 'error'
      ? 'problem'
      : state.saving || state.sync !== 'synced'
        ? 'busy'
        : 'ok';
  const syncText = state.storageError
    ? 'Storage needs attention'
    : state.saving
      ? 'Saving on this device…'
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
  const status = (
    <span
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px]',
        syncPhase === 'problem' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground',
      )}
      role="status"
      title={syncText}
    >
      {syncPhase === 'busy' ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : syncPhase === 'ok' ? (
        <Check size={16} className="text-accent-foreground" />
      ) : (
        <X size={16} />
      )}
      <span className={syncPhase === 'problem' ? 'max-phone:sr-only' : 'sr-only'}>{syncText}</span>
      {state.sync === 'error' && (
        <button className="font-medium underline" onClick={() => void syncNow()}>
          Retry
        </button>
      )}
    </span>
  );

  const navigation = (
    <>
      <Link to="/" className="self-start" onClick={() => setMenuOpen(false)} aria-label="Dump home">
        <Brand />
      </Link>
      <button
        className={cn(navItem, 'mt-7 mb-3 border bg-card hover:bg-muted')}
        onClick={openSearch}
        aria-label="Search your space"
      >
        <Search size={17} />
        <span>Search</span>
        <kbd className="ml-auto max-phone:hidden">⌘K</kbd>
      </button>
      <nav aria-label="Main navigation">
        <NavLink end to="/" className={navLink} onClick={() => setMenuOpen(false)}>
          <Inbox size={18} />
          <span className="truncate">Inbox</span>
          {open.length > 0 && <span className={navCount}>{open.length}</span>}
        </NavLink>
        <div className="mt-6 mb-1.25 flex items-center justify-between pl-3 text-[9px] tracking-[1.3px] text-muted-foreground">
          <span>YOUR LISTS</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Create new list"
            onClick={newList}
            disabled={!state.ready}
          >
            <Plus size={16} />
          </Button>
        </div>
        {lists.map((list) => {
          const count = active.filter((dump) => dump.list === list.id && !dump.done).length;
          return (
            <NavLink
              key={list.id}
              to={`/lists/${list.id}`}
              className={navLink}
              onClick={() => setMenuOpen(false)}
            >
              <ListDot color={list.color} className="mx-1.25" />
              <span className="truncate">{list.label}</span>
              {count > 0 && <span className={navCount}>{count}</span>}
            </NavLink>
          );
        })}
        <div className="mx-3 my-4.75 h-px bg-border" />
        <NavLink to="/done" className={navLink} onClick={() => setMenuOpen(false)}>
          <CheckCheck size={18} />
          <span className="truncate">Done</span>
          {completed.length > 0 && <span className={navCount}>{completed.length}</span>}
        </NavLink>
      </nav>
      <button
        className={cn(navItem, 'mt-auto hover:bg-muted max-phone:mb-[env(safe-area-inset-bottom)]')}
        onClick={() => {
          setMenuOpen(false);
          setSettingsOpen(true);
        }}
      >
        <Settings size={18} />
        <span>Settings</span>
      </button>
    </>
  );

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
      <aside className="fixed inset-y-0 left-0 z-20 flex w-59.5 flex-col overflow-y-auto overscroll-contain border-r bg-sidebar px-4.5 pt-7.75 pb-4.5 max-tablet:w-53 max-tablet:px-3.25 max-phone:hidden">
        {navigation}
      </aside>
      <main className="ml-59.5 flex h-full min-w-0 flex-col max-tablet:ml-53 max-phone:ml-0">
        <header className="shrink-0 border-b">
          <div className={cn(column, 'flex h-16 items-center gap-2 max-phone:h-14')}>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 hidden max-phone:inline-flex"
                  aria-label="Open navigation"
                >
                  <Menu size={21} />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[min(300px,85vw)] gap-0 overflow-y-auto bg-sidebar px-4.5 pt-7 pb-6"
              >
                <SheetTitle className="sr-only">Your space</SheetTitle>
                <SheetDescription className="sr-only">
                  Navigate your inbox and lists.
                </SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            {currentList && <ListDot color={currentList.color} />}
            <h1 className="truncate text-[20px] font-[600] tracking-[-0.6px] max-phone:text-[18px]">
              {title}
            </h1>
            <span className="text-[12px] text-muted-foreground">{selected.length}</span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
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
                    const count = clearDone();
                    toast(`Cleared ${count} done ${count === 1 ? 'dump' : 'dumps'}`);
                  }}
                >
                  <Trash2 size={15} />
                  <span>{confirmClear ? `Clear ${completed.length}?` : 'Clear done'}</span>
                </Button>
              )}
              {isInbox && unfiled.length > 0 && (
                <Button
                  variant="outline"
                  className="bg-card text-[11px] text-muted-foreground dark:bg-card"
                  onClick={() => setTriage(true)}
                >
                  <Sparkles size={15} />
                  <span>Sort inbox</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="hidden text-muted-foreground max-phone:inline-flex"
                aria-label="Search your space"
                onClick={openSearch}
              >
                <Search size={19} />
              </Button>
              {status}
            </div>
          </div>
        </header>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={(event) => {
            const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
            atBottom.current = scrollHeight - scrollTop - clientHeight < 48;
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
                  {format(new Date(), 'EEEE, MMMM d')}
                </div>
                <div className="mx-auto mb-3.75 grid size-14 place-items-center rounded-[18px] bg-secondary text-accent-foreground">
                  {done ? <CheckCheck size={29} /> : <Inbox size={30} strokeWidth={1.5} />}
                </div>
                <h2 className="text-[22px] font-[550] tracking-[-0.6px] max-phone:text-[19px]">
                  {done
                    ? 'Small wins will live here.'
                    : currentList
                      ? 'Room for something good.'
                      : 'A clear inbox. A clearer head.'}
                </h2>
                <p className="mt-2 text-[12px] leading-[1.8] text-muted-foreground">
                  {done
                    ? 'Check off a thought when you’re finished with it.'
                    : currentList
                      ? `Dump something here, or type !${currentList.label.toLowerCase()} anywhere.`
                      : 'Drop a thought, a link, or that thing you don’t want to forget.'}
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
                      <span className="text-[10px] text-muted-foreground">
                        Anything goes.
                        <span className="ml-1.75 max-phone:hidden">
                          Try <code className={hint}>!buy</code> or{' '}
                          <code className={hint}>#weekend</code>
                        </span>
                      </span>
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
                {isInbox && (
                  <div className="mt-6 flex flex-wrap justify-center gap-2 max-phone:gap-1.75">
                    {[
                      { text: 'An idea I don’t want to lose: ', label: 'An idea' },
                      { text: '!buy ', label: 'A good find' },
                      { text: '!todo ', label: 'A little to-do' },
                    ].map((prompt) => (
                      <button
                        key={prompt.text}
                        className="flex items-center gap-2 rounded-[6px] border bg-card px-2.5 py-1.75 text-[10px] text-muted-foreground"
                        onClick={() => {
                          setDraft(prompt.text);
                          inputRef.current?.focus();
                        }}
                      >
                        {prompt.label}
                        <Plus size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {!selectedId && (
                  <div className="flex flex-1 flex-col items-center justify-center py-14 text-center max-phone:py-10">
                    <div className="text-[10px] tracking-[1.8px] text-muted-foreground uppercase">
                      {format(new Date(), 'EEEE')}
                    </div>
                    <div className="mt-1.5 text-[44px] leading-none font-[600] tracking-[-1.8px] max-phone:text-[36px]">
                      {format(new Date(), 'MMMM d')}
                    </div>
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      {done
                        ? `${selected.length} small ${selected.length === 1 ? 'win' : 'wins'}. A little more room in your mind.`
                        : `${selected.length} ${selected.length === 1 ? 'thought' : 'thoughts'} ${currentList ? `in ${currentList.label}` : 'waiting in your inbox'}.`}
                    </p>
                  </div>
                )}
                <div className="grid gap-5" aria-label="Dumps">
                  {byDay(selected).map(({ day, dumps }) => (
                    <section key={day} aria-label={dayLabel(day)}>
                      <h2 className="mb-2 px-1 text-[9px] tracking-[1.3px] text-muted-foreground uppercase">
                        {dayLabel(day)}
                      </h2>
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
                  ))}
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
                <code className={hint}>#weekend</code>
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
        dumps={active}
        lists={lists}
        navigate={navigate}
        select={(dump) => navigate(`${homeOf(dump)}?item=${dump.id}`)}
        settings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} ready={state.ready} />
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
