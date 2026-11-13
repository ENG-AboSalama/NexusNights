import { useEffect, useState, useMemo, useRef } from 'react';
import { useRoom } from '../room/RoomContext';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../api';
import type { 
  GlobalTitleCard, 
  GlobalTitleDetail, 
  GlobalSeason, 
  PlaybackConfigPublic, 
  EpisodeDetail 
} from '../api-types';
import { 
  Discord, Play, Users, ChatBubble, Globe, Star, Spinner, 
  Check, Copy, Crown, Zap, Search, Film, Tv, Send, X, MessageCircle, Sigil
} from '../components/Icons';
import { Avatar } from '../components/Avatar';
import { Player, type PlayerHandle } from '../player/Player';
import { EMOJIS } from '../room/RoomContext';
import { useDiscord } from '../discord/useDiscord';

export function DiscordActivity() {
  const { lang, t, toggle } = useI18n();
  const room = useRoom();
  const auth = useAuth();
  const discord = useDiscord();

  const [activeTab, setActiveTab] = useState<'watch' | 'browse' | 'members'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalTitleCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  
  // Media & catalog state
  const [catalog, setCatalog] = useState<{ hero: GlobalTitleCard | null; titles: GlobalTitleCard[] }>({
    hero: null,
    titles: [],
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<'all' | 'movie' | 'series'>('all');

  // TV Series Episode Selector Modal state
  const [selectedShow, setSelectedShow] = useState<GlobalTitleCard | null>(null);
  const [showDetail, setShowDetail] = useState<GlobalTitleDetail | null>(null);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);
  const [seasonData, setSeasonData] = useState<GlobalSeason | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Playback state for active room media
  const activeMediaId = room.state?.mediaId ?? null;
  const [mediaDetail, setMediaDetail] = useState<EpisodeDetail | null>(null);
  const [streamingConfig, setStreamingConfig] = useState<PlaybackConfigPublic | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const playerHandle = useRef<PlayerHandle>(null);

  // Chat message state
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ── Auto switch to watch tab when media is selected in room ───────────────
  useEffect(() => {
    if (activeMediaId) {
      setActiveTab('watch');
    }
  }, [activeMediaId]);

  // ── Update Discord Activity status when watching media ─────────────────────
  useEffect(() => {
    if (discord.isReady && mediaDetail) {
      const title = mediaDetail.titleName || mediaDetail.title;
      const details = mediaDetail.kind === 'series' 
        ? `${title} - S${mediaDetail.season}E${mediaDetail.episode}`
        : title;
      const state = room.room?.members.length 
        ? `${t('with')} ${room.room.members.length} ${room.room.members.length === 1 ? t('friend') : t('friends')}`
        : t('watchingAlone');
      
      void discord.updateActivity(details, state);
    }
  }, [discord.isReady, mediaDetail, room.room?.members.length]);

  // ── Load Catalog from Discovery ───────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    setCatalogLoading(true);

    api.discoveryHome(lang)
      .then((data) => {
        if (cancel) return;
        const allTitles: GlobalTitleCard[] = [];
        data.sections.forEach((sec) => {
          sec.items.forEach((item) => {
            if (!allTitles.find((t) => t.id === item.id)) {
              allTitles.push(item);
            }
          });
        });
        setCatalog({
          hero: data.hero,
          titles: allTitles,
        });
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load catalog:', err))
      .finally(() => {
        if (!cancel) setCatalogLoading(false);
      });

    return () => { cancel = true; };
  }, [lang]);

  // ── Search handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      api.search(q, lang, 1)
        .then((res) => {
          setSearchResults([...res.local, ...res.global]);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, lang]);

  // ── Load TV Show Seasons & Episodes when modal opens ──────────────────────
  useEffect(() => {
    if (!selectedShow || selectedShow.kind !== 'series') return;
    let cancel = false;
    setModalLoading(true);

    api.discoveryTV(selectedShow.tmdbId, lang)
      .then((detail) => {
        if (cancel) return;
        setShowDetail(detail);
        const firstSeason = detail.seasons?.find((s) => s.seasonNumber > 0)?.seasonNumber || 1;
        setSelectedSeasonNum(firstSeason);
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load TV detail:', err))
      .finally(() => {
        if (!cancel) setModalLoading(false);
      });

    return () => { cancel = true; };
  }, [selectedShow, lang]);

  // ── Load episodes for selected season ─────────────────────────────────────
  useEffect(() => {
    if (!selectedShow || selectedShow.kind !== 'series' || !selectedSeasonNum) return;
    let cancel = false;

    api.discoverySeason(selectedShow.tmdbId, selectedSeasonNum, lang)
      .then((sData) => {
        if (cancel) return;
        setSeasonData(sData);
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load season episodes:', err));

    return () => { cancel = true; };
  }, [selectedShow, selectedSeasonNum, lang]);

  // ── Fetch active media details when room.state.mediaId changes ────────────
  useEffect(() => {
    if (!activeMediaId) {
      setMediaDetail(null);
      setStreamingConfig(null);
      return;
    }

    let cancel = false;
    setPlaybackLoading(true);

    const movieMatch = activeMediaId.match(/^streaming-movie-(\d+)$/);
    const tvMatch = activeMediaId.match(/^streaming-tv-(\d+)-(\d+)-(\d+)$/);

    const loadPlayback = async () => {
      try {
        let titleName = '';
        let tmdbId = 0;
        let kind: 'movie' | 'series' = 'movie';
        let season: number | undefined;
        let episode: number | undefined;

        if (movieMatch) {
          tmdbId = parseInt(movieMatch[1], 10);
          kind = 'movie';
          const pb = await api.playbackMovie(tmdbId, lang);
          if (cancel) return;
          setStreamingConfig(pb.playback);
          titleName = pb.title || `Movie #${tmdbId}`;
        } else if (tvMatch) {
          tmdbId = parseInt(tvMatch[1], 10);
          season = parseInt(tvMatch[2], 10);
          episode = parseInt(tvMatch[3], 10);
          kind = 'series';
          const pb = await api.playbackTV(tmdbId, season, episode, lang);
          if (cancel) return;
          setStreamingConfig(pb.playback);
          titleName = `${pb.title} - S${season}E${episode}`;
        } else {
          // Local media ID
          const med = await api.media(activeMediaId, lang);
          if (cancel) return;
          setMediaDetail(med);
          setPlaybackLoading(false);
          return;
        }

        const mockDetail: EpisodeDetail = {
          id: activeMediaId,
          titleId: `${kind}-${tmdbId}`,
          titleName,
          title: titleName,
          tmdbId,
          kind,
          season: season ?? null,
          episode: episode ?? null,
          episodeEnd: null,
          runtimeSec: 5400,
          overview: '',
          airDate: null,
          stillUrl: null,
          thumbUrl: null,
          playable: true,
          width: 1920,
          height: 1080,
          playback: null,
          audioTracks: [{ index: 0, lang: 'en', label: 'English', channels: 2, default: true }],
          subtitles: [],
          sprite: null,
          nextId: null,
          prevId: null,
        };

        if (!cancel) {
          setMediaDetail(mockDetail);
          setPlaybackLoading(false);
        }
      } catch (err) {
        console.error('[DiscordActivity] Error fetching playback:', err);
        if (!cancel) setPlaybackLoading(false);
      }
    };

    void loadPlayback();
    return () => { cancel = true; };
  }, [activeMediaId, lang]);

  // ── Auto scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chat]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectMedia = async (item: GlobalTitleCard) => {
    if (item.kind === 'series') {
      setSelectedShow(item);
      return;
    }

    const syntheticId = `streaming-movie-${item.tmdbId}`;
    await playMediaInVoice(syntheticId);
  };

  const playMediaInVoice = async (mediaId: string) => {
    if (room.active) {
      await room.send({ type: 'select', mediaId, position: 0 });
    } else {
      window.location.hash = `#/discord?room=dc-voice`;
      setTimeout(() => {
        void room.send({ type: 'select', mediaId, position: 0 });
      }, 300);
    }
    setActiveTab('watch');
    setSelectedShow(null);
  };

  const handleCopyLink = () => {
    const url = window.location.origin + '/#/discord' + (room.roomId ? `?room=${encodeURIComponent(room.roomId)}` : '');
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const txt = chatInput.trim();
    if (!txt) return;
    void room.sendChat(txt);
    setChatInput('');
  };

  const filteredTitles = useMemo(() => {
    const list = searchQuery.trim() ? searchResults : catalog.titles;
    if (filterKind === 'all') return list;
    return list.filter((t) => t.kind === filterKind);
  }, [searchQuery, searchResults, catalog.titles, filterKind]);

  // Show Discord loading screen while SDK initializes
  if (discord.isLoading) {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="flex h-[100dvh] w-full flex-col items-center justify-center bg-ink text-bone font-sans antialiased"
      >
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="group flex items-center gap-2 mb-2" aria-label="NexusNight">
            <Sigil className="size-10 text-blood-hot animate-pulse" />
            <span lang="en" dir="ltr" className="font-[Cinzel] text-[2rem] font-extrabold tracking-[0.02em] text-bone">
              <span className="text-blood-hot">NEXUS</span>
              <span className="text-gilt">NIGHT</span>
            </span>
          </div>
          <Spinner className="size-8 text-gilt animate-spin" />
          <p className="text-sm font-medium text-dust animate-pulse">
            {lang === 'ar' ? 'جاري الاتصال بـ Discord...' : 'Connecting to Discord...'}
          </p>
        </div>
      </div>
    );
  }

  // Show error if Discord SDK failed to initialize
  if (discord.error) {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="flex h-[100dvh] w-full flex-col items-center justify-center bg-ink text-bone font-sans antialiased"
      >
        <div className="flex flex-col items-center gap-4 p-8 text-center max-w-md">
          <div className="size-16 rounded-2xl bg-blood/20 border border-blood/40 flex items-center justify-center">
            <Discord className="size-8 text-blood" />
          </div>
          <h2 className="font-display text-lg font-bold text-bone">
            {lang === 'ar' ? 'فشل الاتصال بـ Discord' : 'Discord Connection Failed'}
          </h2>
          <p className="text-sm text-dust leading-relaxed">
            {lang === 'ar' 
              ? 'تأكد من أنك تشغل التطبيق من داخل Discord Activity. يمكنك أيضاً استخدام الموقع الرئيسي للمشاهدة المتزامنة.'
              : 'Make sure you\'re running this from within a Discord Activity. You can also use the main site for watch parties.'}
          </p>
          <button
            onClick={() => window.location.hash = '#/'}
            className="mt-2 flex items-center gap-2 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-5 py-2.5 font-display text-sm font-bold text-white shadow-[0_0_20px_rgba(186,24,27,0.4)] transition-all hover:scale-105 active:scale-95"
          >
            {lang === 'ar' ? 'العودة إلى الصفحة الرئيسية' : 'Go to Main Site'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-ink text-bone font-sans antialiased selection:bg-blood-hot selection:text-white"
    >
      {/* ── Top Bar: Pure NexusNight Brand Standard ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-ink/90 px-3 sm:px-5 backdrop-blur-xl select-none z-30">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="group flex items-center gap-2" aria-label="NexusNight">
            <Sigil className="size-6 sm:size-7 text-blood-hot transition-transform duration-500 group-hover:rotate-180 shrink-0" />
            <span lang="en" dir="ltr" className="font-[Cinzel] text-[1.25rem] sm:text-[1.4rem] font-extrabold tracking-[0.02em] text-bone">
              <span className="text-blood-hot">NEXUS</span>
              <span className="text-gilt">NIGHT</span>
            </span>
          </div>

          <span className="hidden sm:inline-block rounded-full border border-gilt/30 bg-gilt/10 px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-gilt uppercase">
            Discord Activity
          </span>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-dust">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">{room.roomId ? `Voice: ${room.roomId}` : t('voiceConnected')}</span>
          </div>
        </div>

        {/* Navigation Tabs (Compact, NexusNight Themed) */}
        <nav className="flex items-center gap-1 rounded-xl bg-crypt/90 p-1 border border-white/10 shadow-inner">
          <button
            onClick={() => setActiveTab('watch')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              activeTab === 'watch'
                ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={t('discordNowPlaying')}
          >
            <Play className="size-3.5 fill-current shrink-0" />
            <span className="hidden sm:inline">{t('discordNowPlaying')}</span>
            {activeMediaId && <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>

          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              activeTab === 'browse'
                ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={t('discordBrowseMedia')}
          >
            <Film className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('discordBrowseMedia')}</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              activeTab === 'members'
                ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={t('discordRoomMembers')}
          >
            <Users className="size-3.5 shrink-0" />
            <span className="text-[11px] font-bold">{room.room?.members.length || 1}</span>
          </button>
        </nav>

        {/* Right Tools: Chat Toggle, Share Link, Language, Avatar */}
        <div className="flex items-center gap-2">
          {activeTab === 'watch' && (
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex size-8 items-center justify-center rounded-xl border transition-colors md:hidden ${
                chatOpen 
                  ? 'border-gilt/40 bg-gilt/15 text-gilt' 
                  : 'border-white/10 bg-white/5 text-dust hover:text-bone'
              }`}
              title={t('chat')}
            >
              <ChatBubble className="size-4" />
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-bone transition-colors hover:border-gilt/40 hover:bg-gilt/10"
            title={t('inviteVoiceFriends')}
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5 text-gilt" />}
            <span className="hidden sm:inline">{copied ? (lang === 'ar' ? 'تم النسخ!' : 'Copied!') : t('inviteVoiceFriends')}</span>
          </button>

          <button
            onClick={toggle}
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-dust transition-colors hover:border-gilt/40 hover:text-bone"
            title={t('language')}
          >
            <Globe className="size-3.5 text-gilt" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {auth.user ? (
            <Avatar user={auth.user} size={28} />
          ) : (
            <div className="size-7 rounded-full bg-gilt/20 border border-gilt/40 flex items-center justify-center text-[11px] font-bold text-gilt">
              NN
            </div>
          )}
        </div>
      </header>

      {/* ── Main View Content ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── TAB 1: WATCH PARTY PLAYER ── */}
        {activeTab === 'watch' && (
          <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
            {/* Main Player Area */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-black">
              {playbackLoading ? (
                <div className="flex flex-1 min-h-[300px] flex-col items-center justify-center gap-3 p-6">
                  <Spinner className="size-10 text-gilt animate-spin" />
                  <p className="text-xs sm:text-sm font-medium text-dust animate-pulse">
                    {t('nativeStreamLoading')}
                  </p>
                </div>
              ) : mediaDetail && streamingConfig ? (
                <div className="relative flex-1 min-h-[220px] sm:min-h-[360px] bg-black flex flex-col justify-center">
                  <Player
                    ref={playerHandle}
                    media={mediaDetail}
                    streamingConfig={streamingConfig}
                    title={mediaDetail.titleName || mediaDetail.title}
                    autoPlay
                    theatreMode
                    hasNext={false}
                    onBack={() => setActiveTab('browse')}
                    onNext={() => {}}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <div className="size-16 rounded-2xl bg-crypt/80 flex items-center justify-center text-gilt mb-3 shadow-inner border border-gilt/20">
                    <Film className="size-8" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-bone mb-1">{t('noVoiceRoomSelected')}</h2>
                  <p className="text-xs text-dust max-w-sm mb-5 leading-relaxed">{t('discordActivityHint')}</p>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-5 py-2.5 font-display text-xs font-bold text-white shadow-[0_0_20px_rgba(186,24,27,0.4)] transition-all hover:scale-105 active:scale-95"
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>{t('discordBrowseMedia')}</span>
                  </button>
                </div>
              )}

              {/* Media Title & Reaction Bar */}
              {mediaDetail && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-crypt/90 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-xs sm:text-sm font-bold text-bone">{mediaDetail.titleName || mediaDetail.title}</h3>
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium mt-0.5">
                      <Zap className="size-3 text-gilt fill-gilt" />
                      <span>{t('nativeStreamActive')} (1080p Ad-Free)</span>
                    </p>
                  </div>

                  {/* Reaction Quick Bar */}
                  <div className="flex items-center gap-1 bg-ink/80 p-1 rounded-xl border border-white/10 shadow-inner">
                    {EMOJIS.slice(0, 6).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => room.react(emoji)}
                        className="size-7 sm:size-8 rounded-lg text-sm sm:text-base transition-transform hover:scale-125 hover:bg-white/10 active:scale-90 flex items-center justify-center"
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Chat Panel (Collapsible Drawer on Mobile, Sidebar on Desktop) */}
            <aside
              className={`
                border-white/10 bg-crypt/95 flex flex-col transition-all duration-300
                md:w-72 lg:w-80 md:border-s md:relative md:flex
                ${chatOpen ? 'h-64 md:h-full border-t md:border-t-0' : 'hidden md:flex'}
              `}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3.5 font-semibold text-xs text-bone">
                <div className="flex items-center gap-1.5">
                  <ChatBubble className="size-3.5 text-gilt" />
                  <span>{t('liveChat')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-dust">{room.chat.length} msgs</span>
                  <button 
                    onClick={() => setChatOpen(false)}
                    className="md:hidden size-6 flex items-center justify-center rounded text-dust hover:text-bone"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat Message Feed */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {room.chat.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center p-3 text-dust">
                    <MessageCircle className="size-6 text-dust/40 mb-1.5" />
                    <p className="text-[11px] font-semibold text-bone">{t('popcornReady')}</p>
                    <p className="text-[10px] text-dust/70 mt-0.5">{lang === 'ar' ? 'أرسل رسالة أو تفاعل مع أصدقائك في المشاهدة!' : 'Send a reaction or message to your friends watching with you!'}</p>
                  </div>
                ) : (
                  room.chat.map((msg) => {
                    const isMe = msg.userId === room.me?.id;
                    return (
                      <div key={msg.id} className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse text-right' : ''}`}>
                        <Avatar user={{ id: msg.userId, name: msg.name, avatar: msg.avatar }} size={24} />
                        <div className="min-w-0 max-w-[80%]">
                          <div className={`flex items-baseline gap-1.5 mb-0.5 ${isMe ? 'justify-end' : ''}`}>
                            <span className="text-[11px] font-bold text-gilt truncate">{msg.name}</span>
                            <span className="text-[9px] text-dust/60">
                              {new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={`rounded-xl px-2.5 py-1 text-xs break-words leading-relaxed ${
                            isMe ? 'bg-gilt text-ink font-medium shadow-sm' : 'bg-white/10 text-bone'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatScrollRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-2 border-t border-white/10 bg-ink/90">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={t('saySomethingInLobby')}
                    className="w-full rounded-xl border border-white/10 bg-ink py-2 ps-3 pe-8 text-xs text-bone placeholder:text-dust/60 focus:border-gilt/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute end-1.5 flex size-6 items-center justify-center rounded-lg text-gilt hover:bg-gilt/15 disabled:opacity-30 transition"
                  >
                    <Send className="size-3" />
                  </button>
                </div>
              </form>
            </aside>
          </div>
        )}

        {/* ── TAB 2: BROWSE MEDIA CATALOG ── */}
        {activeTab === 'browse' && (
          <div className="flex flex-1 flex-col overflow-y-auto p-3 sm:p-6 bg-ink">
            {/* Quick Search & Filter Controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-6 max-w-4xl mx-auto w-full">
              <div className="relative flex-1 w-full">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-dust" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchShowsOrMovies')}
                  className="w-full rounded-xl bg-crypt/90 py-2.5 ps-10 pe-4 text-xs font-medium text-bone placeholder:text-dust/60 border border-white/10 focus:border-gilt/50 focus:outline-none transition-colors shadow-sm"
                />
                {isSearching && (
                  <Spinner className="absolute end-3.5 top-1/2 -translate-y-1/2 size-4 text-gilt animate-spin" />
                )}
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-1 rounded-xl bg-crypt/90 p-1 border border-white/10 self-stretch sm:self-auto justify-center">
                {(['all', 'movie', 'series'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilterKind(k)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filterKind === k
                        ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                        : 'text-dust hover:bg-white/5 hover:text-bone'
                    }`}
                  >
                    {k === 'all' ? (lang === 'ar' ? 'الكل' : 'All') : k === 'movie' ? t('movie') : t('series')}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid */}
            {catalogLoading ? (
              <div className="flex flex-1 items-center justify-center p-12">
                <Spinner className="size-8 text-gilt animate-spin" />
              </div>
            ) : filteredTitles.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-dust">
                <Film className="size-9 mb-2 opacity-40 text-gilt" />
                <p className="text-xs sm:text-sm font-semibold text-bone">{t('notFound')}</p>
                <p className="text-[11px] text-dust/70">{t('notFoundHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 max-w-7xl mx-auto w-full pb-8">
                {filteredTitles.map((title) => (
                  <div
                    key={title.id}
                    className="group relative flex flex-col rounded-2xl bg-crypt/80 p-2 sm:p-2.5 border border-white/10 transition-all duration-200 hover:border-gilt/40 hover:bg-crypt hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                  >
                    {/* Poster */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-ash mb-2 border border-white/5">
                      {title.posterUrl ? (
                        <img
                          src={title.posterUrl}
                          alt={title.title}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-dust/40">
                          <Film className="size-8" />
                        </div>
                      )}

                      {/* Kind Badge */}
                      <span className="absolute top-1.5 start-1.5 rounded-md bg-ink/80 border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-bone uppercase backdrop-blur-md">
                        {title.kind === 'series' ? 'TV' : 'MOVIE'}
                      </span>

                      {/* Rating */}
                      {title.rating && (
                        <span className="absolute top-1.5 end-1.5 flex items-center gap-0.5 rounded-md bg-ink/80 border border-gilt/30 px-1.5 py-0.5 text-[9px] font-bold text-gilt backdrop-blur-md">
                          <Star className="size-2.5 fill-current" />
                          <span>{title.rating.toFixed(1)}</span>
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <h4 className="truncate font-display text-xs font-bold text-bone mb-0.5" title={title.title}>
                      {title.title}
                    </h4>
                    <p className="text-[10px] text-dust mb-2">{title.releaseDate ? title.releaseDate.slice(0, 4) : '2026'}</p>

                    {/* Stream in Voice Button */}
                    <button
                      onClick={() => handleSelectMedia(title)}
                      className="mt-auto flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blood to-blood-hot py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(186,24,27,0.35)] transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Play className="size-3 fill-current" />
                      <span>{title.kind === 'series' ? (lang === 'ar' ? 'اختر حلقة' : 'Pick Episode') : t('streamInVoice')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: VOICE ROOM MEMBERS ── */}
        {activeTab === 'members' && (
          <div className="flex flex-1 flex-col p-4 sm:p-6 max-w-xl mx-auto w-full overflow-y-auto">
            <h2 className="font-display text-base sm:text-lg font-bold text-bone mb-1">{t('discordRoomMembers')}</h2>
            <p className="text-xs text-dust mb-4 leading-relaxed">
              {lang === 'ar' ? 'الأصدقاء المتواجدون حالياً في هذه الغرفة للمشاهدة المتزامنة معًا.' : 'Friends currently connected to this Voice Watch Party room.'}
            </p>

            <div className="rounded-2xl bg-crypt/90 border border-white/10 divide-y divide-white/10 overflow-hidden shadow-xl backdrop-blur-md">
              {room.room?.members && room.room.members.length > 0 ? (
                room.room.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar user={member} size={32} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-bone">{member.name}</span>
                          {member.isHost && (
                            <span className="flex items-center gap-0.5 rounded-full bg-gilt/15 border border-gilt/40 px-2 py-0.5 text-[9px] font-bold text-gilt">
                              <Crown className="size-2.5" />
                              <span>{t('host')}</span>
                            </span>
                          )}
                          {member.id === room.me?.id && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-dust">
                              {t('you')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-dust mt-0.5">
                          {member.canControl ? (lang === 'ar' ? 'يتحكم في المشغل' : 'Can control playback') : t('viewer')}
                        </p>
                      </div>
                    </div>

                    {/* Host action buttons */}
                    {room.isHost && member.id !== room.me?.id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => room.act(member.canControl ? 'control:revoke' : 'control:grant', member.id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-bone hover:border-gilt/40 hover:bg-gilt/15 hover:text-gilt transition"
                        >
                          {member.canControl ? t('revoke') : t('grant')}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-dust">
                  <Users className="size-8 mx-auto mb-2 opacity-50 text-gilt" />
                  <p className="text-xs">{t('popcornReady')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TV SERIES EPISODE PICKER MODAL (NexusNight Aesthetic) ── */}
        {selectedShow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/80 backdrop-blur-md animate-fade">
            <div className="relative flex flex-col w-full max-w-lg max-h-[85dvh] rounded-2xl bg-crypt/95 border border-gilt/30 shadow-2xl backdrop-blur-xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-crypt">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-sm sm:text-base text-bone truncate">
                    {selectedShow.title}
                  </h3>
                  <p className="text-[11px] text-dust">
                    {lang === 'ar' ? 'اختر الموسم والحلقة للبث في القناة الصوتية' : 'Select season & episode to stream in voice'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedShow(null)}
                  className="size-7 flex items-center justify-center rounded-lg bg-white/5 text-dust hover:text-bone hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Season Selector Tabs */}
              {showDetail?.seasons && showDetail.seasons.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-white/10 bg-ink/80 no-scrollbar">
                  {showDetail.seasons
                    .filter((s) => s.seasonNumber > 0)
                    .map((s) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                        className={`rounded-xl px-3 py-1 text-xs font-bold whitespace-nowrap transition-all ${
                          selectedSeasonNum === s.seasonNumber
                            ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                            : 'bg-white/5 text-dust hover:bg-white/10 hover:text-bone'
                        }`}
                      >
                        {t('season', { n: s.seasonNumber })}
                      </button>
                    ))}
                </div>
              )}

              {/* Episode List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
                {modalLoading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="size-7 text-gilt animate-spin" />
                  </div>
                ) : seasonData?.episodes && seasonData.episodes.length > 0 ? (
                  seasonData.episodes.map((ep) => (
                    <div
                      key={ep.episodeNumber}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-ink/80 border border-white/10 hover:border-gilt/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gilt">E{ep.episodeNumber}</span>
                          <h4 className="text-xs font-bold text-bone truncate">{ep.name || `Episode ${ep.episodeNumber}`}</h4>
                        </div>
                        {ep.overview && (
                          <p className="text-[10px] text-dust line-clamp-1 mt-0.5">{ep.overview}</p>
                        )}
                      </div>

                      <button
                        onClick={() => playMediaInVoice(`streaming-tv-${selectedShow.tmdbId}-${selectedSeasonNum}-${ep.episodeNumber}`)}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_0_12px_rgba(186,24,27,0.3)] hover:scale-105 active:scale-95 shrink-0 transition"
                      >
                        <Play className="size-3 fill-current" />
                        <span>{t('play')}</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-dust">
                    <Tv className="size-7 mx-auto mb-2 opacity-50 text-gilt" />
                    <p className="text-xs">No episodes found for this season.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
