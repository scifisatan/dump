// The loading screen (#boot in index.html) covers the page from first paint, before any script
// runs. Whatever is still loading holds it; when the last hold is released it fades out. It only
// appears after DELAY and then stays at least MIN_VISIBLE, so fast loads show nothing and slow
// ones never flicker.
const DELAY = 200; // matches #boot's animation-delay in index.html
const MIN_VISIBLE = 500;

const screen = () => document.getElementById('boot');
// The page load itself is the first hold, released after React's first commit.
let holds = 1;
let visibleFrom = DELAY;
let pending: ReturnType<typeof setTimeout> | undefined;

function settle() {
  const boot = screen();
  if (holds > 0 || !boot || boot.dataset.state !== 'shown') return;
  const now = performance.now();
  if (now < visibleFrom) {
    boot.dataset.state = 'hidden';
    return;
  }
  clearTimeout(pending);
  pending = setTimeout(
    () => {
      if (holds > 0) return;
      boot.dataset.state = 'leaving';
      // The notes inside animate too; only the screen's own fade-out counts.
      const ended = (event: AnimationEvent) => {
        if (event.target === boot) done();
      };
      const done = () => {
        boot.removeEventListener('animationend', ended);
        if (boot.dataset.state === 'leaving') boot.dataset.state = 'hidden';
      };
      boot.addEventListener('animationend', ended);
      setTimeout(done, 400);
    },
    Math.max(0, visibleFrom + MIN_VISIBLE - now),
  );
}

function holder() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    // Wait a frame: whatever replaces the released content may take its own hold.
    requestAnimationFrame(settle);
  };
}

export const releasePageLoad = holder();

// Returns the release function, so it can be a layout effect's cleanup.
export function holdBoot() {
  holds++;
  clearTimeout(pending);
  const boot = screen();
  if (boot && boot.dataset.state !== 'shown') {
    boot.dataset.state = 'shown';
    visibleFrom = performance.now() + DELAY;
  }
  return holder();
}

// An error screen must not stay covered.
export function dismissBoot() {
  holds = 0;
  clearTimeout(pending);
  const boot = screen();
  if (boot) boot.dataset.state = 'hidden';
}
