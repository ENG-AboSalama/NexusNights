type ArtworkKind = 'poster' | 'backdrop' | 'still';

const TMDB_PATH = /^\/[\w-]+\.(jpg|jpeg|png|webp)$/i;

export function tmdbArtworkUrl(kind: ArtworkKind, path: string | null | undefined): string | null {
  if (!path || !TMDB_PATH.test(path)) return null;
  return `/api/images/tmdb/${kind}/${encodeURIComponent(path.slice(1))}`;
}
