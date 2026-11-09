// First: styles.css declares the cascade-layer order every later stylesheet lands in.
import './styles.css';
import React, { lazy, Suspense, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';
import { dismissBoot, holdBoot, releasePageLoad } from './boot';
import { RouterLink } from './components/RouterLink';
import { useColorMode } from './lib/colorMode';
import { toast, ToastBridge } from './lib/toast';
import { hasNotebook } from './registry';
import { themes, defaultThemeSlug } from '../astryx-themes';

const App = lazy(() => import('./App'));
const Marketing = lazy(() => import('./Marketing'));

// Settings' Light / Dark / System choice drives the Astryx theme.
function AstryxTheme({ children }: React.PropsWithChildren) {
  const { resolved } = useColorMode();
  return (
    <Theme theme={themes[defaultThemeSlug]} mode={resolved}>
      {children}
    </Theme>
  );
}

function Loading() {
  useLayoutEffect(holdBoot, []);
  return null;
}
function FirstCommit() {
  useLayoutEffect(releasePageLoad, []);
  return null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    dismissBoot();
  }
  render() {
    if (this.state.error)
      return (
        <AppShell mobileNav={false}>
          <EmptyState
            headingLevel={1}
            title="Let’s reopen your space."
            description="The page ran into a problem. Your saved dumps are still in this browser."
            actions={<Button label="Reload Dump" onClick={() => location.reload()} />}
          />
        </AppShell>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AstryxTheme>
      {/* Toasts sit at the top end, below the top bar. */}
      <LayerProvider toast={{ position: 'topEnd', inset: { top: 64 } }}>
        <ErrorBoundary>
          <BrowserRouter>
            <LinkProvider component={RouterLink}>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/marketing" element={<Marketing />} />
                  <Route path="*" element={hasNotebook() ? <App /> : <Marketing />} />
                </Routes>
              </Suspense>
            </LinkProvider>
          </BrowserRouter>
          <ToastBridge />
          <FirstCommit />
        </ErrorBoundary>
      </LayerProvider>
    </AstryxTheme>
  </React.StrictMode>,
);
const update = registerSW({
  onNeedRefresh() {
    toast('A new version of Dump is ready.', {
      persistent: true,
      action: { label: 'Reload', onClick: () => void update(true) },
    });
  },
});
