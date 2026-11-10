import type { Config } from '../config';
import type { AudioTrack, EmbeddedSub, Probe } from '../types';
import { normalizeLang } from '../util/lang';
import { run } from '../util/run';

interface FfStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  channels?: number;
  duration?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
}

const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);

function fps(r?: string): number | undefined {
  if (!r) return undefined;
  const [a, b] = r.split('/').map(Number);
  return b ? Math.round((a / b) * 100) / 100 : undefined;
}

export async function probeFile(cfg: Config, absPath: string): Promise<Probe> {
  const { stdout } = await run(
    cfg.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', absPath],
    { timeoutMs: 60_000, maxBuffer: 32 * 1024 * 1024 },
  );
  const j = JSON.parse(stdout) as { streams?: FfStream[]; format?: { duration?: string; bit_rate?: string; format_name?: string } };
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);

  const audio: AudioTrack[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, ord) => ({
      index: s.index,
      ord,
      codec: s.codec_name ?? 'unknown',
      channels: s.channels,
      lang: normalizeLang(s.tags?.language),
      label: s.tags?.title,
      default: s.disposition?.default === 1,
    }));

  const subs: EmbeddedSub[] = streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s, ord) => ({
      index: s.index,
      ord,
      codec: s.codec_name ?? 'unknown',
      lang: normalizeLang(s.tags?.language),
      label: s.tags?.title,
      textBased: TEXT_SUB_CODECS.has(s.codec_name ?? ''),
      forced: s.disposition?.forced === 1,
      default: s.disposition?.default === 1,
    }));

  const duration = parseFloat(j.format?.duration ?? '') || parseFloat(v?.duration ?? '') || 0;
  if (!v && !audio.length) throw new Error('No playable streams');

  return {
    durationSec: Math.round(duration * 100) / 100,
    container: (j.format?.format_name ?? '').split(',')[0],
    bitrate: j.format?.bit_rate ? parseInt(j.format.bit_rate, 10) : undefined,
    video: v
      ? {
          codec: v.codec_name ?? 'unknown',
          profile: v.profile,
          width: v.width ?? 0,
          height: v.height ?? 0,
          pixFmt: v.pix_fmt,
          fps: fps(v.avg_frame_rate),
        }
      : undefined,
    audio,
    subs,
  };
}
