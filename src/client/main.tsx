import React, { lazy, Suspense, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme } from 'next-themes';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/geist';
import './styles.css';

const App = lazy(() => import('./App'));
const Marketing = lazy(() => import('./Marketing'));
// Matches Tailwind's `phone` breakpoint (47.5rem).
const phoneQuery = window.matchMedia('(max-width: 47.4375rem)');
const subscribePhone = (listener: () => void) => {
  phoneQuery.addEventListener('change', listener);
  return () => phoneQuery.removeEventListener('change', listener);
};
function Notifications() {
  const { resolvedTheme } = useTheme();
  const phone = useSyncExternalStore(subscribePhone, () => phoneQuery.matches);
  return (
    <Toaster
      // Sit just below the app header so its actions and sync status stay reachable.
      position={phone ? 'top-center' : 'top-right'}
      offset={{ top: 76, right: 24 }}
      mobileOffset={{ top: 64, left: 12, right: 12 }}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      closeButton
      richColors
    />
  );
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <main className="grid min-h-dvh place-content-center gap-5 text-center text-muted-foreground">
          <h1>Let’s reopen your space.</h1>
          <p>The page ran into a problem. Your saved dumps are still in this browser.</p>
          <button onClick={() => location.reload()}>Reload Dump</button>
        </main>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      storageKey="dump-theme"
      disableTransitionOnChange
    >
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="grid min-h-dvh place-content-center gap-5 text-center text-muted-foreground">
                Opening a little headspace…
              </div>
            }
          >
            <Routes>
              <Route path="/marketing" element={<Marketing />} />
              <Route path="*" element={<App />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Notifications />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
const update = registerSW({
  onNeedRefresh() {
    toast('A new version of Dump is ready.', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void update(true) },
    });
  },
});
