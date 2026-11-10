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
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-2 rounded-lg border border-gilt/30 bg-gilt/10 px-4 py-2.5 font-medium text-gilt transition hover:border-gilt hover:bg-gilt/20 hover:text-bone ${className}`}
      >
        <Users className="size-5" />
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