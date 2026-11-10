import { useI18n } from '../i18n';
import { Sigil } from './Icons';

export function ErrorState({ title, hint, onRetry }: { title: string; hint: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-6 text-center animate-fade">
      <Sigil className="size-10 text-blood" />
      <h2 className="font-display text-2xl font-bold tracking-wide">{title}</h2>
      <p className="max-w-md text-dust">{hint}</p>
      {onRetry && <button onClick={onRetry} className="mt-3 rounded-md bg-blood px-6 py-2.5 font-semibold transition hover:bg-blood-hot">{t('retry')}</button>}
    </div>
  );
}
