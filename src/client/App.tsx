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
import {
  capture,
  exportDumps,
  initializeStore,
  restoreAction,
  syncNow,
  updateDump,
  useDumpStore,
} from './store';
import { Brand } from './components/Brand';
import { DumpCard, type DumpActions } from './components/DumpCard';
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

type UndoAction = { previous: Dump; changes: Parameters<typeof updateDump>[1] };

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
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
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
    const action = { previous: updateDump(dump.id, changes), changes };
    setLastAction(action);
    toast(label, {
      action: {
        label: 'Undo',
        onClick: () => {
          restoreAction(action.previous, action.changes);
          setLastAction(null);
        },
      },
    });
  }
  function undo() {
    if (lastAction) {
      restoreAction(lastAction.previous, lastAction.changes);
      setLastAction(null);
      toast('Undone');
    }
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
      <Link to="/" className="brand-link" onClick={() => setMenuOpen(false)} aria-label="Dump home">
        <Brand />
      </Link>
      <div className="space-label">A LITTLE ROOM FOR YOUR MIND</div>
      <nav aria-label="Main navigation">
        {[
          { to: '/', label: 'Inbox', Icon: Inbox, count: inbox.length },
          { to: '/board', label: 'Board', Icon: LayoutDashboard },
          { to: '/all', label: 'All dumps', Icon: Layers3, count: active.length },
        ].map(({ to, label, Icon, count }) => (
          <NavLink
            end
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? 'selected' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {count !== undefined && <span className="nav-count">{count}</span>}
          </NavLink>
        ))}
        <div className="nav-label">
          <span>YOUR LISTS</span>
          <Button
            variant="ghost"
            size="icon"
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
            className={({ isActive }) => `nav-item ${isActive ? 'selected' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <span className="list-dot" style={{ background: list.color }} />
            <span>{list.label}</span>
            <span className="nav-count">
              {active.filter((dump) => dump.list === list.id && !dump.done).length}
            </span>
          </NavLink>
        ))}
        <button className="nav-item new-list" onClick={newList} disabled={!state.ready}>
          <Plus size={17} />
          <span>New list</span>
        </button>
        <div className="nav-divider" />
        <NavLink
          to="/done"
          className={({ isActive }) => `nav-item ${isActive ? 'selected' : ''}`}
          onClick={() => setMenuOpen(false)}
        >
          <CheckCheck size={18} />
          <span>Done</span>
          <span className="nav-count">{completed.length}</span>
        </NavLink>
      </nav>
      <div className="sidebar-bottom">
        <p className="quiet-note">
          <Asterisk size={22} />
          More space in your head.
          <br />
          One dump at a time.
        </p>
        <button
          className="profile"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          <span className="avatar">A</span>
          <span>
            My space<small>Settings & preferences</small>
          </span>
          <Settings size={17} />
        </button>
      </div>
    </>
  );

  if (fatal)
    return (
      <main className="fatal">
        <Asterisk size={40} />
        <h1>Your space couldn’t open.</h1>
        <p>{fatal}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar desktop-sidebar">{navigation}</aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open navigation"
                >
                  <Menu size={21} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetTitle className="sr-only">Your space</SheetTitle>
                <SheetDescription className="sr-only">
                  Navigate your inbox, board, and lists.
                </SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            <span className="desktop-label">My space</span>
            <ChevronRight size={13} className="desktop-label" />
            <span>{title}</span>
          </div>
          <button
            className="search-trigger"
            onClick={() => {
              setSearchQuery('');
              setSearchOpen(true);
            }}
            aria-label="Search your space"
          >
            <Search size={17} />
            <span>Find something…</span>
            <kbd>⌘ / Ctrl K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="top-settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} />
          </Button>
        </header>
        <div className={`workspace ${board ? 'board-workspace' : ''}`}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{format(new Date(), 'EEEE, MMMM d')}</div>
              <h1>
                {title}
                <span className="heading-count">{board ? lists.length : selected.length}</span>
              </h1>
              <p>
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
            <div className="heading-actions">
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
                className="sort-button"
                disabled={!inbox.length}
                onClick={() => setTriage(true)}
              >
                <Sparkles size={16} />
                <span>Sort inbox</span>
              </Button>
            </div>
          </div>
          <div className="capture-region">
            <form className="capture-box" onSubmit={submit}>
              <div className="capture-top">
                <Asterisk size={25} />
                <textarea
                  ref={inputRef}
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
              <div className="capture-bottom">
                <span>
                  Anything goes.
                  <span className="capture-hints">
                    {' '}
                    Try <code>!buy</code> or <code>#weekend</code>
                  </span>
                </span>
                <Button
                  type="submit"
                  disabled={!draft.trim() || !state.ready}
                  aria-label="Save dump"
                >
                  Dump it
                  <ArrowUp size={17} />
                </Button>
              </div>
            </form>
            <div className="save-status" role="status">
              {state.sync === 'offline' ? (
                <CloudOff size={13} />
              ) : state.sync === 'synced' ? (
                <Check size={13} />
              ) : (
                <Cloud size={13} />
              )}
              <span>{syncText}</span>
              {state.sync === 'error' && <button onClick={() => void syncNow()}>Retry</button>}
            </div>
          </div>
          {state.storageError && (
            <div className="error-banner" role="alert">
              {state.storageError}
              <Button variant="outline" onClick={exportDumps}>
                Export now
              </Button>
            </div>
          )}
          {state.syncError && <p className="sync-explanation">{state.syncError}</p>}
          {board ? (
            <>
              <div className="items-heading">
                <span>YOUR LISTS, SIDE BY SIDE</span>
                <span>Drag a handle to reorder</span>
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
              <div className="items-heading">
                <span>
                  {selectedId ? 'FOUND IN YOUR SPACE' : done ? 'COMPLETED' : 'YOUR DUMPS'}
                </span>
                {selectedId ? (
                  <button onClick={() => navigate(location.pathname)}>
                    <X size={13} />
                    Clear selection
                  </button>
                ) : (
                  <span>Newest first</span>
                )}
              </div>
              <div className="dump-list" aria-label="Dumps">
                {!state.ready ? (
                  <div className="empty-state">
                    <p>Opening your space…</p>
                  </div>
                ) : selected.length ? (
                  selected.map((dump) => (
                    <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} />
                  ))
                ) : (
                  <div className="empty-state">
                    <div className="empty-mark">
                      {done ? <CheckCheck size={29} /> : <Inbox size={30} strokeWidth={1.5} />}
                    </div>
                    <h2>
                      {done
                        ? 'Small wins will live here.'
                        : currentList
                          ? 'Room for something good.'
                          : 'A clear inbox. A clearer head.'}
                    </h2>
                    <p>
                      {done
                        ? 'Check off a thought when you’re finished with it.'
                        : currentList
                          ? 'Move thoughts here using their menu, or a list prefix.'
                          : 'Drop a thought, a link, or that thing you don’t want to forget.'}
                    </p>
                    {!currentList && !done && (
                      <div className="starter-prompts">
                        {[
                          { text: 'An idea I don’t want to lose: ', label: 'An idea' },
                          { text: '!buy ', label: 'A good find' },
                          { text: '!todo ', label: 'A little to-do' },
                        ].map((prompt) => (
                          <button
                            key={prompt.text}
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
          <footer className="workspace-footer">
            <span>Out of your head. Into your space.</span>
            <a href="/marketing">
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
          undo={undo}
          canUndo={!!lastAction}
        />
      )}
    </div>
  );
}
