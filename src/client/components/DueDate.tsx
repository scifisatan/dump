import { useState, type FormEvent } from 'react';
import { CalendarDays, Check, X } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { dayKey } from '../../shared/due';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenuItem } from './ui/dropdown-menu';
import { Input } from './ui/input';

// A due day as it reads from today: Today, Tomorrow, a weekday within the week, else a date.
export function dueLabel(due: string, now = new Date()) {
  const day = parseISO(due);
  const ahead = differenceInCalendarDays(day, now);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead === -1) return 'Yesterday';
  if (ahead > 1 && ahead < 7) return format(day, 'EEEE');
  return format(day, day.getFullYear() === now.getFullYear() ? 'EEE, MMM d' : 'MMM d, y');
}

// The quick choices for a dump's day. `pick` opens DuePicker for any other day.
export function DueMenuItems({
  due,
  set,
  pick,
}: {
  due: string | null;
  set: (due: string | null) => void;
  pick: () => void;
}) {
  const today = dayKey(Date.now());
  const tomorrow = dayKey(addDays(new Date(), 1));
  return (
    <>
      <DropdownMenuItem onSelect={() => set(today)}>
        Today{due === today && <Check className="ml-auto" />}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => set(tomorrow)}>
        Tomorrow{due === tomorrow && <Check className="ml-auto" />}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={pick}>Pick a day…</DropdownMenuItem>
      {due && <DropdownMenuItem onSelect={() => set(null)}>Clear date</DropdownMenuItem>}
    </>
  );
}

export function DuePicker({
  due,
  save,
  close,
}: {
  due: string | null;
  save: (due: string) => void;
  close: () => void;
}) {
  const [value, setValue] = useState(due ?? dayKey(Date.now()));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    save(value);
    close();
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
          <DialogTitle>Pick a day.</DialogTitle>
          <DialogDescription>It shows up in Today when the day comes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3.25">
          <label htmlFor="due-day" className="text-[12px]">
            Day
          </label>
          <Input
            id="due-day"
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
          <Button type="submit" className="mt-3" disabled={!value}>
            Save day
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The day the composer read from the draft, before it is sent. `skip` sends it undated instead.
export function DraftDue({ due, skip }: { due: string; skip: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary py-0.5 pr-0.5 pl-2 text-[11px] text-secondary-foreground">
      <CalendarDays size={13} aria-hidden />
      <span className="sr-only">Due </span>
      {dueLabel(due)}
      <button
        type="button"
        className="grid size-5 place-items-center rounded-full hover:bg-muted"
        aria-label="Dump without a date"
        // Keep focus in the composer so a tap does not close the phone keyboard.
        onPointerDown={(event) => event.preventDefault()}
        onClick={skip}
      >
        <X size={12} />
      </button>
    </span>
  );
}
