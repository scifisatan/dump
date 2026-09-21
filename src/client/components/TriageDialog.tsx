import { useEffect, useState } from 'react';
import { Asterisk, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { LISTS, type Collection, type Dump } from '../../shared/schema';
import type { DumpActions } from './DumpCard';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function TriageDialog({
  dumps,
  lists,
  actions,
  close,
  undo,
  canUndo,
}: {
  dumps: Dump[];
  lists: Collection[];
  actions: DumpActions;
  close: () => void;
  undo: () => void;
  canUndo: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = dumps.length ? dumps[index % dumps.length] : undefined;
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undo();
      }
      if (!current) return;
      const list = LISTS.find((list) => list.shortcut === event.key.toLowerCase());
      if (list && lists.some((item) => item.id === list.id)) {
        event.preventDefault();
        actions.file(current, list.id);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((value) => value + 1);
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        actions.remove(current);
      }
    }
    document.addEventListener('keydown', shortcuts);
    return () => document.removeEventListener('keydown', shortcuts);
  }, [current, lists, actions, undo]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="triage-dialog">
        <DialogHeader>
          <DialogTitle>A little sorting session.</DialogTitle>
          <DialogDescription>
            {dumps.length
              ? `${dumps.length} thoughts to give a home. There’s no hurry.`
              : 'Every thought has a home. A little lighter.'}
          </DialogDescription>
        </DialogHeader>
        {current ? (
          <>
            <p className="triage-thought">{current.text}</p>
            <div className="triage-options">
              {lists.map((list) => (
                <Button
                  variant="outline"
                  key={list.id}
                  onClick={() => actions.file(current, list.id)}
                >
                  <span className="list-dot" style={{ background: list.color }} />
                  {list.label}
                </Button>
              ))}
            </div>
            <div className="triage-footer">
              <Button variant="ghost" disabled={!canUndo} onClick={undo}>
                <RotateCcw />
                Undo
              </Button>
              <Button variant="ghost" onClick={() => actions.remove(current)}>
                <Trash2 />
                Remove
              </Button>
              <Button variant="ghost" onClick={() => setIndex((value) => value + 1)}>
                Skip
                <ChevronRight />
              </Button>
            </div>
          </>
        ) : (
          <div className="triage-complete">
            <Asterisk size={48} />
            <Button onClick={close}>Back to my space</Button>
            <Button variant="ghost" disabled={!canUndo} onClick={undo}>
              Undo last action
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
