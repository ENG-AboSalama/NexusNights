/**
 * Admin Dashboard - Analytics & Statistics
 *
 * Access via ADMIN_TOKEN (set in .env as ADMIN_TOKEN=your_secret_here)
 * Navigate to: /#/admin
 */

import { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n';
import { Spinner, Users, Film, Clock, TrendingUp, Activity, Lock, Zap, BarChart } from '../components/Icons';
import { u } from '../api';
import { useAuth } from '../auth/AuthContext';

const STORAGE_KEY = 'nexusnight_admin_token';

interface DashboardStats {
  totalUsers: number;
  activeSessions: number;
  totalWatchTime: number;
  mostWatchedContent: Array<{
    id: string;
    title: string;
    kind: 'movie' | 'series';
    watchCount: number;
    totalWatchTime: number;
    posterUrl?: string;
  }>;
  trafficSources: Array<{ country: string; count: number; percentage: number }>;
  recentActivity: Array<{
    userId: string;
    userName: string;
    action: string;
    timestamp: number;
  }>;
  activeRooms: number;
  totalRooms: number;
  library?: { movies: number; episodes: number; total: number };
  streaming?: { activeBrowserSessions: number; maxBrowserSessions: number };
}

function useAdminToken() {
  const [token, setTokenState] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
  });
  const save = (t: string) => {
    try { if (t) localStorage.setItem(STORAGE_KEY, t); else localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setTokenState(t);
  };
  return [token, save] as const;
}

