import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
import { toast } from './lib/toast';
import { useLocation, useNavigate, useMatch } from 'react-router-dom';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Code } from '@astryxdesign/core/Code';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
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

// One reading column for the views and the composer.
const column = 'mx-auto w-full max-w-190 px-10 max-tablet:px-7 max-phone:px-3.5';
// The composer frame: a raised card that rings in the accent while you type.
const composer =
  'border border-border-strong shadow-md focus-within:border-accent-bg focus-within:ring-4 focus-within:ring-accent-muted';
// The composer's textarea sits bare inside that frame.
const bareControl = 'border-0 bg-transparent shadow-none outline-none ring-0 px-0';
const hints = (
  <>
    <Code size="inherit" color="inherit">
      !buy
    </Code>{' '}
    <Code size="inherit" color="inherit">
      #weekend
    </Code>{' '}
    <Code size="inherit" color="inherit">
      by friday
    </Code>
  </>
);
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
    label: 'Capture a thought',
    isLabelHidden: true,
    placeholder: 'What’s on your mind?',
    value: draft,
    isDisabled: !state.ready,
    // Astryx's maxLength draws a counter; cap the draft instead, as the native limit did.
    onChange: (value: string) => setDraft(value.slice(0, 20_000)),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
      }
    },
  };
  const sendProps = {
    type: 'submit' as const,
    variant: 'primary' as const,
    label: 'Save dump',
    isDisabled: !draft.trim() || !state.ready,
    // Keep focus in the composer so a tap does not close the phone keyboard.
    onPointerDown: (event: React.PointerEvent) => event.preventDefault(),
  };
  const status = syncProblem ? (
    <HStack
      gap={1.5}
      vAlign="center"
      role="status"
      aria-label="Sync status"
      className="h-8 min-w-0 shrink rounded-full bg-error-muted px-2.5 text-error"
    >
      <Text type="supporting" size="xsm" color="inherit" maxLines={1}>
        {syncText}
      </Text>
      {state.sync === 'error' && (
        <Button variant="ghost" size="sm" label="Retry" onClick={() => void client.syncNow()} />
      )}
      {state.sync === 'signed-out' && (
        <Button variant="ghost" size="sm" label="Sign in" onClick={() => setSettingsOpen(true)} />
      )}
    </HStack>
  ) : (
    <VisuallyHidden role="status" aria-label="Sync status">
      {syncText}
    </VisuallyHidden>
  );

  function dumpGroup(
    {
      key,
      label,
      dumps,
      overdue,
    }: { key: string; label: string; dumps: Dump[]; overdue?: boolean },
    level: 2 | 3,
  ) {
    return (
      <VStack as="section" key={key} aria-label={label} gap={2}>
        <Heading level={level} className="px-1">
          <Text
            type="supporting"
            size="2xs"
            color={overdue ? 'inherit' : 'secondary'}
            className={cn('tracking-[0.13em] uppercase', overdue && 'text-error')}
          >
            {label}
          </Text>
        </Heading>
        <Card padding={0} className="overflow-hidden">
          {dumps.map((dump, index) => (
            <VStack key={dump.id}>
              {index > 0 && <Divider />}
              <DumpCard
                dump={dump}
                lists={lists}
                actions={actions}
                sorting={state.sorting.has(dump.id)}
                showList={!currentList}
              />
            </VStack>
          ))}
        </Card>
      </VStack>
    );
  }

  if (fatal)
    return (
      <AppShell mobileNav={false}>
        <EmptyState
          headingLevel={1}
          title="Your space couldn’t open."
          description={fatal}
          icon={<Icon icon={Asterisk} size="lg" />}
          actions={<Button label="Try again" onClick={() => window.location.reload()} />}
        />
      </AppShell>
    );

  const nav = (
    <TopNav
      label="Dump"
      heading={
        isHome ? (
          <HStack gap={2} vAlign="center">
            <Link href="/" label="Dump home">
              <Brand size="compact" badgeOnPhone />
            </Link>
            <VisuallyHidden>
              <Heading level={1}>{title}</Heading>
            </VisuallyHidden>
          </HStack>
        ) : (
          <HStack gap={2} vAlign="center" className="min-w-0">
            <IconButton
              href="/"
              variant="ghost"
              label="Back to your space"
              icon={<Icon icon={ArrowLeft} />}
            />
            {currentList && <ListDot color={currentList.color} />}
            <Heading level={1}>
              <Text type="large" weight="semibold" maxLines={1}>
                {title}
              </Text>
            </Heading>
            <Text type="supporting">{selected.length}</Text>
          </HStack>
        )
      }
      endContent={
        <HStack gap={1} vAlign="center" className="min-w-0">
          {currentList && (
            <IconButton
              variant="ghost"
              label="Edit list"
              icon={<Icon icon={Pencil} size="sm" />}
              onClick={() => setEditor({ list: currentList })}
            />
          )}
          {done && !selectedId && completed.length > 0 && (
            <Button
              variant={confirmClear ? 'destructive' : 'secondary'}
              size="sm"
              label={confirmClear ? `Clear ${completed.length}?` : 'Clear done'}
              icon={<Icon icon={Trash2} size="sm" color="inherit" />}
              onBlur={() => setConfirmClear(false)}
              onClick={() => {
                if (!confirmClear) return setConfirmClear(true);
                setConfirmClear(false);
                const count = client.clearDone();
                toast(`Cleared ${count} done ${count === 1 ? 'dump' : 'dumps'}`);
              }}
            />
          )}
          {isHome && unfiled.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              label="Sort inbox"
              icon={<Icon icon={Sparkles} size="sm" color="inherit" />}
              onClick={() => setTriage(true)}
            >
              <Text type="inherit" className="max-phone:hidden">
                Sort inbox
              </Text>
            </Button>
          )}
          {status}
          <IconButton
            variant="ghost"
            label="Search your space"
            tooltip="Search (⌘K)"
            icon={<Icon icon={Search} />}
            onClick={openSearch}
          />
          <HStack className="relative">
            <IconButton
              variant="ghost"
              label="Settings"
              icon={<Icon icon={Settings} />}
              onClick={() => setSettingsOpen(true)}
            />
            {syncProblem && (
              <StatusDot
                variant="error"
                label={syncText}
                aria-hidden
                className="pointer-events-none absolute top-1.5 right-1.5"
              />
            )}
          </HStack>
        </HStack>
      }
    />
  );

  const emptyView = (
    <VStack gap={5} className="mx-auto w-full max-w-160 pb-[8vh] max-phone:pb-0">
      <EmptyState
        headingLevel={2}
        title={
          done
            ? 'Small wins will live here.'
            : currentList
              ? 'Room for something good.'
              : 'A clear head.'
        }
        description={
          done
            ? 'Check off a thought when you’re finished with it.'
            : currentList
              ? `Dump something here, or type ${prefixFor(currentList)} anywhere.`
              : 'Drop a thought, a link, or that thing you don’t want to forget. Give it a day, like “by friday”, and it waits for you in Today.'
        }
        icon={
          <VStack gap={4} hAlign="center">
            <Text type="supporting" size="2xs" className="tracking-[0.18em] uppercase">
              {longDate(now)}
            </Text>
            <Card variant="muted" padding={3}>
              {done ? (
                <Icon icon={CheckCheck} size="lg" color="accent" />
              ) : currentList ? (
                <ListDot color={currentList.color} size="lg" />
              ) : (
                <Icon icon={CalendarDays} size="lg" color="accent" />
              )}
            </Card>
          </VStack>
        }
      />
      {composing && (
        <form onSubmit={submit}>
          <Card padding={0} className={cn(composer, 'text-left')}>
            <HStack gap={3} vAlign="start" paddingInline={5} paddingBlockStart={5}>
              <Icon icon={Asterisk} size="lg" color="accent" className="mt-0.5 shrink-0" />
              <TextArea
                {...inputProps}
                rows={2}
                width="100%"
                controlClassName={cn(
                  bareControl,
                  '[&_textarea]:max-h-70 [&_textarea]:min-h-17.75 [&_textarea]:resize-none [&_textarea]:text-[17px] [&_textarea]:leading-[1.6] max-phone:[&_textarea]:text-[16px]',
                )}
              />
            </HStack>
            <HStack gap={2} hAlign="between" vAlign="center" padding={4} paddingInlineStart={6}>
              {shownDue ? (
                <DraftDue due={shownDue} skip={() => setSkippedDue(shownDue)} />
              ) : (
                <Text type="supporting" size="2xs">
                  Anything goes.{' '}
                  <Text type="inherit" className="max-phone:hidden">
                    Try {hints}
                  </Text>
                </Text>
              )}
              <Button {...sendProps} endContent={<Icon icon={ArrowUp} size="sm" color="inherit" />}>
                Dump it
              </Button>
            </HStack>
          </Card>
        </form>
      )}
    </VStack>
  );

  const dumpsView = (
    <>
      {showToday && completed.length > 0 && (
        <Link href="/done" isStandalone className="mb-4 self-center">
          {completed.length} done →
        </Link>
      )}
      {!selectedId && !showToday && (
        <VStack gap={1.5} hAlign="center" className="flex-1 justify-center py-14 max-phone:py-10">
          <Text type="supporting" size="2xs" className="tracking-[0.18em] uppercase">
            {new Date(now).toLocaleDateString(undefined, { weekday: 'long' })}
          </Text>
          <Text type="display-2" justify="center">
            {new Date(now).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </Text>
          <Text type="supporting" justify="center">
            {done
              ? `${selected.length} small ${selected.length === 1 ? 'win' : 'wins'}. A little more room in your mind.`
              : `${selected.length} ${selected.length === 1 ? 'thought' : 'thoughts'} in ${currentList?.label ?? 'your space'}.`}
          </Text>
        </VStack>
      )}
      <VStack gap={5} aria-label="Dumps">
        {groups.map((group) => dumpGroup(group, 2))}
        {showToday && (
          <VStack
            as="section"
            ref={todayRef}
            aria-label="Today"
            gap={5}
            className={cn(history.length > 0 && 'mt-3 border-t border-border pt-6')}
          >
            <VStack gap={0.5} paddingInline={1}>
              <Heading level={2}>Today</Heading>
              <Text type="supporting">{plan.heading}</Text>
            </VStack>
            {todayGroups.map((group) => dumpGroup(group, 3))}
            {plan.quiet && (
              <Card variant="transparent" className="border border-dashed border-border">
                <VStack gap={3} hAlign="center">
                  <Text weight="semibold" justify="center">
                    A clear day.
                  </Text>
                  <Text type="supporting" justify="center" textWrap="balance">
                    Nothing due and nothing dumped yet. Give a dump a day, and it waits for you here
                    when the day comes.
                  </Text>
                  <HStack gap={2} hAlign="center" wrap="wrap">
                    {DAY_EXAMPLES.map((example) => (
                      <Button
                        key={example}
                        variant="secondary"
                        size="sm"
                        label={example}
                        icon={<Icon icon={CalendarDays} size="xsm" color="inherit" />}
                        onClick={() => {
                          setDraft(example);
                          inputRef.current?.focus();
                        }}
                      />
                    ))}
                  </HStack>
                </VStack>
              </Card>
            )}
          </VStack>
        )}
      </VStack>
    </>
  );

  return (
    // Pinned to the visible viewport so the composer rides above the phone keyboard. The height
    // eases with the iOS keyboard's curve and duration, which is longer than other motion here.
    <AppShell
      mobileNav={false}
      variant="wash"
      topNav={nav}
      className="fixed inset-x-0 top-(--vv-top,0px) h-(--vv-height,100dvh) overflow-hidden pointer-coarse:transition-[height] pointer-coarse:duration-250 pointer-coarse:ease-[cubic-bezier(0.38,0.7,0.125,1)]"
    >
      <Layout
        height="fill"
        content={
          <LayoutContent
            ref={scrollRef}
            isScrollable
            padding={0}
            className="overscroll-contain"
            onScroll={(event) => {
              const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
              atBottom.current =
                scrollHeight - scrollTop - clientHeight < (atToday.current ? 1 : 48);
            }}
          >
            <VStack
              ref={contentRef}
              className={cn(
                column,
                'min-h-full py-6 max-phone:py-4',
                empty ? 'justify-center' : 'justify-end',
              )}
            >
              {state.storageError && (
                <Banner
                  status="error"
                  title={state.storageError}
                  endContent={<Button label="Export now" onClick={exportDumps} />}
                  className="mb-4"
                />
              )}
              {state.syncError && (
                <Text type="supporting" color="inherit" className="mb-4 text-error">
                  {state.syncError}
                </Text>
              )}
              {selectedId && !empty && (
                <HStack hAlign="between" vAlign="center" className="mb-3">
                  <Text type="supporting">Found in your space</Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Show all"
                    icon={<Icon icon={X} size="xsm" color="inherit" />}
                    onClick={() => navigate(location.pathname)}
                  />
                </HStack>
              )}
              {!state.ready ? (
                <Text type="supporting" justify="center" className="py-10">
                  Opening your space…
                </Text>
              ) : empty ? (
                emptyView
              ) : (
                dumpsView
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          !empty &&
          composing && (
            <LayoutFooter
              padding={0}
              className="pb-[max(16px,calc(env(safe-area-inset-bottom)+6px))] keyboard:pb-4"
            >
              <VStack gap={2} className={column}>
                <form onSubmit={submit}>
                  <Card padding={0} className={composer}>
                    <HStack
                      gap={2}
                      vAlign="end"
                      paddingBlock={1.5}
                      paddingInlineEnd={1.5}
                      paddingInlineStart={4}
                    >
                      <Icon icon={Asterisk} color="accent" className="mb-2.5 shrink-0" />
                      <TextArea
                        {...inputProps}
                        rows={1}
                        width="100%"
                        controlClassName={cn(
                          bareControl,
                          '[&_textarea]:max-h-50 [&_textarea]:resize-none [&_textarea]:py-2 [&_textarea]:text-[15px] [&_textarea]:leading-[1.5] max-phone:[&_textarea]:text-[16px]',
                        )}
                      />
                      {shownDue && (
                        <VStack className="mb-1.5">
                          <DraftDue due={shownDue} skip={() => setSkippedDue(shownDue)} />
                        </VStack>
                      )}
                      <IconButton {...sendProps} icon={<Icon icon={ArrowUp} />} />
                    </HStack>
                  </Card>
                </form>
                <Text type="supporting" size="2xs" className="px-1 max-phone:hidden">
                  Enter to dump · Shift Enter for a new line · {hints}
                </Text>
              </VStack>
            </LayoutFooter>
          )
        }
      />
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
    </AppShell>
  );
}
