import { useState } from 'react';
import { CalendarDays, Check, Circle, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { dueLabel, linkHost, timeLabel } from '../../core/views';
import { isOverdue } from '../../shared/due';
import type { Collection, Dump } from '../../shared/schema';
import { DueMenuItems, DuePicker } from './DueDate';
import { cn } from '../lib/utils';
import { ListDot } from './ListDot';

export type DumpActions = {
  complete: (dump: Dump) => void;
  remove: (dump: Dump) => void;
  file: (dump: Dump, list: string | null) => void;
  due: (dump: Dump, due: string | null) => void;
  openList: (list: string) => void;
  tag: (tag: string) => void;
};

const checked = <Icon icon={Check} size="sm" color="inherit" />;
// The day, list and tag chips under a dump are metadata, so they sit smaller and lighter than
// the theme's small buttons.
const chip = 'h-7 gap-1.5 px-2.5 text-sm font-normal';

export function DumpCard({
  dump,
  lists,
  actions,
  showList = true,
  sorting = false,
}: {
  dump: Dump;
  lists: Collection[];
  actions: DumpActions;
  showList?: boolean;
  sorting?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const list = showList ? lists.find((item) => item.id === dump.list) : undefined;
  const now = Date.now();
  const overdue = isOverdue(dump, now);
  const hasMeta = list || sorting || dump.due || dump.tags.length > 0 || dump.url;
  const dueItems = (
    <DueMenuItems
      due={dump.due}
      set={(due) => actions.due(dump, due)}
      pick={() => setPicking(true)}
    />
  );
  return (
    <HStack
      as="article"
      gap={2}
      vAlign="start"
      paddingInline={3}
      paddingBlock={2}
      className="group animate-card-in hover:bg-overlay-hover"
    >
      <IconButton
        variant="ghost"
        size="sm"
        label={dump.done ? `Mark incomplete: ${dump.text}` : `Complete: ${dump.text}`}
        icon={<Icon icon={dump.done ? Check : Circle} size="sm" color="secondary" />}
        onClick={() => actions.complete(dump)}
      />
      <VStack gap={1} className="min-w-0 flex-1 py-1">
        <Text
          as="p"
          display="block"
          hasStrikethrough={dump.done}
          color={dump.done ? 'secondary' : 'primary'}
          className="whitespace-pre-wrap wrap-anywhere"
        >
          {dump.text}
        </Text>
        {hasMeta && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            {dump.due && (
              <DropdownMenu
                hasChevron={false}
                renderTrigger={(props) => (
                  <Button
                    {...props}
                    variant="ghost"
                    size="sm"
                    label={`${overdue ? 'Overdue' : 'Due'} ${dueLabel(dump.due!, now)}: change date`}
                    icon={<Icon icon={CalendarDays} size="xsm" color="inherit" />}
                    className={cn(
                      chip,
                      overdue ? 'bg-error-muted text-error' : 'bg-accent-muted text-accent',
                    )}
                  >
                    {dueLabel(dump.due!, now)}
                  </Button>
                )}
              >
                {dueItems}
              </DropdownMenu>
            )}
            {list && (
              <Button
                variant="ghost"
                size="sm"
                label={`Open ${list.label}`}
                icon={<ListDot color={list.color} size="sm" />}
                className={cn(chip, 'text-secondary')}
                onClick={() => actions.openList(list.id)}
              >
                {list.label}
              </Button>
            )}
            {sorting && !list && (
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant="accent" label="Sorting" isPulsing />
                <Text type="supporting" size="xsm">
                  Sorting…
                </Text>
              </HStack>
            )}
            {dump.tags.map((tag) => (
              <Button
                key={tag}
                variant="ghost"
                size="sm"
                label={`#${tag}`}
                className={cn(chip, 'text-secondary')}
                onClick={() => actions.tag(tag)}
              />
            ))}
            {dump.url && (
              <Link href={dump.url} isExternalLink size="sm" maxLines={1}>
                {linkHost(dump.url)}
              </Link>
            )}
          </HStack>
        )}
      </VStack>
      <Text type="supporting" size="xsm" hasTabularNumbers className="shrink-0 pt-2">
        <time
          dateTime={new Date(dump.created_at).toISOString()}
          title={new Date(dump.created_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          })}
        >
          {timeLabel(dump.created_at, now)}
        </time>
      </Text>
      <DropdownMenu
        hasChevron={false}
        alignment="end"
        menuWidth={192}
        menuMaxHeight={520}
        renderTrigger={(props) => (
          <IconButton
            {...props}
            variant="ghost"
            size="sm"
            label={`Actions: ${dump.text}`}
            icon={<Icon icon={MoreHorizontal} size="sm" />}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          />
        )}
      >
        <DropdownMenuSubMenu label={dump.due ? 'Change date' : 'Set a date'} icon={CalendarDays}>
          {dueItems}
        </DropdownMenuSubMenu>
        <DropdownMenuDivider />
        <DropdownMenuGroup title="Move to">
          <DropdownMenuItem
            label="Inbox"
            icon={ListDot}
            endContent={!dump.list ? checked : undefined}
            onClick={() => actions.file(dump, null)}
          />
          {lists.map((item) => (
            <DropdownMenuItem
              key={item.id}
              label={item.label}
              icon={() => <ListDot color={item.color} />}
              endContent={item.id === dump.list ? checked : undefined}
              onClick={() => actions.file(dump, item.id)}
            />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={dump.done ? 'Mark incomplete' : 'Mark done'}
          icon={Check}
          onClick={() => actions.complete(dump)}
        />
        <DropdownMenuItem
          label="Remove dump"
          icon={Trash2}
          variant="destructive"
          onClick={() => actions.remove(dump)}
        />
      </DropdownMenu>
      {picking && (
        <DuePicker
          due={dump.due}
          save={(due) => actions.due(dump, due)}
          close={() => setPicking(false)}
        />
      )}
    </HStack>
  );
}
