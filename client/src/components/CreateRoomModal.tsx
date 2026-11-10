import { useState } from 'react';
import { roomApi } from '../api/rooms';
import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { Check, Spinner, Users, X } from './Icons';

interface Props {
  mediaId: string;
  title: string;
  onClose: () => void;
  onCreated?: (roomId: string, inviteCode: string) => void;
}

export function CreateRoomModal({ mediaId, title, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const auth = useAuth();
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);

  if (!auth.user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-md rounded-2xl border border-gilt/30 bg-crypt p-6 shadow-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-dust hover:text-bone transition"
            aria-label="Close"
          >
            <X className="size-6" />
          </button>

          <h2 className="text-2xl font-bold text-bone mb-4">{t('createWatchParty')}</h2>
          <p className="text-dust mb-6">{t('pleaseLoginToCreateRoom')}</p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-ash px-4 py-2.5 font-medium text-dust transition hover:bg-white/5 hover:text-bone"
            >
              {t('cancel')}
            </button>
            <button
              onClick={auth.login}
              className="flex-1 rounded-lg bg-gilt px-4 py-2.5 font-medium text-ink transition hover:bg-gilt/90"
            >
              {t('login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await roomApi.create({
        mediaId,
        title,
        isPublic,
      });

      setCreatedRoomId(result.room.id);
      setInviteCode(result.room.inviteCode);
      onCreated?.(result.room.id, result.room.inviteCode);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = createdRoomId
    ? `${window.location.origin}/#/watch/${mediaId}?room=${createdRoomId}`
    : '';

  const copyInvite = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const copyDiscordShare = () => {
    const discordMessage = `🎬 تعال نتفرج سوا على "${title}" في NexusNight!\nرابط الغرفة: ${shareUrl}\nكود الدعوة: ${inviteCode}`;
    navigator.clipboard.writeText(discordMessage);
    setCopiedDiscord(true);
    setTimeout(() => setCopiedDiscord(false), 3000);
  };

  const startWatching = () => {
    if (createdRoomId) {
      window.location.hash = `#/watch/${mediaId}?room=${createdRoomId}`;
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-gilt/30 bg-crypt p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-dust hover:text-bone transition"
          aria-label="Close"
        >
          <X className="size-6" />
        </button>

        <h2 className="text-2xl font-bold text-bone mb-2">
          {inviteCode ? t('roomCreated') : t('createWatchParty')}
        </h2>
        <p className="text-dust text-sm mb-6">{title}</p>

        {!inviteCode ? (
          <>
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="size-5 rounded border-gilt/30 bg-ink text-gilt focus:ring-gilt/50"
                />
                <div>
                  <div className="text-bone font-medium">{t('publicRoom')}</div>
                  <div className="text-dust text-sm">{t('publicRoomDesc')}</div>
                </div>
              </label>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-blood/30 bg-blood/10 p-3 text-sm text-blood-hot">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/10 bg-ash px-4 py-2.5 font-medium text-dust transition hover:bg-white/5 hover:text-bone"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 rounded-lg bg-gilt px-4 py-2.5 font-medium text-ink transition hover:bg-gilt/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Spinner className="size-4" />}
                {t('createRoom')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-gilt/30 bg-gilt/10 p-4">
              <div className="text-xs text-dust mb-1">{t('inviteCode')}</div>
              <div className="text-3xl font-mono font-bold text-gilt tracking-widest">
                {inviteCode}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs text-dust mb-2">{t('shareLink')}</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-bone font-mono select-all"
                />
                <button
                  onClick={copyInvite}
                  className="rounded-lg bg-gilt px-4 py-2 font-medium text-ink transition hover:bg-gilt/90 flex items-center gap-1.5"
                >
                  {copiedLink ? <Check className="size-4" /> : null}
                  <span>{copiedLink ? t('copied') : t('copy')}</span>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <button
                onClick={copyDiscordShare}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/15 px-4 py-2.5 font-medium text-[#7983f5] transition hover:bg-[#5865F2]/25 hover:text-white"
              >
                {copiedDiscord ? <Check className="size-4" /> : null}
                <span>{copiedDiscord ? t('copiedDiscord') : t('shareDiscord')}</span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-white/10 bg-ash px-4 py-2.5 font-medium text-dust transition hover:bg-white/5 hover:text-bone"
              >
                {t('done')}
              </button>
              <button
                onClick={startWatching}
                className="flex-1 rounded-lg bg-blood px-4 py-2.5 font-medium text-white transition hover:bg-blood-hot shadow-lg flex items-center justify-center gap-2"
              >
                <Users className="size-4" />
                <span>{t('startWatching')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}