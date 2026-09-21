import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  Asterisk,
  Check,
  CheckCheck,
  ChevronRight,
  Cloud,
  CloudOff,
  Inbox,
  Layers3,
  LayoutDashboard,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link, NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import type { Collection, Dump } from '../shared/schema';
import { capture, exportDumps, initializeStore, syncNow, updateDump, useDumpStore } from './store';
import { cn } from './lib/utils';
import { Brand } from './components/Brand';
import { DumpCard, type DumpActions } from './components/DumpCard';
import { ListDot } from './components/ListDot';
import { Board } from './components/Board';
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
  'mb-0.75 flex min-h-10.5 w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-[13px] text-muted-foreground max-phone:min-h-11';
const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(navItem, isActive ? 'bg-secondary font-[550] text-secondary-foreground' : 'hover:bg-muted');
const navCount = 'ml-auto text-[11px] font-normal opacity-80';
const itemsHeading =
  'mt-8.75 mb-3.5 flex items-center justify-between gap-2.5 text-[9px] tracking-[1.2px] text-muted-foreground max-phone:mt-7 max-phone:text-[8px]';
const itemsHeadingNote = 'text-[10px] tracking-normal max-phone:text-[9px]';
const hint = 'rounded-[3px] bg-secondary px-1 py-0.5 [font:inherit]';
const emptyState =
  'rounded-[13px] border border-dashed px-5 py-11.5 text-center max-phone:px-3 max-phone:py-9.25';
