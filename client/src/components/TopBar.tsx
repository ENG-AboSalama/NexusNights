import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { useScrolled } from '../hooks';
import { hrefs } from '../router';
import { useState, useEffect } from 'react';
import { PeoplePanel } from '../room/PeoplePanel';
import { useRoom } from '../room/RoomContext';
import { AvatarStack } from './Avatar';
import { Close, Discord, Globe, Sigil, Spinner, Users } from './Icons';
import { SearchBar } from './SearchBar';

export function TopBar() {
  const { t, toggle, lang } = useI18n();
  const auth = useAuth();
  const scrolled = useScrolled();
  const room = useRoom();
  const [people, setPeople] = useState(false);
  
  const isAdmin = auth.isAdmin;
  
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-4 px-[var(--pad)] transition-[background,backdrop-filter] duration-500 sm:h-16 ${
        scrolled ? 'bg-ink/90 backdrop-blur-xl shadow-[0_1px_0_0_rgba(201,168,106,0.25)]' : 'bg-gradient-to-b from-ink/95 via-ink/50 to-transparent'
      }`}
    >
      <a href={hrefs.home} className="group flex items-center gap-2" aria-label="Home">
        <Sigil className="size-7 text-blood-hot transition-transform duration-500 group-hover:rotate-180" />
        <span lang="en" dir="ltr" className="font-[Cinzel] text-[1.5rem] font-extrabold tracking-[0.02em] text-bone">
          <span className="text-blood-hot">NEXUS</span>
          <span className="text-gilt">NIGHT</span>
        </span>
      </a>
      <nav className="ms-2 hidden items-center gap-4 text-sm text-dust sm:flex">
        <a href={hrefs.home} className="transition-colors hover:text-bone focus-visible:text-gilt">{t('home')}</a>
        <a href={hrefs.discoverRooms} className="transition-colors hover:text-bone focus-visible:text-gilt">{t('discoverRooms')}</a>
        {isAdmin && (
          <a
            href={hrefs.adminDashboard}
            className="flex items-center gap-1.5 rounded-full border border-blood/30 bg-blood/10 px-3 py-1 text-xs font-medium text-blood-hot transition-colors hover:border-blood hover:bg-blood/20 focus-visible:border-blood focus-visible:bg-blood/20"
            title={lang === 'ar' ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}
          >
            <span className="size-1.5 rounded-full bg-blood-hot motion-safe:animate-pulse" aria-hidden="true" />
            {lang === 'ar' ? 'لوحة التحكم' : 'Admin'}
          </a>
        )}
        {isAdmin && (
          <a
            href={hrefs.providers}
            className="flex items-center gap-1.5 rounded-full border border-gilt/30 bg-gilt/10 px-3 py-1 text-xs font-medium text-gilt transition-colors hover:border-gilt hover:bg-gilt/20 hover:text-bone focus-visible:border-gilt focus-visible:bg-gilt/20"
          >
            <span className="size-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" aria-hidden="true" />
            {t('providersNav')}
          </a>
        )}
      </nav>

      {/* Mobile Providers link */}
      {isAdmin && (
        <a
          href={hrefs.providers}
          className="flex items-center gap-1 rounded-full border border-gilt/30 bg-gilt/10 px-2 py-0.5 text-xs font-medium text-gilt transition-colors hover:border-gilt hover:bg-gilt/20 sm:hidden"
          aria-label={t('providersNav')}
        >
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          {t('providersNav')}
        </a>
      )}

      {/* Global Search */}
      <div className="hidden md:block mx-4 flex-1 max-w-lg">
        <SearchBar />
      </div>

      <div className="ms-auto flex items-center gap-3">
        {room.active && room.connection === 'connecting' && <span title={t('connecting')} className="flex items-center gap-1.5 text-xs text-dust" role="status" aria-live="polite"><Spinner className="size-4 text-gilt" aria-hidden="true" /><span className="sr-only">{t('connecting')}</span></span>}
        {room.active && room.connection === 'connected' && room.room && (
          <div className="relative">
            <button 
              onClick={() => setPeople((v) => !v)} 
              aria-label={t('people')} 
              aria-expanded={people}
              className="flex items-center gap-2 rounded-full border border-white/10 py-1 pe-3 ps-1.5 transition-colors hover:border-gilt/60 focus-visible:border-gilt"
            >
              <AvatarStack users={room.room.members} size={26} />
              <Users className="size-4 text-dust" aria-hidden="true" />
              {room.isHost && room.room.pending.length > 0 && (
                <span className="size-2 rounded-full bg-blood-hot" aria-label={`${room.room.pending.length} pending`} />
              )}
            </button>
            {people && <PeoplePanel onClose={() => setPeople(false)} className="absolute end-0 top-[calc(100%+0.6rem)] z-50 w-[min(22rem,90vw)]" />}
          </div>
        )}
        {!room.active && auth.user && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" title={auth.user.name}>
              <AvatarStack users={[auth.user]} />
              <span className="hidden md:inline text-xs font-medium text-bone max-w-[90px] truncate">{auth.user.name}</span>
            </div>
            <button
              onClick={auth.logout}
              className="rounded-full border border-white/10 bg-white/5 p-1 text-dust transition-colors hover:bg-blood/20 hover:text-blood-hot hover:border-blood/30 focus-visible:border-gilt"
              aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            >
              <Close className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        {!room.active && !auth.user && (
          <button
            onClick={auth.login}
            className="flex items-center gap-1.5 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/15 px-3 py-1.5 text-xs font-semibold text-[#7983f5] transition-colors hover:bg-[#5865F2]/25 hover:text-white focus-visible:border-[#5865F2]"
          >
            <span>{t('login')}</span>
          </button>
        )}
        {auth.error && <span className="rounded bg-blood/20 px-2 py-1 text-xs text-blood-hot" role="alert">{lang === 'ar' ? 'خطأ في المصادقة' : 'Auth Error'}</span>}
        <button 
          onClick={toggle} 
          className="flex items-center gap-1.5 rounded-full border border-gilt/20 bg-gilt/5 px-3 py-1.5 text-sm text-gilt/90 transition-colors hover:border-gilt/50 hover:bg-gilt/15 hover:text-gilt focus-visible:border-gilt active:scale-95" 
          aria-label={lang === 'ar' ? 'تغيير اللغة' : 'Change language'}
        >
          <Globe className="size-4" aria-hidden="true" />
          <span className="font-sans font-medium">{t('language')}</span>
        </button>
      </div>
    </header>
  );
}
