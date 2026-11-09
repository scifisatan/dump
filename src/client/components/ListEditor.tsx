import { useState, type FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { LIST_COLORS, paletteFor, type Collection } from '../../shared/schema';
import { client } from '../store';

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
  const [color, setColor] = useState(list?.color.toLowerCase() ?? LIST_COLORS[0]);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  function remove() {
    if (!list) return;
    try {
      client.deleteList(list.id);
      deleted?.(list);
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete this list.');
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      saved(client.saveList(label, color, list?.id));
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this list.');
    }
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
            title={list ? 'Make it yours.' : 'A home for something.'}
            subtitle={
              list
                ? 'Update your list’s name and color.'
                : 'Start with a name. You can change it whenever you like.'
            }
            onOpenChange={() => close()}
          />
        }
        content={
          <LayoutContent padding={5}>
            <form onSubmit={submit}>
              <VStack gap={4}>
                <TextInput
                  label="List name"
                  value={label}
                  onChange={(value) => setLabel(value.slice(0, 40))}
                  placeholder="Books, weekend plans, someday…"
                  status={error ? { type: 'error', message: error } : undefined}
                />
                <fieldset>
                  <legend className="mb-3">
                    <Text type="label">Color</Text>
                  </legend>
                  <VStack gap={3}>
                    {/* List colours are data the owner picks, so each swatch paints its own. */}
                    <HStack gap={3} padding={1}>
                      {paletteFor(color).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="size-6.75 rounded-full aria-pressed:outline-2 aria-pressed:outline-offset-4 aria-pressed:outline-accent-bg"
                          style={{ background: value }}
                          aria-label={`Color ${value}`}
                          aria-pressed={color === value}
                          onClick={() => setColor(value)}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </fieldset>
                <Button
                  type="submit"
                  variant="primary"
                  label={list ? 'Save changes' : 'Create list'}
                  isDisabled={!label.trim()}
                />
                {list && (
                  <Button
                    variant={confirming ? 'destructive' : 'ghost'}
                    label={confirming ? 'Delete list — its dumps get re-sorted' : 'Delete list'}
                    onClick={() => (confirming ? remove() : setConfirming(true))}
                  />
                )}
              </VStack>
            </form>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
