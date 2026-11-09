import { useState, type FormEvent } from 'react';
import { CalendarDays, Check, X } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { DropdownMenuItem } from '@astryxdesign/core/DropdownMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { ISODateString } from '@astryxdesign/core/utils';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { dueLabel } from '../../core/views';
import { dayChoices, dayKey } from '../../shared/due';

const checked = <Icon icon={Check} size="sm" color="inherit" />;

/** The day choices shared by a dump's menu and its due chip. */
export function DueMenuItems({
  due,
  set,
  pick,
}: {
  due: string | null;
  set: (due: string | null) => void;
  pick: () => void;
}) {
  const { today, tomorrow } = dayChoices(Date.now());
  return (
    <>
      <DropdownMenuItem
        label="Today"
        endContent={due === today ? checked : undefined}
        onClick={() => set(today)}
      />
      <DropdownMenuItem
        label="Tomorrow"
        endContent={due === tomorrow ? checked : undefined}
        onClick={() => set(tomorrow)}
      />
      <DropdownMenuItem label="Pick a day…" onClick={pick} />
      {due && <DropdownMenuItem label="Clear date" onClick={() => set(null)} />}
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
  // Due days are already YYYY-MM-DD strings (shared/due.ts).
  const [value, setValue] = useState((due ?? dayKey(Date.now())) as ISODateString | undefined);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    save(value);
    close();
  }
  return (
    <Dialog
      isOpen
      purpose="form"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Layout
        header={
          <DialogHeader
            title="Pick a day."
            subtitle="It shows up in Today when the day comes."
            onOpenChange={() => close()}
          />
        }
        content={
          <LayoutContent padding={5}>
            <form onSubmit={submit}>
              <VStack gap={4}>
                <DateInput label="Day" value={value} onChange={setValue} />
                <Button type="submit" variant="primary" label="Save day" isDisabled={!value} />
              </VStack>
            </form>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

/** The day read from the draft, shown in the composer; × dumps without it. */
export function DraftDue({ due, skip }: { due: string; skip: () => void }) {
  return (
    <HStack
      gap={1}
      vAlign="center"
      className="shrink-0 rounded-full bg-accent-muted py-0.5 pr-0.5 pl-2"
    >
      <Icon icon={CalendarDays} size="xsm" color="accent" />
      <Text type="supporting" size="xsm" color="accent">
        <VisuallyHidden>Due </VisuallyHidden>
        {dueLabel(due, Date.now())}
      </Text>
      <IconButton
        size="sm"
        variant="ghost"
        label="Dump without a date"
        icon={<Icon icon={X} size="xsm" />}
        // Keep focus in the composer so a tap does not close the phone keyboard.
        onPointerDown={(event) => event.preventDefault()}
        onClick={skip}
      />
    </HStack>
  );
}
