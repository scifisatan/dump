import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme } from 'next-themes';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/geist';
import './styles.css';

const App = lazy(() => import('./App'));
const Marketing = lazy(() => import('./Marketing'));
function Notifications() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
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
        <main className="fatal">
          <h1>Let’s reopen your space.</h1>
          <p>The page ran into a problem. Your saved dumps are still in this browser.</p>
          <button className="primary" onClick={() => location.reload()}>
            Reload Dump
          </button>
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
          <Suspense fallback={<div className="loading-space">Opening a little headspace…</div>}>
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
