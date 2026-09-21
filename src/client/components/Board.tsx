import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, GripVertical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type { Collection, Dump } from '../../shared/schema';
import { moveList } from '../store';
import { cn } from '../lib/utils';
import { DumpCard, type DumpActions } from './DumpCard';
import { ListDot } from './ListDot';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const column =
  'flex h-full min-h-61.25 w-71.25 flex-[0_0_285px] snap-start flex-col rounded-[12px] border bg-muted max-phone:w-[calc(100vw-67px)] max-phone:max-w-80 max-phone:basis-[calc(100vw-67px)]';
const columnHeader = 'flex min-h-13.75 items-center gap-2 px-2.75 py-2.25';
const columnTitle = 'truncate text-[12px] font-[550]';
const columnCount = 'text-[10px] text-muted-foreground';
const columnItems =
  'grid min-h-0 content-start gap-2.5 overflow-y-auto overscroll-contain px-2.5 pb-2.75 [scrollbar-width:thin]';
const columnEmpty = 'px-3 py-7 text-center text-[11px] leading-[1.7] text-muted-foreground';
const columnEmptyHint = 'mt-1.5 block text-[10px] opacity-80';

function Column({
  list,
  dumps,
  lists,
  actions,
  index,
  edit,
}: {
  list: Collection;
  dumps: Dump[];
  lists: Collection[];
  actions: DumpActions;
  index: number;
  edit: (list: Collection) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    transition: reduceMotion ? null : { duration: 160, easing: 'ease' },
  });
  return (
    <section
      ref={setNodeRef}
      className={cn(column, isDragging && 'z-5 opacity-70')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`${list.label} column`}
    >
      <header className={columnHeader}>
        <button
          className="cursor-grab touch-none py-1.25 text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${list.label}`}
        >
          <GripVertical size={16} />
        </button>
        <ListDot color={list.color} />
        <h2 className={columnTitle}>{list.label}</h2>
        <span className={columnCount}>{dumps.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              aria-label={`Options for ${list.label}`}
            >
              <MoreHorizontal size={17} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => edit(list)}>
              <Pencil />
              Edit list
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => moveList(list.id, index - 1)}>
              <ArrowLeft />
              Move left
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === lists.length - 1}
              onSelect={() => moveList(list.id, index + 1)}
            >
              <ArrowRight />
              Move right
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className={columnItems}>
        {dumps.map((dump) => (
          <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} compact />
        ))}
        {!dumps.length && (
          <div className={columnEmpty}>
            A little room for {list.label.toLowerCase()}.
            <span className={columnEmptyHint}>Move a thought here from its menu.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function Board({
  lists,
  dumps,
  actions,
  edit,
  create,
}: {
  lists: Collection[];
  dumps: Dump[];
  actions: DumpActions;
  edit: (list: Collection) => void;
  create: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const index = lists.findIndex((list) => list.id === event.over?.id);
    if (index >= 0 && typeof event.active.id === 'string') moveList(event.active.id, index);
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
      <div
        className="flex h-[max(340px,calc(100dvh-485px))] snap-x snap-proximity items-start gap-4.25 overflow-x-auto px-0.5 pt-0.5 pb-6 [scrollbar-width:thin] max-phone:gap-3.25"
        aria-label="Lists board"
      >
        <section className={column} aria-label="Inbox column">
          <header className={cn(columnHeader, 'pl-4.25')}>
            <ListDot />
            <h2 className={columnTitle}>Inbox</h2>
            <span className={columnCount}>{dumps.filter((dump) => !dump.list).length}</span>
          </header>
          <div className={columnItems}>
            {dumps
              .filter((dump) => !dump.list)
              .map((dump) => (
                <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} compact />
              ))}
            {!dumps.some((dump) => !dump.list) && (
              <div className={columnEmpty}>
                A clear inbox.<span className={columnEmptyHint}>New thoughts arrive here.</span>
              </div>
            )}
          </div>
        </section>
        <SortableContext
          items={lists.map((list) => list.id)}
          strategy={horizontalListSortingStrategy}
        >
          {lists.map((list, index) => (
            <Column
              key={list.id}
              list={list}
              lists={lists}
              dumps={dumps.filter((dump) => dump.list === list.id)}
              actions={actions}
              index={index}
              edit={edit}
            />
          ))}
        </SortableContext>
        <button
          className="flex min-w-34 shrink-0 items-center gap-1.75 rounded-[10px] border border-dashed p-4.5 text-[12px] text-muted-foreground"
          onClick={create}
        >
          <Plus size={17} />
          New list
        </button>
      </div>
    </DndContext>
  );
}
