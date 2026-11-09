import { useEffect, useState } from 'react';
import { Asterisk, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { Collection, Dump } from '../../shared/schema';
import type { DumpActions } from './DumpCard';
import { ListDot } from './ListDot';

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
      isOpen
      width={520}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Layout
        header={
          <DialogHeader
            title="A little sorting session."
            subtitle={
              dumps.length
                ? `${dumps.length} thoughts to give a home. There’s no hurry.`
                : 'Every thought has a home. A little lighter.'
            }
            onOpenChange={() => close()}
          />
        }
        content={
          <LayoutContent padding={5}>
            {current ? (
              <VStack gap={4}>
                <Text
                  type="large"
                  as="p"
                  display="block"
                  className="whitespace-pre-wrap wrap-anywhere"
                >
                  {current.text}
                </Text>
                <HStack gap={2} wrap="wrap">
                  {lists.map((list, index) => (
                    <Button
                      key={list.id}
                      size="sm"
                      label={list.label}
                      icon={<ListDot color={list.color} />}
                      onClick={() => actions.file(current, list.id)}
                    >
                      {list.label}
                      {index < 9 && (
                        <Text
                          type="supporting"
                          size="2xs"
                          color="inherit"
                          className="ml-1 opacity-60"
                        >
                          {index + 1}
                        </Text>
                      )}
                    </Button>
                  ))}
                </HStack>
                <Divider />
                <HStack hAlign="between" gap={1}>
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Remove"
                    icon={<Icon icon={Trash2} size="sm" color="inherit" />}
                    onClick={() => actions.remove(current)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Skip"
                    endContent={<Icon icon={ChevronRight} size="sm" color="inherit" />}
                    onClick={() => setIndex((value) => value + 1)}
                  />
                </HStack>
              </VStack>
            ) : (
              <VStack gap={4} hAlign="center" padding={5}>
                <Icon icon={Asterisk} size="lg" color="accent" />
                <Button variant="primary" label="Back to my space" onClick={close} />
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
