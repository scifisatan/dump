import { useState } from 'react';
import { ArrowLeft, Cloud, Laptop, type LucideIcon } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { verifyKey, type ServerLocation, type ServerProfile } from '../../core/connection';
import { deviceOnlyProfile } from '../../core/profiles';
import { registry, reopen, saveKey } from '../profiles';
import { ServerConnection } from './ServerConnection';

const SETUP_GUIDE = 'https://github.com/scifisatan/dump#deploy-your-server';
function open(profile: ServerProfile) {
  registry.activate(profile);
  reopen();
}

function Choice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <ClickableCard label={title} padding={3} onClick={onClick}>
      <HStack gap={3} vAlign="start">
        <Icon icon={icon} className="mt-0.5 shrink-0" />
        <VStack gap={1}>
          <Text weight="medium">{title}</Text>
          <Text type="supporting">{body}</Text>
        </VStack>
      </HStack>
    </ClickableCard>
  );
}

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'choose' | 'server'>('choose');

  async function connectServer(server: ServerLocation, key: string, signal: AbortSignal) {
    await verifyKey(server.baseUrl, key, signal);
    const profile = registry.joining(undefined, server);
    saveKey(profile.id, key);
    open(profile);
  }

  const close = (isOpen: boolean) => !isOpen && onClose();
  return (
    <Dialog isOpen onOpenChange={close}>
      <Layout
        header={
          <DialogHeader
            title={step === 'choose' ? 'Where should your thoughts live?' : 'Connect your server.'}
            subtitle={
              step === 'choose' ? (
                'Starting on this device? You can connect a server later from Settings.'
              ) : (
                <>
                  Enter your Dump server’s address and its owner key.{' '}
                  <Link href={SETUP_GUIDE} target="_blank" rel="noreferrer">
                    Set one up
                  </Link>
                </>
              )
            }
            onOpenChange={close}
          />
        }
        content={
          <LayoutContent padding={5}>
            {step === 'choose' ? (
              <VStack gap={2}>
                <Choice
                  icon={Cloud}
                  title="Sync with your server"
                  body="Your own Dump server keeps a copy and syncs your devices. Automatic filing works when the server has Jev."
                  onClick={() => setStep('server')}
                />
                <Choice
                  icon={Laptop}
                  title="Just this device"
                  body="Nothing leaves this browser. No sync or automatic filing; export backups from Settings."
                  onClick={() => open(deviceOnlyProfile())}
                />
              </VStack>
            ) : (
              <VStack gap={4} hAlign="start">
                <ServerConnection onConnect={connectServer} />
                <Button
                  variant="ghost"
                  label="Back"
                  icon={<Icon icon={ArrowLeft} size="sm" color="inherit" />}
                  onClick={() => setStep('choose')}
                />
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