// ── Token Login Screen ────────────────────────────────────────────────────────
function TokenLoginScreen({ onVerified }: { onVerified: (token: string) => void }) {
  const { lang } = useI18n();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const verify = async () => {
    const t = input.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(u('/api/admin/verify'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${t}` },
      });
      if (res.ok) {
        onVerified(t);
      } else {
        setError(lang === 'ar' ? 'التوكن غلط أو غير صالح' : 'Invalid or incorrect admin token');
      }
    } catch {
      setError(lang === 'ar' ? 'فشل الاتصال بالخادم' : 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-2xl bg-gilt/10 border border-gilt/30">
            <Lock className="size-8 text-gilt" />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-bone">
            {lang === 'ar' ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}
          </h1>
          <p className="mt-2 text-sm text-dust">
            {lang === 'ar' ? 'أدخل الـ Admin Token للدخول' : 'Enter your admin token to access'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-crypt/80 p-6 shadow-2xl backdrop-blur-md">
          <label className="mb-2 block text-sm font-semibold text-bone">Admin Token</label>
          <input
            ref={ref}
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void verify(); }}
            placeholder={lang === 'ar' ? 'أدخل التوكن هنا...' : 'Enter token here...'}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-bone outline-none transition focus:border-gilt/60 placeholder:text-dust/50 font-mono"
            dir="ltr"
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <button
            onClick={() => void verify()}
            disabled={loading || !input.trim()}
            className="mt-4 w-full rounded-xl bg-gilt px-6 py-3 text-sm font-bold text-ink transition hover:bg-gilt/90 active:scale-95 disabled:opacity-50"
          >
            {loading ? <Spinner className="mx-auto size-4" /> : (lang === 'ar' ? 'دخول' : 'Login')}
          </button>
          <p className="mt-4 text-center text-xs text-dust/60">
            {lang === 'ar' ? 'Token موجود في ملف .env كـ ADMIN_TOKEN' : 'Token is set in .env as ADMIN_TOKEN'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const { lang } = useI18n();
  const { isAdmin, refreshAdmin } = useAuth();
  const [token, saveToken] = useAdminToken();
  const [verified, setVerified] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-verify saved token on mount
  useEffect(() => {
    if (!token) return;
    fetch(u('/api/admin/verify'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).then((r) => {
      if (r.ok) setVerified(true);
      else { saveToken(''); }
    }).catch(() => { saveToken(''); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerified = (t: string) => {
    saveToken(t);
    setVerified(true);
    void refreshAdmin(); // sync isAdmin in AuthContext so TopBar/routes update
  };

  const loadStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(u('/api/admin/stats'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401) { saveToken(''); setVerified(false); return; }
        throw new Error(lang === 'ar' ? 'فشل تحميل الإحصائيات' : 'Failed to load statistics');
      }
      setStats(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل التحميل' : 'Failed to load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!verified) return;
    void loadStats();
    const interval = setInterval(() => void loadStats(true), 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  if (!verified) return <TokenLoginScreen onVerified={handleVerified} />;
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner className="size-8 text-gilt" /></div>;
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-blood-hot mb-4">{lang === 'ar' ? 'خطأ' : 'Error'}</h1>
          <p className="text-dust mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => void loadStats()} className="rounded-lg bg-gilt px-6 py-3 font-medium text-ink transition hover:bg-gilt/90">
              {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </button>
            <button onClick={() => { saveToken(''); setVerified(false); }} className="rounded-lg border border-white/15 px-6 py-3 text-sm text-dust transition hover:bg-white/5">
              {lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!stats) return null;

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (lang === 'ar') return hours > 0 ? `${hours} س ${minutes} د` : `${minutes} د`;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const fmt = (n: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);
  const ar = lang === 'ar';

  const activeBrowsers = stats.streaming?.activeBrowserSessions ?? 0;
  const maxBrowsers = stats.streaming?.maxBrowserSessions ?? 3;
  const browserPct = maxBrowsers > 0 ? (activeBrowsers / maxBrowsers) * 100 : 0;

  return (
    <div className="min-h-screen px-[var(--pad)] py-24">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-bone mb-2">📊 {ar ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}</h1>
            <p className="text-dust">{ar ? 'إحصائيات شاملة للموقع والمستخدمين' : 'Comprehensive site & user analytics'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadStats(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-gilt/30 bg-gilt/10 px-4 py-2.5 font-medium text-gilt transition hover:border-gilt/60 hover:bg-gilt/20 disabled:opacity-50"
            >
              {refreshing ? <Spinner className="size-4" /> : <Activity className="size-4" />}
              <span>{ar ? 'تحديث' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => { saveToken(''); setVerified(false); }}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-dust transition hover:bg-white/5 hover:text-bone"
            >
              {ar ? 'خروج' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard icon={<Users className="size-5 text-gilt" />} color="gilt"
            label={ar ? 'مستخدمون' : 'Users'} value={fmt(stats.totalUsers)} />
          <StatCard icon={<Activity className="size-5 text-emerald-400" />} color="emerald"
            label={ar ? 'غرف نشطة' : 'Active Rooms'} value={`${fmt(stats.activeRooms)} / ${fmt(stats.totalRooms)}`} />
          <StatCard icon={<Clock className="size-5 text-blood-hot" />} color="blood"
            label={ar ? 'وقت المشاهدة' : 'Watch Time'} value={formatDuration(stats.totalWatchTime)} />
          <StatCard icon={<Film className="size-5 text-sky-400" />} color="sky"
            label={ar ? 'المكتبة' : 'Library'} value={fmt(stats.library?.total ?? 0)}
            sub={stats.library ? `${fmt(stats.library.movies)} ${ar ? 'أفلام' : 'movies'} · ${fmt(stats.library.episodes)} ${ar ? 'حلقات' : 'eps'}` : undefined}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">

          {/* Most Watched */}
          <div className="rounded-xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-5">
              <Film className="size-5 text-gilt" />
              <h2 className="text-lg font-semibold text-bone">{ar ? 'الأكثر مشاهدة' : 'Most Watched'}</h2>
            </div>
            {stats.mostWatchedContent.length === 0 ? (
              <p className="text-dust text-center py-8">{ar ? 'لا توجد بيانات بعد' : 'No data yet'}</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {stats.mostWatchedContent.slice(0, 10).map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 hover:bg-white/[0.06] transition">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gilt/20 text-sm font-bold text-gilt">{i + 1}</span>
                    {item.posterUrl && <img src={u(item.posterUrl)} alt="" className="size-12 shrink-0 rounded object-cover" loading="lazy" />}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-bone truncate">{item.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-dust mt-0.5">
                        <span>{fmt(item.watchCount)} {ar ? 'مشاهدة' : 'views'}</span>
                        <span className="text-dust/50">•</span>
                        <span>{formatDuration(item.totalWatchTime)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Streaming Engine Status */}
          <div className="rounded-xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-5">
              <Zap className="size-5 text-gilt" />
              <h2 className="text-lg font-semibold text-bone">{ar ? 'محرك البث التلقائي' : 'Streaming Engine'}</h2>
            </div>

            {/* Browser sessions gauge */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dust">{ar ? 'جلسات المتصفح النشطة' : 'Active Browser Sessions'}</span>
                <span className="text-sm font-bold text-bone">{activeBrowsers} / {maxBrowsers}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${browserPct >= 100 ? 'bg-blood-hot' : browserPct >= 66 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(4, browserPct)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-dust/60">
                {ar ? 'الحد الأقصى للتشغيل المتزامن' : 'Max concurrent stream extractions'}
              </p>
            </div>

            {/* Provider status badges */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-dust/60 mb-3">{ar ? 'المزودات' : 'Providers'}</p>
              {[
                { name: 'VidSrc', desc: ar ? 'الأساسي' : 'Primary', ok: true },
                { name: 'VixSrc', desc: ar ? 'احتياطي' : 'Fallback', ok: true },
              ].map((p) => (
                <div key={p.name} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`size-2 rounded-full ${p.ok ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-sm font-semibold text-bone">{p.name}</span>
                    <span className="text-xs text-dust">{p.desc}</span>
                  </div>
                  <span className={`text-xs font-medium ${p.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.ok ? (ar ? 'نشط' : 'Active') : (ar ? 'متوقف' : 'Down')}
                  </span>
                </div>
              ))}
            </div>

            {/* Provider health link */}
            <a
              href="/api/playback/provider-health"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-xs text-gilt/70 hover:text-gilt transition"
            >
              <BarChart className="size-3.5" />
              <span>{ar ? 'تفاصيل صحة المزودات ←' : 'Provider health details →'}</span>
            </a>
          </div>
        </div>

        {/* Recent Activity — full width */}
        <div className="rounded-xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="size-5 text-gilt" />
            <h2 className="text-lg font-semibold text-bone">{ar ? 'النشاط الأخير' : 'Recent Activity'}</h2>
          </div>
          {stats.recentActivity.length === 0 ? (
            <p className="text-dust text-center py-8">{ar ? 'لا يوجد نشاط مسجّل بعد. يبدأ السجل فور أن يشاهد أحد شيئاً.' : 'No activity recorded yet. Log starts as soon as someone watches content.'}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {stats.recentActivity.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.03] p-3 text-sm hover:bg-white/[0.05] transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="size-8 shrink-0 rounded-full bg-gilt/20 flex items-center justify-center text-gilt font-bold text-xs">
                      {a.userName.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-bone truncate">
                      <span className="font-medium">{a.userName}</span>{' '}
                      <span className="text-dust">{a.action}</span>
                    </p>
                  </div>
                  <span className="text-xs text-dust/60 shrink-0">
                    {new Date(a.timestamp).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  const bg: Record<string, string> = {
    gilt: 'bg-gilt/20',
    emerald: 'bg-emerald-600/20',
    blood: 'bg-blood/20',
    sky: 'bg-sky-600/20',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-lg p-2.5 ${bg[color] ?? 'bg-white/10'}`}>{icon}</div>
        <h3 className="text-sm font-medium text-dust">{label}</h3>
      </div>
      <p className="text-3xl font-bold text-bone">{value}</p>
      {sub && <p className="mt-1 text-xs text-dust">{sub}</p>}
    </div>
  );
}
