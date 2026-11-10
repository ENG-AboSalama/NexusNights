export type PlaybackErrorCode =
  | 'media_not_ready'
  | 'media_tools_missing'
  | 'media_probe_failed'
  | 'ffmpeg_missing'
  | 'ffmpeg_failed'
  | 'playback_failed';

export function probeErrorCode(error?: string): Extract<PlaybackErrorCode, 'media_not_ready' | 'media_tools_missing' | 'media_probe_failed'> {
  if (!error) return 'media_not_ready';
  return error.includes('ENOENT') ? 'media_tools_missing' : 'media_probe_failed';
}

export function ffmpegErrorCode(error?: string): Extract<PlaybackErrorCode, 'ffmpeg_missing' | 'ffmpeg_failed'> {
  return error?.includes('ENOENT') ? 'ffmpeg_missing' : 'ffmpeg_failed';
}
