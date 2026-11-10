import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { MediaItem, ScanPhase, ScanStatus, Title } from '../types';
import { TmdbClient } from '../metadata/tmdb';
import { Overrides } from '../metadata/overrides';
import { enrichTitle } from '../metadata/enrich';
import { exists, fingerprint, safeJoin, shortId } from '../util/fsx';
import { Limiter, mapLimit } from '../util/limiter';
import { discover } from './scanner';
import { probeFile } from './probe';
import { hasFastStart, planPlayback } from './playback';
import { generateSprite, generateThumb, spritePath, thumbPath } from './thumbs';
import { LibraryStore } from './store';
import { HlsManager } from './hls';

const MAX_WARNINGS = 200;

export class LibraryService extends EventEmitter {
  readonly store: LibraryStore;
  readonly tmdb: TmdbClient;
  /** Shared by thumbnails, subtitle extraction and (Stage 2) HLS jobs so we never overload the CPU. */
  readonly ffmpegLimiter: Limiter;
  readonly hls: HlsManager;
  status: ScanStatus = { state: 'idle', phase: null, done: 0, total: 0, startedAt: null, finishedAt: null, warnings: [] };

  private running: Promise<void> | null = null;
  private rescanQueued = false;

  constructor(readonly cfg: Config, tmdb?: TmdbClient) {
    super();
    this.store = new LibraryStore(cfg);
    this.tmdb = tmdb ?? new TmdbClient(cfg);
    this.ffmpegLimiter = new Limiter(cfg.ffmpegConcurrency);
    this.hls = new HlsManager(cfg);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.cfg.dataDir, { recursive: true });
    await fs.mkdir(this.cfg.overridesDir, { recursive: true });
    await this.store.load();
    void this.hls.evict().catch(() => {});
  }

  /** Starts a scan; calls made while one is running are coalesced into exactly one follow-up scan. */
  scan(): Promise<void> {
    if (this.running) {
      this.rescanQueued = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rescanQueued = false;
          await this.runScan();
        } while (this.rescanQueued);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private setPhase(phase: ScanPhase, total = 0) {
    this.status.phase = phase;
    this.status.total = total;
    this.status.done = 0;
  }
  private warn(msg: string) {
    if (this.status.warnings.length < MAX_WARNINGS) this.status.warnings.push(msg);
  }

  private async runScan(): Promise<void> {
    const { cfg, store } = this;
    this.status = { state: 'scanning', phase: 'discover', done: 0, total: 0, startedAt: Date.now(), finishedAt: null, warnings: [] };
    try {
      // ── 1. discover (fast: directory walk + filename parsing) ────────────
      const { titles: scanned, warnings } = await discover(cfg.mediaDir);
      warnings.forEach((w) => this.warn(w));

      const prevMedia = store.media;
      const prevTitles = store.titles;
      const titles: Title[] = [];
      const media: MediaItem[] = [];
      for (const st of scanned) {
        const titleId = shortId('t:' + st.folderKey);
        const prev = prevTitles.get(titleId);
        titles.push({
          id: titleId,
          kind: st.kind,
          folderKey: st.folderKey,
          nameGuess: st.nameGuess,
          yearGuess: st.yearGuess,
          addedAt: Math.max(...st.items.map((i) => i.mtimeMs)),
          meta: prev?.meta,
        });
        for (const it of st.items) {
          const id = shortId('m:' + it.relPath);
          const p = prevMedia.get(id);
          const same = !!p && fingerprint(p.size, p.mtimeMs) === fingerprint(it.size, it.mtimeMs);
          media.push({
            id,
            titleId,
            season: it.season,
            episode: it.episode,
            episodeEnd: it.episodeEnd,
            titleHint: it.titleHint,
            relPath: it.relPath,
            fileName: it.fileName,
            size: it.size,
            mtimeMs: it.mtimeMs,
            subtitleFiles: it.subs,
            probe: same ? p!.probe : undefined,
            playback: same ? p!.playback : undefined,
            meta: p?.meta,
            assets: same ? p!.assets : { thumb: false },
          });
        }
      }
      store.replace(titles, media, new Date().toISOString());
      await store.save(); // library is browsable immediately, even before probing/metadata finish
      this.emit('updated');

      // ── 2. probe (ffprobe) ───────────────────────────────────────────────
      const toProbe = media.filter((m) => !m.probe);
      this.setPhase('probe', toProbe.length);
      await mapLimit(toProbe, 4, async (m) => {
        try {
          const abs = safeJoin(cfg.mediaDir, m.relPath);
          m.probe = await probeFile(cfg, abs);
          const fast = path.extname(m.relPath).match(/^\.(mp4|m4v|mov)$/i) ? await hasFastStart(abs) : false;
          m.playback = planPlayback(m.relPath, m.probe, fast);
          m.probeError = undefined;
        } catch (e) {
          m.probeError = (e as Error).message.slice(0, 200);
          this.warn(`Could not read "${m.fileName}": ${m.probeError}`);
        }
      }, (d) => (this.status.done = d));
      await store.save();
      this.emit('updated');

      // ── 3. metadata (TMDB + metadata.json) ───────────────────────────────
      const overrides = await Overrides.load(cfg);
      overrides.problems.forEach((p) => this.warn(p));
      this.setPhase('metadata', titles.length);
      await mapLimit(titles, 2, async (t) => {
        const w = await enrichTitle({ cfg, tmdb: this.tmdb, overrides }, t, store.itemsOf(t.id));
        w.forEach((x) => this.warn(x));
      }, (d) => (this.status.done = d));
      await store.save();
      this.emit('updated');

      // ── 4. thumbnails + seek sprites (ffmpeg, cached on disk) ────────────
      const needsAssets: MediaItem[] = [];
      for (const m of media) {
        if (!m.probe?.video) continue;
        const thumbOk = m.assets.thumb && (await exists(thumbPath(cfg, m.id)));
        const spriteOk = !!m.assets.sprite && (await exists(spritePath(cfg, m.id)));
        if (!thumbOk) m.assets.thumb = false;
        if (!spriteOk) m.assets.sprite = undefined;
        if (!thumbOk || !spriteOk) needsAssets.push(m);
      }
      this.setPhase('thumbs', needsAssets.length);
      await mapLimit(needsAssets, cfg.ffmpegConcurrency, async (m) => {
        if (!m.assets.thumb) {
          try {
            await generateThumb(cfg, this.ffmpegLimiter, m);
            m.assets.thumb = true;
          } catch (e) {
            this.warn(`Thumbnail failed for "${m.fileName}": ${(e as Error).message}`);
          }
        }
        if (!m.assets.sprite) {
          try {
            m.assets.sprite = await generateSprite(cfg, this.ffmpegLimiter, m);
          } catch (e) {
            this.warn(`Seek preview failed for "${m.fileName}": ${(e as Error).message}`);
          }
        }
      }, (d) => (this.status.done = d));
      await store.save();

      await this.cleanupCaches(media);
      this.emit('updated');
    } catch (e) {
      this.warn(`Scan failed: ${(e as Error).message}`);
    } finally {
      this.status.state = 'idle';
      this.status.phase = null;
      this.status.finishedAt = Date.now();
    }
  }

  /** Deletes thumbnails/sprites of files that no longer exist in the library. */
  private async cleanupCaches(media: MediaItem[]) {
    const keep = new Set(media.map((m) => m.id));
    for (const dir of ['thumbs', 'sprites', 'subs']) {
      const full = path.join(this.cfg.cacheDir, dir);
      let names: string[] = [];
      try {
        names = await fs.readdir(full);
      } catch {
        continue;
      }
      for (const n of names) {
        const id = n.slice(0, 12);
        if (/^[a-f0-9]{12}/.test(n) && !keep.has(id)) await fs.rm(path.join(full, n), { force: true });
      }
    }
  }
}
