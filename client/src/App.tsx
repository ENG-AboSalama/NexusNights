import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Login } from './auth/Login';
import { I18nProvider } from './i18n';
import { TopBar } from './components/TopBar';
import { GlobalHome } from './pages/GlobalHome';
import { UnifiedTitlePage } from './pages/UnifiedTitlePage';
import { GlobalTitle } from './pages/GlobalTitle';
import { Watch } from './pages/Watch';
import { RoomProvider, useRoom } from './room/RoomContext';
import { RoomBanner } from './room/RoomBanner';
import { Toasts } from './room/Toasts';
import { UniversalEmbedPlayer } from './player/embed/UniversalEmbedPlayer';
import { ProvidersDashboard } from './pages/ProvidersDashboard';
import { DiscoverRooms } from './pages/DiscoverRooms';
import { AdminDashboard } from './pages/AdminDashboard';
import { go, useRoute } from './router';

/** Shown when a non-admin tries to access an admin-only page */
function AdminGate({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  // While auth+admin check is in-flight, render nothing (parent shows spinner)
  if (loading) return null;
  if (!isAdmin) {
    // Not an admin — send them to the Admin login page to enter a token
    go.adminDashboard();
    return null;
  }
  return <>{children}</>;
}

function Routes() {
  const route = useRoute();
  const room = useRoom();

  // Everybody follows the room: when the room starts / switches media, open it.
  const last = useRef<string | null>(null);
  const mediaId = room.state?.mediaId ?? null;
  useEffect(() => {
    if (!room.active || room.connection !== 'connected') { last.current = null; return; }
    if (mediaId && mediaId !== last.current) {
      last.current = mediaId;
      if (!(route.name === 'watch' && route.id === mediaId)) {
        window.location.hash = room.roomId ? `#/watch/${mediaId}?room=${room.roomId}` : `#/watch/${mediaId}`;
      }
    }
  }, [mediaId, room.active, room.connection, room.roomId, route]);

  if (route.name === 'watch') return <Watch key={route.id} id={route.id} />;
  if (route.name === 'embed-poc') {
    return (
      <UniversalEmbedPlayer
        title="Universal Player.js Compatibility POC"
        subtitle="Testing @videojs/playerjs-video & Video.js 10 Custom Skin"
        onBack={() => go.home()}
      />
    );
  }
  
  return (
    <>
      <TopBar />
      <RoomBanner />
      <Toasts />
      <main key={route.name === 'title' ? route.id : route.name === 'global-title' ? `${route.kind}-${route.tmdbId}` : route.name} className="animate-fade">
        {route.name === 'title' ? (
          <UnifiedTitlePage id={route.id} />
        ) : route.name === 'global-title' ? (
          <GlobalTitle kind={route.kind} tmdbId={route.tmdbId} />
        ) : route.name === 'providers' ? (
          <AdminGate><ProvidersDashboard /></AdminGate>
        ) : route.name === 'discover-rooms' ? (
          <DiscoverRooms />
        ) : route.name === 'admin-dashboard' ? (
          <AdminDashboard />
        ) : (
          <GlobalHome />
        )}
      </main>
    </>
  );
}

import { ErrorBoundary } from './components/ErrorBoundary';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blood-hot border-t-transparent" aria-hidden="true"></div>
          <p className="text-dust" role="status" aria-live="polite">Loading…</p>
        </div>
      </div>
    );
  }

  // Browse mode (no login required) - can view content
  // Login required only for: watch parties, room discovery
  return (
    <ErrorBoundary>
      <RoomProvider>
        <Routes />
      </RoomProvider>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </I18nProvider>
  );
}
