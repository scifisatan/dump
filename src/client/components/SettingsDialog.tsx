import { useRef, type ReactNode } from 'react';
import { ArrowDownToLine, Upload } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Code } from '@astryxdesign/core/Code';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { Kbd } from '@astryxdesign/core/Kbd';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useColorMode, type ColorMode } from '../lib/colorMode';
import { toast } from '../lib/toast';
import { client, currentProfile, exportDumps } from '../store';
import { ServerSettings } from './ServerSettings';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section variant="transparent" dividers={['top']} paddingBlock={4}>
      <VStack gap={3}>
        <Heading level={3}>
          <Text type="label">{title}</Text>
        </Heading>
        {children}
      </VStack>
    </Section>
  );
}

function Shortcut({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <Text type="supporting">{label}</Text>
      {children}
    </HStack>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  ready,
  signedOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ready: boolean;
  signedOut: boolean;
}) {
  const { mode, setMode } = useColorMode();
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} width={480}>
      <Layout
        header={
          <DialogHeader
            title="Your space, your way."
            subtitle="A few small things to make yourself at home."
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent isScrollable padding={5}>
            <Part title="Your server">
              <ServerSettings signedOut={signedOut} />
            </Part>
            <Part title="Appearance">
              <SegmentedControl
                label="Appearance"
                layout="fill"
                value={mode}
                onChange={(value) => setMode(value as ColorMode)}
              >
                <SegmentedControlItem value="light" label="Light" />
                <SegmentedControlItem value="dark" label="Dark" />
                <SegmentedControlItem value="system" label="System" />
              </SegmentedControl>
              <Text type="supporting">Saved on this device.</Text>
            </Part>
            <Part title="Your data">
              <Text type="supporting">
                Take a copy with you. Import adds missing thoughts and lists without replacing
                existing records.
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Export backup"
                  tooltip="Export all dumps"
                  icon={<Icon icon={ArrowDownToLine} size="sm" color="inherit" />}
                  isDisabled={!ready}
                  onClick={exportDumps}
                />
                <Button
                  label="Import backup"
                  icon={<Icon icon={Upload} size="sm" color="inherit" />}
                  isDisabled={!ready}
                  onClick={() => importRef.current?.click()}
                />
              </HStack>
            </Part>
            <Part title="About this space">
              <Text type="supporting">
                {currentProfile.server
                  ? 'Your thoughts live on this device and your own server. Only devices with its owner key can reach them.'
                  : 'Your thoughts live only on this device. Export a backup now and then.'}
              </Text>
              <Link href="/marketing" isStandalone>
                A little about Dump ↗
              </Link>
            </Part>
            <Part title="A few handy shortcuts">
              <Shortcut label="Capture a thought">
                <Kbd keys="enter" />
              </Shortcut>
              <Shortcut label="A new line">
                <Kbd keys="shift+enter" />
              </Shortcut>
              <Shortcut label="Search your space">
                <Kbd keys="mod+k" />
              </Shortcut>
              <Shortcut label="File as you type">
                <Text type="supporting">
                  <Code size="inherit">!buy</Code> <Code size="inherit">#weekend</Code>
                </Text>
              </Shortcut>
            </Part>
            {/* Astryx has a file picker field, but a backup import needs only the browser's dialog. */}
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Import backup file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (file.size > 8 * 1024 * 1024) {
                  toast.error('Please use a backup smaller than 8 MB.');
                  return;
                }
                try {
                  const count = client.importDumps(JSON.parse(await file.text()));
                  toast(
                    `${count} ${count === 1 ? 'dump' : 'dumps'} restored. Existing items were kept.`,
                  );
                } catch {
                  toast.error('This is not a compatible Dump backup. Nothing was imported.');
                }
              }}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
