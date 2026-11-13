/**
 * Discord Activity Promotion Banner
 * Refined cinematic noir styling consistent with NexusNight design system.
 */

import { useI18n } from '../i18n';
import { Discord, ExternalLink } from './Icons';

export function DiscordActivityBanner() {
  const { lang } = useI18n();
  const DISCORD_ACTIVITY_URL = 'https://discord.com/oauth2/authorize?client_id=1365445429700853853&scope=applications.commands+applications.entitlements';
  
  return (
    <div className="mx-auto max-w-6xl px-[var(--pad)]">
      <section 
        className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-coal/60 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:border-[#5865F2]/30"
        aria-label={lang === 'ar' ? 'نشاط ديسكورد' : 'Discord Activity'}
      >
        {/* Very subtle ambient — not aggressive */}
        <div className="pointer-events-none absolute -end-32 -top-32 size-72 rounded-full bg-[#5865F2]/[0.06] blur-3xl opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            {/* Discord icon */}
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#5865F2]/20 bg-[#5865F2]/10 text-[#7983f5] transition-transform duration-300 group-hover:scale-105 sm:size-12">
              <Discord className="size-6 sm:size-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#7983f5]/80">DISCORD ACTIVITY</span>
                <span className="size-1 rounded-full bg-emerald-400" />
                <span className="text-[0.65rem] text-dust/70">{lang === 'ar' ? 'متاح الآن' : 'Now Available'}</span>
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight text-bone sm:text-xl">
                {lang === 'ar' ? 'شاهد مع أصدقائك داخل Discord' : 'Watch together inside Discord'}
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-dust/70">
                {lang === 'ar'
                  ? 'بث متزامن في الوقت الفعلي مع الصوت والدردشة مباشرة في القناة الصوتية بسيرفرك بدون الحاجة لمغادرة Discord.'
                  : 'Synchronized playback with voice and chat directly in your server voice channel — no Discord tab switching needed.'}
              </p>
            </div>
          </div>

          <a
            href={DISCORD_ACTIVITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/15 px-5 text-sm font-semibold text-[#7983f5] transition-all duration-200 hover:bg-[#5865F2]/25 hover:text-white hover:border-[#5865F2]/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt"
          >
            <span>{lang === 'ar' ? 'تشغيل على Discord' : 'Launch on Discord'}</span>
            <ExternalLink className="size-3.5 opacity-70" />
          </a>
        </div>
      </section>
    </div>
  );
}
