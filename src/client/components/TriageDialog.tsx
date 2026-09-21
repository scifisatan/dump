import { useEffect, useState } from 'react';
import { Asterisk, ChevronRight, Trash2 } from 'lucide-react';
import type { Collection, Dump } from '../../shared/schema';
import type { DumpActions } from './DumpCard';
import { ListDot } from './ListDot';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function TriageDialog({
  dumps,
  lists,
  actions,
  close,
}: {
  dumps: Dump[];
  lists: Collection[];
  actions: DumpActions;
  close: () => void;
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
      if (!current) return;
      // 1–9 pick the first nine lists in sidebar order; every list also has a button.
      const list = /^[1-9]$/.test(event.key) ? lists[Number(event.key) - 1] : undefined;
      if (list) {
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
  }, [current, lists, actions]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
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
            <p className="py-3 text-[22px] leading-[1.6] whitespace-pre-wrap wrap-anywhere">
              {current.text}
            </p>
            <div className="flex flex-wrap gap-2">
              {lists.map((list, index) => (
                <Button
                  variant="outline"
                  key={list.id}
                  className="text-[12px]"
                  onClick={() => actions.file(current, list.id)}
                >
                  <ListDot color={list.color} />
                  {list.label}
                  {index < 9 && (
                    <kbd className="ml-0.5 text-[10px] text-muted-foreground [font:inherit]">
                      {index + 1}
                    </kbd>
                  )}
                </Button>
              ))}
            </div>
            <div className="flex justify-between gap-1 border-t pt-3.75 *:text-[11px]">
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
          <div className="grid justify-items-center gap-4.5 p-5 text-accent-foreground">
            <Asterisk size={48} />
            <Button onClick={close}>Back to my space</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
