import { useState } from 'react';
import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { roomApi } from '../api/rooms';
import { Spinner, Users } from './Icons';

interface Props {
  mediaId: string;
  title: string;
  className?: string;
}

/**
 * Button to create/join a watch party room directly without modal prompt
 */
export function WatchPartyButton({ mediaId, title, className = '' }: Props) {
  const { t, lang } = useI18n();
  const auth = useAuth();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!auth.user) {
      auth.login();
      return;
    }
    if (loading) return;

    try {
      setLoading(true);
      const result = await roomApi.create({
        mediaId,
        title,
        isPublic: true,
      });

      if (result?.room?.id) {
        window.location.hash = `#/watch/${mediaId}?room=${result.room.id}`;
      }
    } catch (err) {
      console.error('[WatchPartyButton] Failed to create room:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex h-11 items-center gap-2.5 rounded-md border border-gilt/30 bg-gilt/5 px-6 font-semibold text-gilt transition-all hover:border-gilt/60 hover:bg-gilt/15 hover:text-bone active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      aria-label={lang === 'ar' ? 'إنشاء حفلة مشاهدة' : 'Create watch party'}
    >
      {loading ? (
        <Spinner className="size-5 text-gilt animate-spin" aria-hidden="true" />
      ) : (
        <Users className="size-5" aria-hidden="true" />
      )}
      <span>{loading ? (lang === 'ar' ? 'جارٍ إنشاء الغرفة…' : 'Creating room…') : t('createWatchParty')}</span>
    </button>
  );
}