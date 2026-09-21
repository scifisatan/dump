import { useState, type FormEvent } from 'react';
import type { Collection } from '../../shared/schema';
import { deleteList, saveList } from '../store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

const colors = ['#9b84d6', '#c49651', '#6395c3', '#849c74', '#cd7f86', '#849299'];
export function ListEditor({
  list,
  close,
  saved,
  deleted,
}: {
  list?: Collection;
  close: () => void;
  saved: (list: Collection) => void;
  deleted?: (list: Collection) => void;
}) {
  const [label, setLabel] = useState(list?.label ?? '');
  const [color, setColor] = useState(list?.color ?? colors[0]);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  function remove() {
    if (!list) return;
    try {
      deleteList(list.id);
      deleted?.(list);
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete this list.');
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      saved(saveList(label, color, list?.id));
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this list.');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{list ? 'Make it yours.' : 'A home for something.'}</DialogTitle>
          <DialogDescription>
            {list
              ? 'Update your list’s name and color.'
              : 'Start with a name. You can change it whenever you like.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3.25">
          <label htmlFor="list-name" className="text-[12px]">
            List name
          </label>
          <Input
            id="list-name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            required
            placeholder="Books, weekend plans, someday…"
          />
          <fieldset>
            <legend className="mt-2 mb-3 text-[12px]">Color</legend>
            <div className="flex gap-3.25 p-1.25">
              {colors.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="size-6.75 rounded-full aria-pressed:outline-2 aria-pressed:outline-offset-4 aria-pressed:outline-ring"
                  style={{ background: value }}
                  aria-label={`Color ${value}`}
                  aria-pressed={color === value}
                  onClick={() => setColor(value)}
                />
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-3" disabled={!label.trim()}>
            {list ? 'Save changes' : 'Create list'}
          </Button>
          {list && (
            <Button
              type="button"
              variant={confirming ? 'destructive' : 'ghost'}
              className={confirming ? undefined : 'text-destructive'}
              onClick={() => (confirming ? remove() : setConfirming(true))}
            >
              {confirming ? 'Delete list — its dumps get re-sorted' : 'Delete list'}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
