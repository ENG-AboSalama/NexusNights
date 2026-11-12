import { useState } from 'react';
import { useI18n } from '../i18n';
import { Users } from './Icons';
import { CreateRoomModal } from './CreateRoomModal';

interface Props {
  mediaId: string;
  title: string;
  className?: string;
}

/**
 * Button to create/join a watch party room
 */
export function WatchPartyButton({ mediaId, title, className = '' }: Props) {
  const { t, lang } = useI18n();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`inline-flex h-11 items-center gap-2.5 rounded-md border border-gilt/30 bg-gilt/5 px-6 font-semibold text-gilt transition-colors hover:border-gilt/60 hover:bg-gilt/15 hover:text-bone active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${className}`}
        aria-label={lang === 'ar' ? 'إنشاء حفلة مشاهدة' : 'Create watch party'}
      >
        <Users className="size-5" aria-hidden="true" />
        <span>{t('createWatchParty')}</span>
      </button>

      {showModal && (
        <CreateRoomModal
          mediaId={mediaId}
          title={title}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}