const emptyNote =
  'mt-2.25 text-[12px] leading-[1.8] text-muted-foreground max-phone:mx-auto max-phone:max-w-63.75 max-phone:text-[11px]';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lists = state.lists.filter((list) => !list.deleted);
  const active = state.dumps.filter((dump) => !dump.deleted);
  const inbox = active.filter((dump) => dump.list === null && !dump.done);
  const completed = active.filter((dump) => dump.done);
  const currentList = lists.find((list) => list.id === listMatch?.params.id);
  const board = location.pathname === '/board';
  const all = location.pathname === '/all';
  const done = location.pathname === '/done';
  const title = board
    ? 'Your board'
    : all
      ? 'All dumps'
      : done
        ? 'Done'
        : (currentList?.label ?? 'Inbox');
  const selectedId = new URLSearchParams(location.search).get('item');
  const selected = active.filter((dump) =>
    selectedId
      ? dump.id === selectedId
      : all ||
        (done
          ? dump.done
          : currentList
            ? dump.list === currentList.id && !dump.done
            : dump.list === null && !dump.done),
  );

  useEffect(() => {
    void initializeStore().catch((error) =>
      setFatal(error instanceof Error ? error.message : 'Could not open local storage.'),
    );
  }, []);
  useEffect(() => {
    if (state.ready && window.matchMedia('(pointer:fine)').matches) inputRef.current?.focus();
  }, [state.ready]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMenuOpen(false);
        setSearchQuery('');
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

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
      inputRef.current?.focus();
      if (dump.list)
        toast(`Captured in ${lists.find((list) => list.id === dump.list)?.label ?? 'your list'}`);
      else if (location.pathname !== '/' && !all && !board) toast('Captured in your inbox');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not capture this dump.');
    }
  }
  function newList() {
    setMenuOpen(false);
    setEditor({});
  }
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

  const navigation = (
    <>
      <Link to="/" className="self-start" onClick={() => setMenuOpen(false)} aria-label="Dump home">
        <Brand />
      </Link>
      <div className="mx-2.5 mt-7 mb-4.75 text-[8px] tracking-[1.5px] text-muted-foreground max-tablet:text-[7px] max-tablet:tracking-[1.2px]">
        A LITTLE ROOM FOR YOUR MIND
      </div>
      <nav aria-label="Main navigation">
        {[
          { to: '/', label: 'Inbox', Icon: Inbox, count: inbox.length },
          { to: '/board', label: 'Board', Icon: LayoutDashboard },
          { to: '/all', label: 'All dumps', Icon: Layers3, count: active.length },
        ].map(({ to, label, Icon, count }) => (
          <NavLink end key={to} to={to} className={navLink} onClick={() => setMenuOpen(false)}>
            <Icon size={18} />
            <span className="truncate">{label}</span>
            {count !== undefined && <span className={navCount}>{count}</span>}
          </NavLink>
        ))}
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
        {lists.map((list) => (
          <NavLink
            key={list.id}
            to={`/lists/${list.id}`}
            className={navLink}
            onClick={() => setMenuOpen(false)}
          >
            <ListDot color={list.color} className="mx-1.25" />
            <span className="truncate">{list.label}</span>
            <span className={navCount}>
              {active.filter((dump) => dump.list === list.id && !dump.done).length}
            </span>
          </NavLink>
        ))}
        <button
          className={cn(navItem, 'text-[12px] opacity-80 hover:bg-muted')}
          onClick={newList}
          disabled={!state.ready}
        >
          <Plus size={17} />
          <span className="truncate">New list</span>
        </button>
        <div className="mx-3 my-4.75 h-px bg-border" />
        <NavLink to="/done" className={navLink} onClick={() => setMenuOpen(false)}>
          <CheckCheck size={18} />
          <span className="truncate">Done</span>
          <span className={navCount}>{completed.length}</span>
        </NavLink>
      </nav>
      <div className="mt-auto pt-8">
        <p className="px-3.25 pb-6.25 text-[11px] leading-[1.9] text-muted-foreground">
          <Asterisk size={22} className="mb-2.25 text-accent-foreground" />
          More space in your head.
          <br />
          One dump at a time.
        </p>
        <button
          className="flex w-full items-center gap-2.5 border-t px-2 pt-4.25 text-left text-[12px] max-phone:pb-[env(safe-area-inset-bottom)]"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          <span className="grid size-7.75 place-items-center rounded-full bg-secondary text-accent-foreground">
            A
          </span>
          <span>
            My space
            <small className="mt-0.75 block text-[10px] text-muted-foreground">
              Settings & preferences
            </small>
          </span>
          <Settings size={17} className="ml-auto text-muted-foreground" />
        </button>
      </div>
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
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-59.5 flex-col overflow-y-auto overscroll-contain border-r bg-sidebar px-4.5 pt-7.75 pb-4.5 max-tablet:w-53 max-tablet:px-3.25 max-phone:hidden">
        {navigation}
      </aside>
      <main className="ml-59.5 min-w-0 max-tablet:ml-53 max-phone:ml-0">
        <header className="flex h-19.25 items-center gap-4 border-b px-10.5 max-tablet:px-7 max-phone:h-16 max-phone:gap-1.75 max-phone:px-3.25">
          <div className="flex min-w-0 items-center gap-3 text-[12px] max-phone:flex-1 max-phone:gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden max-phone:inline-flex"
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
                  Navigate your inbox, board, and lists.
                </SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            <span className="text-muted-foreground max-phone:hidden">My space</span>
            <ChevronRight size={13} className="text-muted-foreground max-phone:hidden" />
            <span className="truncate">{title}</span>
          </div>
          <button
            className="ml-auto flex min-h-9 items-center gap-2.75 text-[12px] text-muted-foreground max-phone:ml-0 max-phone:p-2"
            onClick={() => {
              setSearchQuery('');
              setSearchOpen(true);
            }}
            aria-label="Search your space"
          >
            <Search size={17} />
            <span className="max-phone:hidden">Find something…</span>
            <kbd className="ml-4.5 max-phone:hidden">⌘ / Ctrl K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground max-phone:w-8.5"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} />
          </Button>
        </header>
        <div
          className={cn(
            'mx-auto max-w-240 px-13.5 pt-12.25 pb-6.25 max-tablet:px-7.5 max-tablet:pt-9 max-phone:px-4.75 max-phone:pt-7.25 max-phone:pb-6',
            board ? 'max-w-none px-8.5 pt-10.75' : 'wide:pt-16',
          )}
        >
          <div className="mb-7.25 flex items-center justify-between gap-5 max-phone:mb-6 max-phone:items-start max-phone:gap-2.5">
            <div>
              <div className="mb-3 text-[9px] tracking-[1.6px] text-muted-foreground uppercase max-phone:mb-2.5 max-phone:text-[8px]">
                {format(new Date(), 'EEEE, MMMM d')}
              </div>
              <h1 className="text-[34px] leading-[1.2] font-[530] tracking-[-1.4px] wrap-anywhere max-phone:text-[30px]">
                {title}
                <span className="ml-3 inline-block rounded-[7px] border px-2 py-0.75 align-middle text-[12px] font-normal tracking-normal text-muted-foreground">
                  {board ? lists.length : selected.length}
                </span>
              </h1>
              <p className="mt-2.25 text-[12px] leading-[1.7] text-muted-foreground max-phone:max-w-62.5 max-phone:text-[11px]">
                {board
                  ? 'A little perspective. Everything in its own place.'
                  : all
                    ? 'Every thought, link, and little possibility.'
                    : done
                      ? 'Small wins. A little more room in your mind.'
                      : currentList
                        ? `A home for ${currentList.label.toLowerCase()}. Make it your own.`
                        : 'Get it out of your head. Give it a home later.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.25 max-phone:mt-6">
              {currentList && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit list"
                  onClick={() => setEditor({ list: currentList })}
                >
                  <Pencil size={17} />
                </Button>
              )}
              <Button
                variant="outline"
                className="bg-card text-[11px] text-muted-foreground dark:bg-card max-phone:h-8.5 max-phone:p-2 max-phone:text-[10px]"
                disabled={!inbox.length}
                onClick={() => setTriage(true)}
              >
                <Sparkles size={16} />
                <span>Sort inbox</span>
              </Button>
            </div>
          </div>
          <div className={board ? 'max-w-187.5' : undefined}>
            <form
              className="rounded-[14px] border border-input bg-capture shadow-soft focus-within:border-ring"
              onSubmit={submit}
            >
              <div className="flex items-start gap-3.5 px-5.5 pt-5.75 max-phone:gap-2.5 max-phone:px-4 max-phone:pt-4.75">
                <Asterisk size={25} className="mt-0.5 shrink-0 text-accent-foreground" />
                <textarea
                  ref={inputRef}
                  className="max-h-70 min-h-17.75 w-full resize-y border-0 bg-transparent text-[17px] leading-[1.6] outline-none placeholder:text-muted-foreground placeholder:opacity-85 max-phone:min-h-19.25 max-phone:text-[16px]"
                  aria-label="Capture a thought"
                  placeholder="What’s on your mind?"
                  value={draft}
                  maxLength={20_000}
                  disabled={!state.ready}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between gap-2.5 pt-3.25 pr-3.75 pb-3.75 pl-6 max-phone:pt-3 max-phone:pr-3.25 max-phone:pb-3.25 max-phone:pl-4.5">
                <span className="text-[10px] text-muted-foreground">
                  Anything goes.
                  <span className="ml-1.75 max-phone:hidden">
                    {' '}
                    Try <code className={hint}>!buy</code> or <code className={hint}>#weekend</code>
                  </span>
                </span>
                <Button
                  type="submit"
                  className="text-[11px]"
                  disabled={!draft.trim() || !state.ready}
                  aria-label="Save dump"
                >
                  Dump it
                  <ArrowUp size={17} />
                </Button>
              </div>
            </form>
            <div
              className="mt-3 flex min-h-3.75 items-center justify-center gap-1.5 text-[10px] text-muted-foreground"
              role="status"
            >
              {state.sync === 'offline' ? (
                <CloudOff size={13} />
              ) : state.sync === 'synced' ? (
                <Check size={13} />
              ) : (
                <Cloud size={13} />
              )}
              <span>{syncText}</span>
              {state.sync === 'error' && (
                <button className="underline" onClick={() => void syncNow()}>
                  Retry
                </button>
              )}
            </div>
          </div>
          {state.storageError && (
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-destructive p-3.75 text-[12px] max-phone:flex-col max-phone:items-start"
              role="alert"
            >
              {state.storageError}
              <Button variant="outline" onClick={exportDumps}>
                Export now
              </Button>
            </div>
          )}
          {state.syncError && <p className="text-[12px] text-destructive">{state.syncError}</p>}
          {board ? (
            <>
              <div className={itemsHeading}>
                <span>YOUR LISTS, SIDE BY SIDE</span>
                <span className={itemsHeadingNote}>Drag a handle to reorder</span>
              </div>
              <Board
                lists={lists}
                dumps={active.filter((dump) => !dump.done)}
                actions={actions}
                edit={(list) => setEditor({ list })}
                create={newList}
              />
            </>
          ) : (
            <>
              <div className={itemsHeading}>
                <span>
                  {selectedId ? 'FOUND IN YOUR SPACE' : done ? 'COMPLETED' : 'YOUR DUMPS'}
                </span>
                {selectedId ? (
                  <button
                    className="flex items-center gap-1"
                    onClick={() => navigate(location.pathname)}
                  >
                    <X size={13} />
                    Clear selection
                  </button>
                ) : (
                  <span className={itemsHeadingNote}>Newest first</span>
                )}
              </div>
              <div className="grid gap-2.5" aria-label="Dumps">
                {!state.ready ? (
                  <div className={emptyState}>
                    <p className={emptyNote}>Opening your space…</p>
                  </div>
                ) : selected.length ? (
                  selected.map((dump) => (
                    <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} />
                  ))
                ) : (
                  <div className={emptyState}>
                    <div className="mx-auto mb-3.75 grid size-14 place-items-center rounded-[18px] bg-secondary text-accent-foreground">
                      {done ? <CheckCheck size={29} /> : <Inbox size={30} strokeWidth={1.5} />}
                    </div>
                    <h2 className="text-[17px] font-medium tracking-[-0.4px]">
                      {done
                        ? 'Small wins will live here.'
                        : currentList
                          ? 'Room for something good.'
                          : 'A clear inbox. A clearer head.'}
                    </h2>
                    <p className={emptyNote}>
                      {done
                        ? 'Check off a thought when you’re finished with it.'
                        : currentList
                          ? 'Move thoughts here using their menu, or a list prefix.'
                          : 'Drop a thought, a link, or that thing you don’t want to forget.'}
                    </p>
                    {!currentList && !done && (
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
                )}
              </div>
            </>
          )}
          <footer className="mt-11.5 flex justify-between gap-4 text-[9px] leading-[1.8] text-muted-foreground max-phone:mt-8.75 max-phone:gap-3 max-phone:text-[8px]">
            <span>Out of your head. Into your space.</span>
            <a href="/marketing" className="hover:text-accent-foreground">
              A little about Dump <span>↗</span>
            </a>
          </footer>
        </div>
      </main>
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
        dumps={active}
        lists={lists}
        navigate={navigate}
        select={(dump) => navigate(`/all?item=${dump.id}`)}
        settings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} ready={state.ready} />
      {editor && (
        <ListEditor
          list={editor.list}
          close={() => setEditor(null)}
          saved={(list) => {
            toast(editor.list ? 'List updated' : 'A new home for your thoughts');
            if (!editor.list && !board) navigate(`/lists/${list.id}`);
          }}
        />
      )}
      {triage && (
        <TriageDialog
          dumps={inbox}
          lists={lists}
          actions={actions}
          close={() => setTriage(false)}
        />
      )}
    </div>
  );
}
