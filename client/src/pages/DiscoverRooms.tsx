import { useEffect, useState } from 'react';
import { roomApi, type RoomInfo } from '../api/rooms';
import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { Discord, Spinner, Users } from '../components/Icons';

/**
 * Discover active watch party rooms
 */
export function DiscoverRooms() {
  const { t, lang } = useI18n();
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
      <div className="flex min-h-screen items-center justify-center px-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="text-center max-w-md p-8 rounded-2xl bg-coal/80 border border-white/10 shadow-2xl backdrop-blur-xl">
          <Users className="size-12 text-gilt mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-bone mb-2">{t('discoverRooms')}</h1>
          <p className="text-dust text-sm mb-6 leading-relaxed">{t('pleaseLoginToDiscoverRooms')}</p>
          <button
            onClick={auth.login}
            className="inline-flex items-center gap-2 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/20 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#5865F2]/30 hover:border-[#5865F2] active:scale-95 shadow-[0_4px_16px_rgba(88,101,242,0.3)]"
          >
            <Discord className="size-4" />
            <span>{t('login')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center max-w-md p-8 rounded-2xl bg-coal/80 border border-blood/30 shadow-2xl backdrop-blur-xl">
          <h1 className="font-display text-2xl font-bold text-blood-hot mb-2">{t('loadError')}</h1>
          <p className="text-dust text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-[var(--pad)] py-24" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-wide text-bone mb-2">{t('discoverRooms')}</h1>
            <p className="text-dust text-sm">{t('activeRooms')}: <span className="font-mono text-gilt">{rooms.length}</span></p>
          </div>

          {/* Join with Invite Code form */}
          <form onSubmit={handleJoinByCode} className="flex gap-2 max-w-sm w-full">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={t('enterInviteCode')}
              maxLength={8}
              className="flex-1 uppercase rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-sm text-bone placeholder-dust/50 focus:border-gilt/60 focus:bg-white/[0.07] focus:outline-none font-mono transition-colors"
            />
            <button
              type="submit"
              disabled={resolving || !inviteCode.trim()}
              className="rounded-lg bg-gilt px-5 py-2 text-sm font-semibold text-ink transition-all hover:bg-gilt/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-md"
            >
              {resolving && <Spinner className="size-3.5" />}
              <span>{t('join')}</span>
            </button>
          </form>
        </div>

        {inviteError && (
          <div className="mb-6 rounded-lg border border-blood/30 bg-blood/10 p-3.5 text-sm text-blood-hot">
            {inviteError}
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-coal/60 backdrop-blur-md p-12 text-center">
            <Users className="size-14 text-dust/40 mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-bone mb-2">{t('noActiveRooms')}</h2>
            <p className="text-dust text-sm max-w-md mx-auto">{t('createWatchPartyHint')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <a
                key={room.id}
                href={`/#/watch/${room.mediaId}?room=${room.id}`}
                className="group rounded-xl border border-white/10 bg-coal/70 p-5 transition-all duration-300 hover:border-gilt/40 hover:bg-coal hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(212,175,106,0.1)] flex flex-col justify-between"
              >
                <div>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-bone group-hover:text-gilt transition-colors line-clamp-2">
                      {room.title}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-dust">
                    <Users className="size-4 text-gilt/70" />
                    <span>{t('host')}: {room.hostName}</span>
                  </div>

                  {room.createdAt && (
                    <div className="mt-2 text-xs text-dust/60 font-mono">
                      {new Date(room.createdAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-gilt/30 bg-gilt/10 px-3 py-2 text-center text-sm font-semibold text-gilt group-hover:bg-gilt group-hover:text-ink transition-all">
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