import { useRef } from 'react';
import { ArrowDownToLine, Monitor, Moon, Sun, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { exportDumps, importDumps } from '../store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function SettingsDialog({ open, onOpenChange, ready }: { open: boolean; onOpenChange: (open: boolean) => void; ready: boolean }) {
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>Your space, your way.</DialogTitle><DialogDescription>A few small things to make yourself at home.</DialogDescription></DialogHeader>
    <section className="settings-section"><h3>Appearance</h3><div className="theme-options">{[{ id: 'light', label: 'Light', Icon: Sun }, { id: 'dark', label: 'Dark', Icon: Moon }, { id: 'system', label: 'System', Icon: Monitor }].map(({ id, label, Icon }) => <Button key={id} variant={theme === id ? 'secondary' : 'outline'} aria-pressed={theme === id} onClick={() => setTheme(id)}><Icon size={18} />{label}</Button>)}</div><p>Saved on this device.</p></section>
    <section className="settings-section"><h3>Your data</h3><p>Take a copy with you. Import adds missing thoughts and lists without replacing existing records.</p><div className="settings-actions"><Button variant="outline" onClick={exportDumps} disabled={!ready} title="Export all dumps"><ArrowDownToLine />Export backup</Button><Button variant="outline" onClick={() => importRef.current?.click()} disabled={!ready}><Upload />Import backup</Button></div></section>
    <section className="settings-section"><h3>About this space</h3><p>This deployment is public. Anyone with the address can access the shared space.</p></section>
    <section className="settings-section"><h3>A few handy shortcuts</h3><dl className="shortcuts"><div><dt>Capture a thought</dt><dd><kbd>Enter</kbd></dd></div><div><dt>A new line</dt><dd><kbd>Shift Enter</kbd></dd></div><div><dt>Search your space</dt><dd><kbd>Ctrl / ⌘ K</kbd></dd></div><div><dt>File as you type</dt><dd><code>!buy</code> <code>#weekend</code></dd></div></dl></section>
    <input ref={importRef} type="file" accept="application/json,.json" hidden aria-label="Import backup file" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error('Please use a backup smaller than 8 MB.');
        const count = importDumps(JSON.parse(await file.text()));
        toast(`${count} ${count === 1 ? 'dump' : 'dumps'} restored. Existing items were kept.`);
      } catch (error) { toast.error(error instanceof Error && error.message.includes('8 MB') ? error.message : 'This is not a compatible Dump backup. Nothing was imported.'); }
    }} />
  </DialogContent></Dialog>;
}
