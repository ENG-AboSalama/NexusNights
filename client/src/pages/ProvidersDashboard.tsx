import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProviderStatusPublic, ProviderTestResultPublic } from '../api-types';
import { useI18n } from '../i18n';
import { Check, Info, Play, Spinner, X } from '../components/Icons';

export function ProvidersDashboard() {
  const { t, lang } = useI18n();
  const [providers, setProviders] = useState<ProviderStatusPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Live Test State
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testTmdbId, setTestTmdbId] = useState<string>('1368337');
  const [testKind, setTestKind] = useState<'movie' | 'series'>('movie');
  const [testSeason, setTestSeason] = useState<number>(1);
  const [testEpisode, setTestEpisode] = useState<number>(1);
  const [testResult, setTestResult] = useState<ProviderTestResultPublic | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getProviders();
      setProviders(res.providers);
    } catch (err: any) {
      setError(err?.message || 'Failed to load streaming providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProviders();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggle = async (provider: ProviderStatusPublic) => {
    if (!provider.isSupported) return;
    try {
      setTogglingId(provider.id);
      const newEnabled = !provider.isEnabled;
      
      // Optimistic update
      setProviders((prev) =>
        prev.map((p) => (p.id === provider.id ? { ...p, isEnabled: newEnabled } : p))
      );

      const res = await api.toggleProvider(provider.id, newEnabled);
      if (res.status) {
        setProviders((prev) =>
          prev.map((p) => (p.id === provider.id ? res.status : p))
        );
      }
      showToast(
        newEnabled
          ? (lang === 'ar' ? `تم تشغيل مزود ${provider.name} بنجاح` : `Provider ${provider.name} enabled`)
          : (lang === 'ar' ? `تم إيقاف مزود ${provider.name}` : `Provider ${provider.name} disabled`)
      );
    } catch (err: any) {
      // Revert on error
      setProviders((prev) =>
        prev.map((p) => (p.id === provider.id ? { ...p, isEnabled: provider.isEnabled } : p))
      );
      showToast(err?.message || 'Failed to toggle provider');
    } finally {
      setTogglingId(null);
    }
  };

  const handleResetCooldowns = async () => {
    try {
      setIsResetting(true);
      const res = await api.resetProviderCooldowns();
      if (res.providers) {
        setProviders(res.providers);
      }
      showToast(t('resetSuccess'));
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset cooldowns');
    } finally {
      setIsResetting(false);
    }
  };

  const handleRunTest = async (providerId: string) => {
    try {
      setTestingId(providerId);
      setTestResult(null);
      const tmdbId = parseInt(testTmdbId, 10) || 1368337;
      const res = await api.testProvider(providerId, {
        tmdbId,
        kind: testKind,
        season: testKind === 'series' ? testSeason : undefined,
        episode: testKind === 'series' ? testEpisode : undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        providerId,
        providerName: providerId,
        success: false,
        durationMs: 0,
        sourceCount: 0,
        sources: [],
        diagnostics: [err?.message || 'Test resolution failed'],
        error: err?.message,
      });
    } finally {
      setTestingId(null);
    }
  };

  const activeCount = providers.filter((p) => p.isSupported && p.isEnabled).length;
  const disabledCount = providers.filter((p) => p.isSupported && !p.isEnabled).length;

  return (
    <div className="min-h-screen bg-ink pb-24 pt-20 px-[var(--pad)] max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 end-6 z-50 flex items-center gap-2 rounded-xl border border-gilt/40 bg-noir/90 px-4 py-3 text-sm text-bone shadow-2xl backdrop-blur-md animate-fade">
          <Check className="size-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ms-2 text-dust hover:text-bone"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-3 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-bone sm:text-3xl">
              {t('providersTitle')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-dust max-w-2xl">
            {t('providersSubtitle')}
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void fetchProviders()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-bone transition hover:border-white/30 hover:bg-white/10 active:scale-95 disabled:opacity-50"
          >
            {loading ? <Spinner className="size-3.5" /> : '↻'}
            <span>{lang === 'ar' ? 'تحديث الحالة' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => void handleResetCooldowns()}
            disabled={isResetting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gilt/30 bg-gilt/10 px-3.5 py-2 text-xs font-medium text-gilt transition hover:border-gilt hover:bg-gilt/20 active:scale-95 disabled:opacity-50"
          >
            {isResetting ? <Spinner className="size-3.5" /> : null}
            <span>{t('resetCooldowns')}</span>
          </button>
        </div>
      </div>

      {/* Overview Statistics Bar */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <p className="text-xs text-dust">{t('totalProviders')}</p>
          <p className="mt-1 font-display text-2xl font-bold text-bone">{providers.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-sm">
          <p className="text-xs text-emerald-400">{t('activeProviders')}</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-300">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <p className="text-xs text-dust">{lang === 'ar' ? 'المعطلة يدويًا' : 'Disabled'}</p>
          <p className="mt-1 font-display text-2xl font-bold text-bone">{disabledCount}</p>
        </div>
        <div className="rounded-2xl border border-gilt/20 bg-gilt/5 p-4 backdrop-blur-sm">
          <p className="text-xs text-gilt">{lang === 'ar' ? 'نظام البث' : 'Failover'}</p>
          <p className="mt-1 font-display text-xs font-semibold text-gilt uppercase tracking-wider">
            {lang === 'ar' ? 'تعاقب ذكي نشط' : 'Dynamic Cascade'}
          </p>
        </div>
      </div>

      {/* Auto Failover Notification Banner */}
      <div className="mb-8 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-dust">
        <Info className="size-4 text-gilt shrink-0 mt-0.5" />
        <p className="leading-relaxed">{t('autoFailoverNotice')}</p>
      </div>

      {/* Loading & Error States */}
      {loading && providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-dust">
          <Spinner className="size-8 text-gilt mb-3" />
          <p>{lang === 'ar' ? 'جارٍ تحميل حالة المزودات...' : 'Loading providers...'}</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-blood-hot/30 bg-blood/10 p-6 text-center text-bone">
          <p className="font-semibold">{error}</p>
          <button
            onClick={() => void fetchProviders()}
            className="mt-3 rounded-xl bg-blood-hot px-4 py-2 text-xs font-semibold hover:bg-blood transition"
          >
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* Providers Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
        {providers.map((p) => {
          const isToggling = togglingId === p.id;
          const isTestingThis = testingId === p.id;

          return (
            <div
              key={p.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-300 ${
                !p.isSupported
                  ? 'border-rose-500/20 bg-rose-950/10 opacity-75'
                  : !p.isEnabled
                  ? 'border-white/5 bg-white/[0.02] opacity-70'
                  : 'border-white/15 bg-white/[0.04] shadow-lg hover:border-gilt/40'
              }`}
            >
              <div>
                {/* Provider Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-bone">{p.name}</h3>
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-dust">
                        #{p.id}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-dust leading-snug">{p.description}</p>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {p.isSupported ? (
                      <button
                        onClick={() => void handleToggle(p)}
                        disabled={isToggling}
                        aria-label={p.isEnabled ? t('toggleOff') : t('toggleOn')}
                        className={`relative inline-flex h-7 w-13 items-center rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                          p.isEnabled ? 'bg-emerald-500' : 'bg-white/15'
                        } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`inline-block size-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                            p.isEnabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400">
                        {t('providerUnsupported')}
                      </span>
                    )}

                    <span className="text-[11px] font-medium text-dust">
                      {p.isSupported
                        ? p.isEnabled
                          ? t('providerActive')
                          : t('providerDisabled')
                        : t('providerUnsupported')}
                    </span>
                  </div>
                </div>

                {/* Badges Bar */}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  {/* Status Badge */}
                  {p.isSupported && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.inCooldown
                          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : p.isEnabled
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border border-white/10 bg-white/5 text-dust'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          p.inCooldown
                            ? 'bg-amber-400'
                            : p.isEnabled
                            ? 'bg-emerald-400'
                            : 'bg-dust'
                        }`}
                      />
                      {p.inCooldown
                        ? t('providerCooldown')
                        : p.isEnabled
                        ? t('providerActive')
                        : t('providerDisabled')}
                    </span>
                  )}

                  {/* Priority Badge */}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-dust">
                    {t('priority')}: <strong className="text-bone">{p.basePriority}</strong>
                  </span>

                  {/* Media Support Badges */}
                  {p.supportedTypes.map((type) => (
                    <span
                      key={type}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-dust capitalize"
                    >
                      {type === 'movie' ? (lang === 'ar' ? 'أفلام' : 'Movies') : (lang === 'ar' ? 'مسلسلات' : 'Series')}
                    </span>
                  ))}
                </div>

                {/* Health Score & Reliability Bar */}
                {p.isSupported ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-dust">{t('healthScore')}</span>
                      <span
                        className={`font-semibold ${
                          p.healthScore >= 70
                            ? 'text-emerald-400'
                            : p.healthScore >= 40
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {p.healthScore}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full transition-all duration-500 ${
                          p.healthScore >= 70
                            ? 'bg-emerald-400'
                            : p.healthScore >= 40
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                        style={{ width: `${Math.max(5, p.healthScore)}%` }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-dust border-t border-white/5 pt-2">
                      <div>
                        <span>{t('successRate')}: </span>
                        <strong className="text-bone">{p.successRate}</strong>
                      </div>
                      <div>
                        <span>{t('totalRequests')}: </span>
                        <strong className="text-bone">
                          {p.successfulAttempts} / {p.totalAttempts}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-300 leading-relaxed">
                    <strong className="block text-rose-200 mb-1">
                      {lang === 'ar' ? 'غير مدعوم رسميًا' : 'Unsupported Provider'}
                    </strong>
                    {p.unsupportedReason ||
                      'No documented public API or authorized embed integration exists. Project security policy strictly forbids unauthorized scrapers.'}
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                <button
                  onClick={() => void handleRunTest(p.id)}
                  disabled={isTestingThis}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-bone transition hover:border-gilt hover:text-gilt active:scale-95 disabled:opacity-50"
                >
                  {isTestingThis ? <Spinner className="size-3 text-gilt" /> : <Play className="size-3" />}
                  <span>{isTestingThis ? t('testing') : t('testProvider')}</span>
                </button>

                <span className="text-[11px] text-dust">
                  {p.isEnabled ? (lang === 'ar' ? 'جاهز للاستخدام' : 'Ready') : (lang === 'ar' ? 'مستبعد من التشغيل' : 'Excluded')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Test Runner & Diagnostic Panel */}
      <div className="mt-12 rounded-2xl border border-white/15 bg-noir/50 p-6 backdrop-blur-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-bone">
              {lang === 'ar' ? 'مختبر فحص مزودات البث المباشر' : 'Live Provider Testing Suite'}
            </h2>
            <p className="text-xs text-dust">
              {lang === 'ar'
                ? 'اختبر جلب أي فيلم أو مسلسل مباشرة من أي مزود مع قياس زمن الاستجابة ومعاينة الفيديو'
                : 'Test movie or series resolution against any provider with real-time latency measurement and embed preview'}
            </p>
          </div>
        </div>

        {/* Input Parameters */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-dust mb-1">
              TMDB ID (Movie / Show)
            </label>
            <input
              type="text"
              value={testTmdbId}
              onChange={(e) => setTestTmdbId(e.target.value)}
              placeholder="e.g. 1368337, 550"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-bone focus:border-gilt focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dust mb-1">
              {lang === 'ar' ? 'النوع' : 'Kind'}
            </label>
            <select
              value={testKind}
              onChange={(e) => setTestKind(e.target.value as 'movie' | 'series')}
              className="w-full rounded-xl border border-white/15 bg-ink px-3 py-2 text-sm text-bone focus:border-gilt focus:outline-none"
            >
              <option value="movie">{lang === 'ar' ? 'فيلم (Movie)' : 'Movie'}</option>
              <option value="series">{lang === 'ar' ? 'مسلسل (Series)' : 'Series'}</option>
            </select>
          </div>

          {testKind === 'series' && (
            <>
              <div>
                <label className="block text-xs font-medium text-dust mb-1">
                  {lang === 'ar' ? 'الموسم' : 'Season'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={testSeason}
                  onChange={(e) => setTestSeason(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-bone focus:border-gilt focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dust mb-1">
                  {lang === 'ar' ? 'الحلقة' : 'Episode'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={testEpisode}
                  onChange={(e) => setTestEpisode(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-bone focus:border-gilt focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Quick Test Launch Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-dust me-1">{lang === 'ar' ? 'جرّب على:' : 'Test on:'}</span>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => void handleRunTest(p.id)}
              disabled={testingId === p.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-bone transition hover:border-gilt hover:text-gilt active:scale-95 disabled:opacity-50"
            >
              {testingId === p.id ? <Spinner className="size-3 text-gilt" /> : null}
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 animate-fade">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2.5 rounded-full ${
                    testResult.success ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                <span className="font-semibold text-sm text-bone">
                  {testResult.providerName}
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-dust">
                  {testResult.durationMs}ms
                </span>
              </div>

              {testResult.success && testResult.sources[0]?.url && (
                <button
                  onClick={() => setPreviewUrl(testResult.sources[0].url)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gilt/40 bg-gilt/15 px-3 py-1 text-xs font-medium text-gilt hover:bg-gilt/25 transition"
                >
                  <Play className="size-3" />
                  <span>{t('previewEmbed')}</span>
                </button>
              )}
            </div>

            <div className="mt-3 text-xs">
              {testResult.success ? (
                <div>
                  <p className="text-emerald-400 font-medium">
                    {t('testSuccess', { ms: testResult.durationMs })}
                  </p>
                  {testResult.sources.map((s, idx) => (
                    <div
                      key={idx}
                      className="mt-2 rounded-lg border border-white/5 bg-white/[0.03] p-2.5 font-mono text-[11px] text-bone break-all flex items-center justify-between gap-2"
                    >
                      <span>{s.url}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gilt shrink-0">
                        {s.quality} · {s.type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-rose-400">
                  <p className="font-medium">
                    {t('testFailed', { error: testResult.error || 'No sources found' })}
                  </p>
                  {testResult.diagnostics.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-[11px] text-dust">
                      {testResult.diagnostics.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Embed Iframe Preview Modal */}
        {previewUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/20 bg-noir shadow-2xl">
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between border-b border-white/10 bg-black/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono text-dust truncate max-w-md">
                    {previewUrl}
                  </span>
                </div>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-dust hover:text-bone hover:bg-white/10 transition"
                  aria-label={t('closePreview')}
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Iframe View */}
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  src={previewUrl}
                  title="Provider Preview"
                  className="size-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
