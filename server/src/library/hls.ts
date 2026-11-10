import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { MediaItem } from '../types';
import { Limiter } from '../util/limiter';
import { exists, fingerprint, safeJoin, shortId } from '../util/fsx';
import { ffmpegErrorCode } from './playback-error';

export interface HlsStatus {
  state: 'preparing' | 'ready' | 'error';
  /** The player may load master.m3u8 now. */
  canStart: boolean;
  /** ffmpeg finished: the playlist is a complete VOD (full seeking). */
  finished: boolean;
  progress: number; // 0..1
  error?: 'ffmpeg_missing' | 'ffmpeg_failed';
}

interface Job {
  dir: string;
  state: 'queued' | 'running' | 'done' | 'error';
  proc?: ChildProcess;
  error?: string;
  progressSec: number;
  durationSec: number;
  transcoding: boolean;
  variants: number;
  finishedAt?: number;
  lastTouch: number;
}

const SEGMENT_SEC = 6;
const HEAD_START_SEGMENTS = 3; // transcodes become playable after ~18s of output

/**
 * On-demand ffmpeg → HLS (MPEG-TS) for everything the browser can't direct-play.
 *  - video is *copied* when it is browser-safe H.264, otherwise transcoded (libx264 veryfast)
 *  - audio is copied when AAC, otherwise transcoded to AAC stereo
 *  - several audio tracks → alternate-audio renditions in master.m3u8 (player can switch)
 * Output lives in data/cache/hls/<id>-<fingerprint>-<plan>/ and is evicted LRU past HLS_CACHE_GB.
 */
export class HlsManager {
  private jobs = new Map<string, Job>();
  private base: string;
  private limiter: Limiter;

  constructor(private cfg: Config) {
    this.base = path.join(cfg.cacheDir, 'hls');
    this.limiter = new Limiter(cfg.hlsConcurrency);
  }

  private audioCount(item: MediaItem) {
    return Math.min(item.probe?.audio.length ?? 0, 8);
  }

  dirNameFor(item: MediaItem): string {
    const pb = item.playback!;
    return `${item.id}-${fingerprint(item.size, item.mtimeMs)}-${shortId(`${pb.video}${pb.audio}${this.audioCount(item)}`, 4)}`;
  }

  dirFor(item: MediaItem): string {
    return path.join(this.base, this.dirNameFor(item));
  }

  async ensure(item: MediaItem): Promise<Job> {
    if (!item.probe?.video || !item.playback) throw new Error('not playable');
    const name = this.dirNameFor(item);
    let job = this.jobs.get(name);
    if (job && !(job.state === 'error' && Date.now() - (job.finishedAt ?? 0) > 15_000)) return job;

    const dir = path.join(this.base, name);
    const n = this.audioCount(item);
    job = {
      dir,
      state: 'queued',
      progressSec: 0,
      durationSec: item.probe.durationSec,
      transcoding: item.playback.video === 'transcode',
      variants: n > 1 ? 1 + n : 1,
      lastTouch: Date.now(),
    };
    this.jobs.set(name, job);

    if (await exists(path.join(dir, '.done'))) {
      job.state = 'done';
      return job;
    }
    const j = job;
    void this.limiter
      .run(() => this.run(item, j))
      .catch((e: Error) => {
        j.state = 'error';
        j.error = e.message;
        j.finishedAt = Date.now();
      });
    return job;
  }

