/**
 * Generates a small, deliberately messy test library (real, playable video files) so you can
 * verify the scanner without copying your own episodes:   npm run sample-media [-- <dir>]
 * Needs ffmpeg on PATH (or FFMPEG_PATH).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

const SRT_EN = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello there!\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nGeneral Kenobi.\r\n';
// "مرحبا" encoded as Windows-1256 (common for old Arabic subtitle files) — must NOT show up as mojibake.
const SRT_AR_CP1256 = Buffer.concat([
  Buffer.from('1\r\n00:00:01,000 --> 00:00:03,500\r\n', 'latin1'),
  Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]),
  Buffer.from('\r\n', 'latin1'),
]);

async function clip(out: string, opts: { dur: number; faststart?: boolean; twoAudio?: boolean; embedSub?: boolean; freq?: number }) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmpSrt = out + '.tmp.srt';
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=25:duration=${opts.dur}`];
  args.push('-f', 'lavfi', '-i', `sine=frequency=${opts.freq ?? 440}:duration=${opts.dur}`);
  if (opts.twoAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=880:duration=${opts.dur}`);
  if (opts.embedSub) {
    await fs.writeFile(tmpSrt, '1\n00:00:01,000 --> 00:00:03,000\nEmbedded line\n');
    args.push('-i', tmpSrt);
  }
  args.push('-map', '0:v', '-map', '1:a');
  if (opts.twoAudio) args.push('-map', '2:a', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=ara');
  if (opts.embedSub) args.push('-map', `${opts.twoAudio ? 3 : 2}:s`, '-c:s', 'srt', '-metadata:s:s:0', 'language=eng');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', String(opts.dur));
  if (opts.faststart) args.push('-movflags', '+faststart');
  args.push(out);
  try {
    await exec(FFMPEG, args);
  } finally {
    await fs.rm(tmpSrt, { force: true });
  }
}

export async function makeSampleMedia(dir: string, dur = 8): Promise<void> {
  const s2 = path.join(dir, 'the-boys', 's02');
  await clip(path.join(s2, 'The.Boys.S02E01.1080p.WEB-DL.x264.mp4'), { dur, faststart: true });
  await fs.writeFile(path.join(s2, 'The.Boys.S02E01.1080p.WEB-DL.x264.en.srt'), SRT_EN);
  await fs.writeFile(path.join(s2, 'The.Boys.S02E01.1080p.WEB-DL.x264.ar.srt'), SRT_AR_CP1256);
  await clip(path.join(s2, 'the boys 2x02 - Nothing Like It In the World.mp4'), { dur, freq: 523 }); // moov at end
  await clip(path.join(s2, 'Episode 3.mkv'), { dur, embedSub: true, freq: 660 });
  await clip(path.join(s2, '04.mp4'), { dur, faststart: true, twoAudio: true });

  await clip(path.join(dir, 'Inception (2010).mp4'), { dur, faststart: true });
  await fs.writeFile(path.join(dir, 'Inception (2010).srt'), SRT_EN);

  // Unparseable names → numbered by file order; TMDB won't find it → derived metadata.
  await clip(path.join(dir, 'some-random-show', 'a clip.mp4'), { dur: 4 });
  await clip(path.join(dir, 'some-random-show', 'b clip.mp4'), { dur: 4 });
}

if (require.main === module) {
  const dir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..', 'media'));
  makeSampleMedia(dir).then(
    () => console.log(`✓ sample library written to ${dir}`),
    (e) => {
      console.error('Failed (is ffmpeg installed?):', e.message);
      process.exit(1);
    },
  );
}
