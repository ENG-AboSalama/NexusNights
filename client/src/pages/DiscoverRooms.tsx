import { useEffect, useState } from 'react';
import { roomApi, type RoomInfo } from '../api/rooms';
import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { Spinner, Users } from '../components/Icons';

/**
 * Discover active watch party rooms
 */
export function DiscoverRooms() {
  const { t } = useI18n();
  const auth = useAuth();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState('');
  const [resolving, setResolving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user) {
      setLoading(false);
      return;
    }

    const loadRooms = async () => {
      try {
        const result = await roomApi.discover();
        setRooms(result.rooms);
      } catch (err) {
        console.error('Failed to discover rooms:', err);
        setError(err instanceof Error ? err.message : 'Failed to load rooms');
      } finally {
        setLoading(false);
      }
    };

    loadRooms();
    
    // Refresh every 10 seconds
    const interval = setInterval(loadRooms, 10000);
    return () => clearInterval(interval);
  }, [auth.user]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setResolving(true);
    setInviteError(null);
    try {
      const { room: r } = await roomApi.resolveInvite(code);
      window.location.hash = `#/watch/${r.mediaId}?room=${r.id}`;
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('inviteNotFound'));
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8 text-gilt" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-bone mb-4">{t('discoverRooms')}</h1>
          <p className="text-dust mb-6">{t('pleaseLoginToDiscoverRooms')}</p>
          <button
            onClick={auth.login}
            className="rounded-lg bg-gilt px-6 py-3 font-medium text-ink transition hover:bg-gilt/90"
          >
            {t('login')}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blood-hot mb-4">{t('loadError')}</h1>
          <p className="text-dust">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-[var(--pad)] py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-bone mb-2">{t('discoverRooms')}</h1>
            <p className="text-dust">{t('activeRooms')}: {rooms.length}</p>
          </div>

          {/* Join with Invite Code form */}
          <form onSubmit={handleJoinByCode} className="flex gap-2 max-w-sm w-full">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={t('enterInviteCode')}
              maxLength={8}
              className="flex-1 uppercase rounded-lg border border-white/15 bg-coal px-3 py-2 text-sm text-bone placeholder-dust/50 focus:border-gilt/60 focus:outline-none font-mono"
            />
            <button
              type="submit"
              disabled={resolving || !inviteCode.trim()}
              className="rounded-lg bg-gilt px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gilt/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {resolving && <Spinner className="size-3.5" />}
              <span>{t('join')}</span>
            </button>
          </form>
        </div>

        {inviteError && (
          <div className="mb-6 rounded-lg border border-blood/30 bg-blood/10 p-3 text-sm text-blood-hot">
            {inviteError}
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-crypt p-12 text-center">
            <Users className="size-16 text-dust/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-dust mb-2">{t('noActiveRooms')}</h2>
            <p className="text-dust/70">{t('createWatchPartyHint')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <a
                key={room.id}
                href={`/#/watch/${room.mediaId}?room=${room.id}`}
                className="group rounded-xl border border-white/10 bg-crypt p-5 transition hover:border-gilt/50 hover:bg-crypt/80 flex flex-col justify-between"
              >
                <div>
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-bone group-hover:text-gilt transition line-clamp-2">
                      {room.title}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-dust">
                    <Users className="size-4" />
                    <span>{t('host')}: {room.hostName}</span>
                  </div>

                  {room.createdAt && (
                    <div className="mt-2 text-xs text-dust/70">
                      {new Date(room.createdAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-gilt/20 bg-gilt/10 px-3 py-2 text-center text-sm font-medium text-gilt group-hover:bg-gilt group-hover:text-ink transition">
                  {t('joinRoom')}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}