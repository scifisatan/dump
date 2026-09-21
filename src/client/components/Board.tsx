import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, GripVertical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type { Collection, Dump } from '../../shared/schema';
import { moveList } from '../store';
import { DumpCard, type DumpActions } from './DumpCard';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

function Column({ list, dumps, lists, actions, index, edit }: { list: Collection; dumps: Dump[]; lists: Collection[]; actions: DumpActions; index: number; edit: (list: Collection) => void }) {
  const reduceMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id, transition: reduceMotion ? null : { duration: 160, easing: 'ease' } });
  return <section ref={setNodeRef} className={`board-column ${isDragging ? 'is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`${list.label} column`}>
    <header className="column-header"><button className="drag-handle" {...attributes} {...listeners} aria-label={`Reorder ${list.label}`}><GripVertical size={16} /></button><span className="list-dot" style={{ background: list.color }} /><h2>{list.label}</h2><span className="count">{dumps.length}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Options for ${list.label}`}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => edit(list)}><Pencil />Edit list</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => moveList(list.id, index - 1)}><ArrowLeft />Move left</DropdownMenuItem>
        <DropdownMenuItem disabled={index === lists.length - 1} onSelect={() => moveList(list.id, index + 1)}><ArrowRight />Move right</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </header>
    <div className="column-items">{dumps.map((dump) => <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} />)}{!dumps.length && <div className="column-empty">A little room for {list.label.toLowerCase()}.<span>Move a thought here from its menu.</span></div>}</div>
  </section>;
}

export function Board({ lists, dumps, actions, edit, create }: { lists: Collection[]; dumps: Dump[]; actions: DumpActions; edit: (list: Collection) => void; create: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const index = lists.findIndex((list) => list.id === event.over?.id);
    if (index >= 0 && typeof event.active.id === 'string') moveList(event.active.id, index);
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><div className="board" aria-label="Lists board">
    <section className="board-column inbox-column" aria-label="Inbox column"><header className="column-header"><span className="list-dot" /><h2>Inbox</h2><span className="count">{dumps.filter((dump) => !dump.list).length}</span></header><div className="column-items">{dumps.filter((dump) => !dump.list).map((dump) => <DumpCard key={dump.id} dump={dump} lists={lists} actions={actions} />)}{!dumps.some((dump) => !dump.list) && <div className="column-empty">A clear inbox.<span>New thoughts arrive here.</span></div>}</div></section>
    <SortableContext items={lists.map((list) => list.id)} strategy={horizontalListSortingStrategy}>{lists.map((list, index) => <Column key={list.id} list={list} lists={lists} dumps={dumps.filter((dump) => dump.list === list.id)} actions={actions} index={index} edit={edit} />)}</SortableContext>
    <button className="new-column" onClick={create}><Plus size={17} />New list</button>
  </div></DndContext>;
}