  private buildArgs(item: MediaItem, dir: string): string[] {
    const pb = item.playback!;
    const n = this.audioCount(item);
    const abs = safeJoin(this.cfg.mediaDir, item.relPath);
    const args = ['-nostdin', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-y', '-i', abs, '-map', '0:v:0'];
    for (let i = 0; i < n; i++) args.push('-map', `0:a:${i}`);
    args.push('-sn', '-dn');

    if (pb.video === 'copy') args.push('-c:v', 'copy');
    else {
      args.push(
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-level', '4.1',
        '-vf', "scale='min(1920,iw)':-2",
        '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SEC})`, '-sc_threshold', '0',
      );
    }
    if (n > 0) {
      if (pb.audio === 'copy') args.push('-c:a', 'copy');
      else args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
    }

    let map: string;
    if (n <= 1) map = n === 1 ? 'v:0,a:0,name:main' : 'v:0,name:main';
    else {
      const def = Math.max(0, item.probe!.audio.findIndex((a) => a.default));
      const parts = ['v:0,agroup:aud,name:video'];
      for (let i = 0; i < n; i++) {
        const lang = item.probe!.audio[i].lang;
        parts.push(`a:${i},agroup:aud${lang ? `,language:${lang}` : ''},name:audio${i}${i === def ? ',default:yes' : ''}`);
      }
      map = parts.join(' ');
    }
    args.push(
      '-max_muxing_queue_size', '2048',
      '-f', 'hls', '-hls_time', String(SEGMENT_SEC), '-hls_playlist_type', 'event', '-hls_list_size', '0',
      '-hls_segment_type', 'mpegts', '-hls_flags', 'independent_segments+temp_file',
      '-master_pl_name', 'master.m3u8',
      '-hls_segment_filename', path.join(dir, '%v_%05d.ts'),
      '-var_stream_map', map,
      path.join(dir, '%v.m3u8'),
    );
    return args;
  }

  private async run(item: MediaItem, job: Job): Promise<void> {
    await fs.rm(job.dir, { recursive: true, force: true });
    await fs.mkdir(job.dir, { recursive: true });
    job.state = 'running';

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.cfg.ffmpeg, this.buildArgs(item, job.dir), { windowsHide: true });
      job.proc = proc;
      let stderr = '';
      let buf = '';
      proc.stdout.on('data', (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const l of lines) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
          if (m) job.progressSec = Number(m[1]) / 1e6;
        }
      });
      proc.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
      const kill = setTimeout(() => proc.kill('SIGKILL'), Math.max(15 * 60_000, job.durationSec * 5000));
      proc.on('error', (e) => {
        clearTimeout(kill);
        reject(e);
      });
      proc.on('close', (code, signal) => {
        clearTimeout(kill);
        job.proc = undefined;
        if (code === 0) resolve();
        else reject(new Error(signal ? `ffmpeg stopped (${signal})` : `ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`));
      });
    });

    await fs.writeFile(path.join(job.dir, '.done'), String(Date.now()));
    job.state = 'done';
    job.finishedAt = Date.now();
    job.progressSec = job.durationSec;
    void this.evict().catch(() => {});
  }

  async status(item: MediaItem): Promise<HlsStatus> {
    const job = await this.ensure(item);
    if (job.state === 'error') return { state: 'error', canStart: false, finished: false, progress: 0, error: ffmpegErrorCode(job.error) };
    if (job.state === 'done') {
      void this.touch(job);
      return { state: 'ready', canStart: true, finished: true, progress: 1 };
    }
    const progress = job.durationSec ? Math.min(0.99, job.progressSec / job.durationSec) : 0;
    let canStart = false;
    if (job.state === 'running' && job.transcoding && (await exists(path.join(job.dir, 'master.m3u8')))) {
      const segs = (await fs.readdir(job.dir)).filter((f) => f.endsWith('.ts')).length;
      canStart = segs >= HEAD_START_SEGMENTS * job.variants;
    }
    return { state: canStart ? 'ready' : 'preparing', canStart, finished: false, progress };
  }

  /** Returns the cache dir + completion flag if a file may be served, else null. */
  async lookup(item: MediaItem): Promise<{ dir: string; finished: boolean } | null> {
    if (!item.playback) return null;
    const dir = this.dirFor(item);
    const job = this.jobs.get(path.basename(dir));
    if (job && job.state !== 'error') return { dir, finished: job.state === 'done' };
    if (await exists(path.join(dir, '.done'))) return { dir, finished: true };
    return null;
  }

  private async touch(job: Job) {
    if (Date.now() - job.lastTouch < 5 * 60_000) return;
    job.lastTouch = Date.now();
    const f = path.join(job.dir, '.done');
    const now = new Date();
    await fs.utimes(f, now, now).catch(() => {});
  }

  /** Deletes least-recently-used finished HLS folders until the cache fits HLS_CACHE_GB. */
  async evict(): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(this.base);
    } catch {
      return;
    }
    const active = new Set([...this.jobs.entries()].filter(([, j]) => j.state === 'queued' || j.state === 'running').map(([k]) => k));
    const rows: { name: string; size: number; at: number }[] = [];
    for (const name of names) {
      const dir = path.join(this.base, name);
      let size = 0;
      let at = 0;
      try {
        for (const f of await fs.readdir(dir)) size += (await fs.stat(path.join(dir, f))).size;
        at = (await fs.stat(path.join(dir, '.done')).catch(() => fs.stat(dir))).mtimeMs;
      } catch {
        continue;
      }
      rows.push({ name, size, at });
    }
    let total = rows.reduce((a, r) => a + r.size, 0);
    for (const r of rows.sort((a, b) => a.at - b.at)) {
      if (total <= this.cfg.hlsCacheBytes) break;
      if (active.has(r.name)) continue;
      await fs.rm(path.join(this.base, r.name), { recursive: true, force: true });
      this.jobs.delete(r.name);
      total -= r.size;
    }
  }

  shutdown() {
    for (const j of this.jobs.values()) j.proc?.kill('SIGKILL');
  }
}
