import fs from 'node:fs/promises';
import path from 'node:path';
import type { Playback, Probe } from '../types';

/**
 * True when the MP4's `moov` atom comes before `mdat` (so the browser can start playing
 * and seek via HTTP range requests without downloading the whole file first).
 */
export async function hasFastStart(file: string): Promise<boolean> {
  let fh;
  try {
    fh = await fs.open(file, 'r');
    const { size } = await fh.stat();
    let pos = 0;
    const head = Buffer.alloc(16);
    for (let i = 0; i < 64 && pos + 8 <= size; i++) {
      await fh.read(head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('ascii', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len === 1) len = Number(head.readBigUInt64BE(8)); // 64-bit box size
      if (len < 8) return false;
      pos += len;
    }
    return false;
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

const BROWSER_VIDEO_COPY = new Set(['h264']);
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);

/**
 * Decides how this file reaches the Discord iframe (Chromium):
 *  - direct: plain MP4/WebM with HTTP range requests (H.264/AAC, faststart, one audio track)
 *  - hls:    ffmpeg → HLS; video is *copied* when it's browser-safe H.264, else transcoded;
 *            audio is copied when AAC, else transcoded. Multiple audio tracks always use HLS
 *            so the player can switch between them.
 */
export function planPlayback(relPath: string, probe: Probe, fastStart: boolean): Playback {
  const ext = path.extname(relPath).toLowerCase();
  const reasons: string[] = [];
  const v = probe.video;

  const h264Safe = !!v && BROWSER_VIDEO_COPY.has(v.codec) && (v.pixFmt ?? 'yuv420p') === 'yuv420p';
  if (v && !h264Safe) reasons.push(`video ${v.codec}${v.pixFmt ? '/' + v.pixFmt : ''} needs transcoding for browsers`);

  const aacOnly = probe.audio.every((a) => a.codec === 'aac');
  if (!aacOnly) reasons.push(`audio ${[...new Set(probe.audio.map((a) => a.codec))].join(',')} needs transcoding`);

  const containerOk = ['.mp4', '.m4v', '.mov'].includes(ext);
  const webm = ext === '.webm' && !!v && ['vp8', 'vp9', 'av1'].includes(v.codec);
  const audioOk = probe.audio.every((a) => DIRECT_AUDIO.has(a.codec));

  if (!containerOk && !webm) reasons.push(`container ${ext} is not browser-native`);
  if (containerOk && !fastStart) reasons.push('MP4 has moov atom at the end (not seekable until fully loaded)');
  if (probe.audio.length > 1) reasons.push('multiple audio tracks → HLS for track switching');

  const direct =
    (containerOk && h264Safe && audioOk && fastStart || webm && audioOk) && probe.audio.length <= 1;

  return {
    mode: direct ? 'direct' : 'hls',
    video: h264Safe ? 'copy' : 'transcode',
    audio: aacOnly ? 'copy' : 'transcode',
    reasons: direct ? [] : reasons,
  };
}
