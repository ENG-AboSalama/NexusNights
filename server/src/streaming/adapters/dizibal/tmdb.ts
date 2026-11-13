/**
 * TMDB API Integration for Dizibal Provider
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Lazy load TMDB key to ensure dotenv has been loaded
function getTmdbApiKey(): string {
  const key = process.env.TMDB_API_KEY || '';
  if (!key) {
    throw new Error('TMDB_API_KEY not configured');
  }
  return key;
}

interface TmdbInfo {
  title: string;
  originalTitle: string;
  turkishTitle: string;
  year: string;
  posterPath: string | null;
}

interface TmdbResponse {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

/**
 * Get TMDB info including Turkish title
 */
export async function getTmdbInfo(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<TmdbInfo> {
  const TMDB_API_KEY = getTmdbApiKey(); // Lazy load

  const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
  
  // Check if key is Bearer token (v4) or API key (v3)
  const isBearer = TMDB_API_KEY.startsWith('eyJ');
  const headers: Record<string, string> = isBearer
    ? { Authorization: `Bearer ${TMDB_API_KEY}` }
    : {};
  const apiParam = isBearer ? '' : `?api_key=${TMDB_API_KEY}&`;
  
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}${apiParam}${isBearer ? '?' : ''}language=en-US`;

  try {
    const response = await fetch(url, { headers: Object.keys(headers).length > 0 ? headers : undefined });
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = (await response.json()) as TmdbResponse;

    // Get Turkish title
    const urlTr = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}${apiParam}${isBearer ? '?' : ''}language=tr-TR`;
    let turkishTitle = '';

    try {
      const responseTr = await fetch(urlTr, { headers: Object.keys(headers).length > 0 ? headers : undefined });
      if (responseTr.ok) {
        const dataTr = (await responseTr.json()) as TmdbResponse;
        turkishTitle = dataTr.title || dataTr.name || '';
      }
    } catch {
      // Turkish title is optional
    }

    const title = data.title || data.name || '';
    const originalTitle = data.original_title || data.original_name || '';
    const releaseDate = data.release_date || data.first_air_date || '';
    const year = releaseDate ? releaseDate.split('-')[0] : '';
    const posterPath = data.poster_path || null;

    return {
      title,
      originalTitle,
      turkishTitle,
      year,
      posterPath,
    };
  } catch (error) {
    console.error('[Dizibal] TMDB API error:', error);
    throw error;
  }
}
