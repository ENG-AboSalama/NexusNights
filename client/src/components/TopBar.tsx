import { useI18n } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { useScrolled } from '../hooks';
import { hrefs, useRoute } from '../router';
import { useState, useEffect } from 'react';
import { PeoplePanel } from '../room/PeoplePanel';
import { useRoom } from '../room/RoomContext';
import { AvatarStack } from './Avatar';
import { Close, Discord, Globe, Menu, Search, Sigil, Spinner, Users } from './Icons';
import { SearchBar } from './SearchBar';

export function TopBar() {
  const { t, toggle, lang } = useI18n();
  const auth = useAuth();
  const scrolled = useScrolled();
  const room = useRoom();
  const route = useRoute();

  const [people, setPeople] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const isAdmin = auth.isAdmin;
  const isDiscordActivity = window.location.hash.includes('#/discord');

  // Close mobile panels on route changes
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [route]);

  // Close mobile panels on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setMobileSearchOpen(false);
        setPeople(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isHome = route.name === 'home';
  const isRooms = route.name === 'discover-rooms';
  const isAdminActive = route.name === 'admin-dashboard';
  const isProvidersActive = route.name === 'providers';

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 flex h-14 sm:h-16 items-center gap-3 sm:gap-4 px-[var(--pad)] transition-all duration-300 ${
          scrolled
            ? 'bg-ink/92 backdrop-blur-xl border-b border-gilt/15 shadow-[0_4px_24px_rgba(0,0,0,0.65)]'
            : 'bg-gradient-to-b from-ink/95 via-ink/60 to-transparent border-b border-white/[0.04]'
        }`}
      >
        {/* Logo */}
        <a href={hrefs.home} className="group flex items-center gap-2 shrink-0" aria-label="NexusNight Home">
          <Sigil className="size-6 sm:size-7 text-blood-hot transition-transform duration-700 group-hover:rotate-180" />
          <span lang="en" dir="ltr" className="font-display text-[1.35rem] sm:text-[1.5rem] font-extrabold tracking-[0.02em] text-bone select-none">
            <span className="text-blood-hot">NEXUS</span>
            <span className="text-gilt">NIGHT</span>
          </span>
        </a>

        {/* Desktop Navigation */}
        <nav className="ms-2 hidden items-center gap-4 text-sm sm:flex shrink-0">
          <a
            href={hrefs.home}
            className={`relative py-1 transition-colors ${
              isHome ? 'text-bone font-medium' : 'text-dust/80 hover:text-bone focus-visible:text-gilt'
            }`}
          >
            {t('home')}
            {isHome && (
              <span className="absolute -bottom-1.5 inset-x-0 h-0.5 bg-gilt rounded-full shadow-[0_0_8px_rgba(212,175,106,0.8)]" />
            )}
          </a>

          {!isDiscordActivity && (
            <a
              href={hrefs.discoverRooms}
              className={`relative py-1 transition-colors ${
                isRooms ? 'text-bone font-medium' : 'text-dust/80 hover:text-bone focus-visible:text-gilt'
              }`}
            >
              {t('discoverRooms')}
              {isRooms && (
                <span className="absolute -bottom-1.5 inset-x-0 h-0.5 bg-gilt rounded-full shadow-[0_0_8px_rgba(212,175,106,0.8)]" />
              )}
            </a>
          )}

          {!isDiscordActivity && (
            <a
              href="https://discord.com/oauth2/authorize?client_id=1365445429700853853&scope=applications.commands+applications.entitlements"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-[#5865F2]/25 bg-[#5865F2]/10 px-2.5 py-1 text-xs font-medium text-[#7983f5] transition-all hover:border-[#5865F2]/60 hover:bg-[#5865F2]/20 hover:text-white"
              title={lang === 'ar' ? 'جرّب على Discord' : 'Try on Discord'}
            >
              <Discord className="size-3.5" />
              <span>Discord</span>
            </a>
          )}

          {isAdmin && (
            <a
              href={hrefs.adminDashboard}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                isAdminActive
                  ? 'border-blood bg-blood/25 text-white shadow-[0_0_12px_rgba(220,48,68,0.4)]'
                  : 'border-blood/30 bg-blood/10 text-blood-hot hover:border-blood/60 hover:bg-blood/20'
              }`}
              title={lang === 'ar' ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}
            >
              <span className="size-1.5 rounded-full bg-blood-hot" aria-hidden="true" />
              <span>{lang === 'ar' ? 'لوحة التحكم' : 'Admin'}</span>
            </a>
          )}

          {isAdmin && (
            <a
              href={hrefs.providers}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                isProvidersActive
                  ? 'border-gilt bg-gilt/25 text-bone shadow-[0_0_12px_rgba(212,175,106,0.3)]'
                  : 'border-gilt/25 bg-gilt/10 text-gilt hover:border-gilt/60 hover:bg-gilt/20 hover:text-bone'
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>{t('providersNav')}</span>
            </a>
          )}
        </nav>

        {/* Desktop Global Search */}
        <div className="hidden md:block mx-3 flex-1 max-w-md">
          <SearchBar />
        </div>

        {/* Action Controls Right Side */}
        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          {/* Mobile Search Toggle Button */}
          <button
            onClick={() => setMobileSearchOpen((v) => !v)}
            className={`p-2 rounded-full border transition-all md:hidden ${
              mobileSearchOpen
                ? 'border-gilt/50 bg-gilt/15 text-gilt'
                : 'border-white/10 bg-white/[0.04] text-dust hover:text-bone hover:border-white/20'
            }`}
            aria-label={t('search')}
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? <Close className="size-4" /> : <Search className="size-4" />}
          </button>

          {/* Room status & people */}
          {room.active && room.connection === 'connecting' && (
            <span title={t('connecting')} className="flex items-center gap-1.5 text-xs text-dust" role="status" aria-live="polite">
              <Spinner className="size-4 text-gilt" aria-hidden="true" />
              <span className="sr-only">{t('connecting')}</span>
            </span>
          )}

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
              {people && (
                <PeoplePanel onClose={() => setPeople(false)} className="absolute end-0 top-[calc(100%+0.6rem)] z-50 w-[min(22rem,90vw)]" />
              )}
            </div>
          )}

          {/* User auth state (desktop) */}
          {!room.active && auth.user && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-1.5" title={auth.user.name}>
                <AvatarStack users={[auth.user]} />
                <span className="hidden lg:inline text-xs font-medium text-bone max-w-[90px] truncate">{auth.user.name}</span>
              </div>
              <button
                onClick={auth.logout}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 text-dust transition-colors hover:bg-blood/20 hover:text-blood-hot hover:border-blood/30 focus-visible:border-gilt"
                aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
                title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
              >
                <Close className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {!room.active && !auth.user && (
            <button
              onClick={auth.login}
              className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/15 px-3 py-1.5 text-xs font-semibold text-[#7983f5] transition-all hover:bg-[#5865F2]/25 hover:text-white focus-visible:border-[#5865F2]"
            >
              <Discord className="size-3.5" />
              <span>{t('login')}</span>
            </button>
          )}

          {auth.error && (
            <span className="hidden sm:inline rounded bg-blood/20 px-2 py-1 text-xs text-blood-hot" role="alert">
              {lang === 'ar' ? 'خطأ في المصادقة' : 'Auth Error'}
            </span>
          )}

          {/* Language Switcher (Desktop) */}
          <button
            onClick={toggle}
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-gilt/20 bg-gilt/[0.06] px-3 py-1.5 text-xs font-medium text-gilt/90 transition-all hover:border-gilt/50 hover:bg-gilt/15 hover:text-gilt focus-visible:border-gilt active:scale-95"
            aria-label={lang === 'ar' ? 'تغيير اللغة' : 'Change language'}
          >
            <Globe className="size-3.5" aria-hidden="true" />
            <span className="font-sans">{t('language')}</span>
          </button>

          {/* Mobile Hamburger Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className={`p-2 rounded-full border transition-all sm:hidden ${
              mobileMenuOpen
                ? 'border-gilt/50 bg-gilt/15 text-gilt'
                : 'border-white/10 bg-white/[0.04] text-dust hover:text-bone hover:border-white/20'
            }`}
            aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <Close className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>

        {/* Mobile Search Overlay Bar */}
        {mobileSearchOpen && (
          <div className="absolute inset-x-0 top-full bg-ink/98 backdrop-blur-2xl border-b border-gilt/20 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.85)] md:hidden">
            <SearchBar autoFocus onClose={() => setMobileSearchOpen(false)} />
          </div>
        )}
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 top-14 bg-black/75 backdrop-blur-sm z-30 sm:hidden animate-fade"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-x-0 top-14 bg-coal/98 border-b border-gilt/20 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.9)] z-40 sm:hidden flex flex-col gap-4 animate-fade"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 text-sm">
            <a
              href={hrefs.home}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                isHome ? 'bg-gilt/15 text-gilt font-medium' : 'text-bone hover:bg-white/[0.05]'
              }`}
            >
              <span>{t('home')}</span>
              {isHome && <span className="size-1.5 rounded-full bg-gilt" />}
            </a>

            {!isDiscordActivity && (
              <a
                href={hrefs.discoverRooms}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  isRooms ? 'bg-gilt/15 text-gilt font-medium' : 'text-bone hover:bg-white/[0.05]'
                }`}
              >
                <span>{t('discoverRooms')}</span>
                {isRooms && <span className="size-1.5 rounded-full bg-gilt" />}
              </a>
            )}

            {!isDiscordActivity && (
              <a
                href="https://discord.com/oauth2/authorize?client_id=1365445429700853853&scope=applications.commands+applications.entitlements"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[#7983f5] hover:bg-[#5865F2]/10 transition-colors"
              >
                <Discord className="size-4" />
                <span>Discord</span>
              </a>
            )}

            {isAdmin && (
              <a
                href={hrefs.adminDashboard}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  isAdminActive ? 'bg-blood/20 text-blood-hot font-medium' : 'text-blood-hot hover:bg-blood/10'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-blood-hot" />
                  <span>{lang === 'ar' ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}</span>
                </span>
                {isAdminActive && <span className="size-1.5 rounded-full bg-blood-hot" />}
              </a>
            )}

            {isAdmin && (
              <a
                href={hrefs.providers}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  isProvidersActive ? 'bg-gilt/20 text-gilt font-medium' : 'text-gilt hover:bg-gilt/10'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span>{t('providersNav')}</span>
                </span>
                {isProvidersActive && <span className="size-1.5 rounded-full bg-gilt" />}
              </a>
            )}
          </nav>

          <div className="h-px bg-white/[0.06]" />

          {/* User profile & Language switcher in mobile menu */}
          <div className="flex items-center justify-between gap-3">
            {!room.active && auth.user ? (
              <div className="flex items-center gap-2">
                <AvatarStack users={[auth.user]} size={28} />
                <span className="text-xs font-medium text-bone max-w-[120px] truncate">{auth.user.name}</span>
                <button
                  onClick={auth.logout}
                  className="ms-1 rounded-full border border-white/10 bg-white/5 p-1 text-dust hover:text-blood-hot hover:border-blood/40"
                  aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
                >
                  <Close className="size-3" />
                </button>
              </div>
            ) : !room.active && !auth.user ? (
              <button
                onClick={auth.login}
                className="flex items-center gap-1.5 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/15 px-3 py-1.5 text-xs font-semibold text-[#7983f5]"
              >
                <Discord className="size-3.5" />
                <span>{t('login')}</span>
              </button>
            ) : <div />}

            <button
              onClick={toggle}
              className="flex items-center gap-1.5 rounded-full border border-gilt/20 bg-gilt/[0.06] px-3 py-1.5 text-xs font-medium text-gilt"
            >
              <Globe className="size-3.5" />
              <span>{t('language')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
