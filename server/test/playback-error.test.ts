import test from 'node:test';
import assert from 'node:assert/strict';
import { Presenter } from '../src/http/present';
import type { LibraryService } from '../src/library/service';
import { ffmpegErrorCode, probeErrorCode } from '../src/library/playback-error';
import type { MediaItem, Title } from '../src/types';

test('missing ffprobe is exposed as a safe, actionable playback code', () => {
  const title: Title = { id: 'title-id', kind: 'series', folderKey: 'Show', nameGuess: 'Show', addedAt: 1 };
  const media: MediaItem = {
    id: 'media-id',
    titleId: title.id,
    relPath: 'private/episode.mp4',
    fileName: 'episode.mp4',
    size: 100,
    mtimeMs: 1,
    subtitleFiles: [],
    probeError: 'ffprobe failed: spawn ffprobe ENOENT',
    assets: { thumb: false },
  };
  const store = {
    titles: new Map([[title.id, title]]),
    itemsOf: () => [media],
  };
  const presenter = new Presenter({ store } as unknown as LibraryService);
  const detail = presenter.detail(media, 'ar');

  assert.equal(detail.playable, false);
  assert.equal(detail.playback, null);
  assert.equal(detail.playbackError, 'media_tools_missing');
  assert.ok(!JSON.stringify(detail).includes('ENOENT'));
  assert.ok(!JSON.stringify(detail).includes(media.relPath));
});

test('playback issue classifiers distinguish pending and missing-tool states', () => {
  assert.equal(probeErrorCode(), 'media_not_ready');
  assert.equal(probeErrorCode('probe returned invalid media'), 'media_probe_failed');
  assert.equal(ffmpegErrorCode('ffmpeg failed: spawn ffmpeg ENOENT'), 'ffmpeg_missing');
  assert.equal(ffmpegErrorCode('ffmpeg exited 1: invalid data'), 'ffmpeg_failed');
});
