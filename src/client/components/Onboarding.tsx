import { useState, type ComponentType } from 'react';
import { ArrowLeft, Cloud, Laptop } from 'lucide-react';
import type { ServerLocation } from '../../core/connection';
import { activateProfile, deviceOnlyProfile, profileForServer, saveKey } from '../profiles';
import { ServerConnection } from './ServerConnection';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const SETUP_GUIDE = 'https://github.com/scifisatan/dump#deploy-your-server';
// No notebook is open during first-run setup, so there is nothing to close before switching.
const nothingOpen = async () => {};

function Choice({
  Icon,
  title,
  body,
  onClick,
}: {
  Icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={onClick}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span className="space-y-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

// First-run setup from the landing page. Nothing is saved until a server accepts the owner key
// or the visitor keeps the notebook on this device; the page then reopens as the notebook.
export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'choose' | 'server'>('choose');

  async function connectServer(server: ServerLocation, key: string) {
    const profile = profileForServer(server);
    saveKey(profile.id, key);
    await activateProfile(profile, nothingOpen);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'choose' ? 'Where should your thoughts live?' : 'Connect your server.'}
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' ? (
              'Starting on this device? You can connect a server later from Settings.'
            ) : (
              <>
                Enter your Dump server’s address and its owner key.{' '}
                <a
                  href={SETUP_GUIDE}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-3"
                >
                  Set one up
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {step === 'choose' ? (
          <div className="grid gap-2.5">
            <Choice
              Icon={Cloud}
              title="Sync with your server"
              body="Your own Dump server keeps a copy and syncs your devices. Automatic filing works when the server has Jev."
              onClick={() => setStep('server')}
            />
            <Choice
              Icon={Laptop}
              title="Just this device"
              body="Nothing leaves this browser. No sync or automatic filing; export backups from Settings."
              onClick={() => void activateProfile(deviceOnlyProfile(), nothingOpen)}
            />
          </div>
        ) : (
          <>
            <ServerConnection onConnect={connectServer} />
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => setStep('choose')}
            >
              <ArrowLeft />
              Back
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
