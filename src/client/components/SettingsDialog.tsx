import { useRef } from 'react';
import { ArrowDownToLine, Monitor, Moon, Sun, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { exportDumps, importDumps } from '../store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const section = 'border-t pt-4.75 max-phone:pt-4';
const heading = 'mb-3 text-[12px] font-[550]';
const note = 'my-2.5 text-[11px] leading-[1.8] text-muted-foreground';
const shortcut = 'flex items-center justify-between gap-3 py-1.5';

export function SettingsDialog({
  open,
  onOpenChange,
  ready,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ready: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your space, your way.</DialogTitle>
          <DialogDescription>A few small things to make yourself at home.</DialogDescription>
        </DialogHeader>
        <section className={section}>
          <h3 className={heading}>Appearance</h3>
          <div className="flex flex-wrap gap-2.25">
            {[
              { id: 'light', label: 'Light', Icon: Sun },
              { id: 'dark', label: 'Dark', Icon: Moon },
              { id: 'system', label: 'System', Icon: Monitor },
            ].map(({ id, label, Icon }) => (
              <Button
                key={id}
                variant={theme === id ? 'secondary' : 'outline'}
                className="flex-1 text-[12px] max-phone:p-2 max-phone:text-[11px]"
                aria-pressed={theme === id}
                onClick={() => setTheme(id)}
              >
                <Icon size={18} />
                {label}
              </Button>
            ))}
          </div>
          <p className={note}>Saved on this device.</p>
        </section>
        <section className={section}>
          <h3 className={heading}>Your data</h3>
          <p className={note}>
            Take a copy with you. Import adds missing thoughts and lists without replacing existing
            records.
          </p>
          <div className="flex flex-wrap gap-2.25 *:text-[11px]">
            <Button
              variant="outline"
              onClick={exportDumps}
              disabled={!ready}
              title="Export all dumps"
            >
              <ArrowDownToLine />
              Export backup
            </Button>
            <Button variant="outline" onClick={() => importRef.current?.click()} disabled={!ready}>
              <Upload />
              Import backup
            </Button>
          </div>
        </section>
        <section className={section}>
          <h3 className={heading}>About this space</h3>
          <p className={note}>
            This deployment is public. Anyone with the address can access the shared space.
          </p>
          <a href="/marketing" className="text-[11px] text-accent-foreground hover:underline">
            A little about Dump ↗
          </a>
        </section>
        <section className={section}>
          <h3 className={heading}>A few handy shortcuts</h3>
          <dl className="text-[11px]">
            <div className={shortcut}>
              <dt>Capture a thought</dt>
              <dd>
                <kbd>Enter</kbd>
              </dd>
            </div>
            <div className={shortcut}>
              <dt>A new line</dt>
              <dd>
                <kbd>Shift Enter</kbd>
              </dd>
            </div>
            <div className={shortcut}>
              <dt>Search your space</dt>
              <dd>
                <kbd>Ctrl / ⌘ K</kbd>
              </dd>
            </div>
            <div className={shortcut}>
              <dt>File as you type</dt>
              <dd>
                <code>!buy</code> <code>#weekend</code>
              </dd>
            </div>
          </dl>
        </section>
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
            try {
              if (file.size > 8 * 1024 * 1024)
                throw new Error('Please use a backup smaller than 8 MB.');
              const count = importDumps(JSON.parse(await file.text()));
              toast(
                `${count} ${count === 1 ? 'dump' : 'dumps'} restored. Existing items were kept.`,
              );
            } catch (error) {
              toast.error(
                error instanceof Error && error.message.includes('8 MB')
                  ? error.message
                  : 'This is not a compatible Dump backup. Nothing was imported.',
              );
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
