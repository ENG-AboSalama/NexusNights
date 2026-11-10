import type { TmdbSearchHit, TmdbMovie, TmdbTv, TmdbTvDetail, TmdbSeason, TmdbEpisode } from '../metadata/tmdb';
import type { GlobalTitleCard, GlobalTitleDetail, GlobalSeason, GlobalEpisode } from '../http/api-types';
import type { LibraryStore } from '../library/store';
import { tmdbArtworkUrl } from '../http/images';

/**
 * Converts TMDB data to NexusNight API format
 * Checks local availability and builds consistent IDs
 */
export class DiscoveryPresenter {
  constructor(private store: LibraryStore) {}

  /**
   * Convert TMDB search hit to global title card (works for both movie and TV)
   */
  searchHitToCard(hit: TmdbSearchHit & { media_type?: 'movie' | 'tv'; poster_path?: string | null; backdrop_path?: string | null; vote_average?: number }, forceKind?: 'movie' | 'series'): GlobalTitleCard {
    const isMovie = forceKind === 'movie' || (hit.media_type === 'movie' || !!hit.title);
    const tmdbId = hit.id;
    const title = isMovie ? (hit.title ?? hit.name ?? '') : (hit.name ?? hit.title ?? '');
    const originalTitle = isMovie ? (hit.original_title ?? hit.original_name ?? title) : (hit.original_name ?? hit.original_title ?? title);
    const releaseDate = isMovie ? hit.release_date : hit.first_air_date;
    const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null;
    
    // Check if this exists locally
    const localTitle = this.findLocalByTmdbId(tmdbId, isMovie ? 'movie' : 'tv');
    const availability = localTitle ? 'local' : 'discover';

    return {
      id: localTitle?.id ?? (isMovie ? `movie-${tmdbId}` : `tv-${tmdbId}`),
      tmdbId,
      kind: isMovie ? 'movie' : 'series',
      title,
      originalTitle,
      overview: '',
      posterUrl: tmdbArtworkUrl('poster', hit.poster_path),
      backdropUrl: tmdbArtworkUrl('backdrop', hit.backdrop_path),
      releaseDate: releaseDate || null,
      rating: hit.vote_average || null,
      year,
      availability,
      localId: localTitle?.id,
    };
  }

  /**
   * Convert TMDB movie to global title card
   */
  movieToCard(movie: TmdbMovie): GlobalTitleCard {
    const tmdbId = movie.id;
    const year = movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null;
    
    const localTitle = this.findLocalByTmdbId(tmdbId, 'movie');
    const availability = localTitle ? 'local' : 'discover';

    return {
      id: localTitle?.id ?? `movie-${tmdbId}`,
      tmdbId,
      kind: 'movie',
      title: movie.title,
      originalTitle: movie.title,
      overview: movie.overview || '',
      posterUrl: tmdbArtworkUrl('poster', movie.poster_path),
      backdropUrl: tmdbArtworkUrl('backdrop', movie.backdrop_path),
      releaseDate: movie.release_date || null,
      rating: movie.vote_average || null,
      year,
      availability,
      localId: localTitle?.id,
    };
  }

  /**
   * Convert TMDB TV show to global title card
   */
  tvToCard(tv: TmdbTv): GlobalTitleCard {
    const tmdbId = tv.id;
    const year = tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null;
    
    const localTitle = this.findLocalByTmdbId(tmdbId, 'tv');
    const availability = localTitle ? 'local' : 'discover';

    return {
      id: localTitle?.id ?? `tv-${tmdbId}`,
      tmdbId,
      kind: 'series',
      title: tv.name,
      originalTitle: tv.name,
      overview: tv.overview || '',
      posterUrl: tmdbArtworkUrl('poster', tv.poster_path),
      backdropUrl: tmdbArtworkUrl('backdrop', tv.backdrop_path),
      releaseDate: tv.first_air_date || null,
      rating: tv.vote_average || null,
      year,
      availability,
      localId: localTitle?.id,
    };
  }

  /**
   * Convert TMDB movie details to global title detail
   */
  movieDetailToGlobal(movie: TmdbMovie): GlobalTitleDetail {
    const tmdbId = movie.id;
    const year = movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null;
    const localTitle = this.findLocalByTmdbId(tmdbId, 'movie');
    const availability = localTitle ? 'local' : 'discover';

    return {
      tmdbId,
      kind: 'movie',
      title: movie.title,
      originalTitle: movie.title,
      overview: movie.overview || '',
      tagline: movie.tagline || null,
      posterUrl: tmdbArtworkUrl('poster', movie.poster_path),
      backdropUrl: tmdbArtworkUrl('backdrop', movie.backdrop_path),
      releaseDate: movie.release_date || null,
      rating: movie.vote_average || null,
      year,
      genres: movie.genres?.map(g => g.name) || [],
      runtime: movie.runtime || null,
      status: movie.status || 'Unknown',
      availability,
      localId: localTitle?.id,
    };
  }

  /**
   * Convert TMDB TV details to global title detail
   */
  tvDetailToGlobal(tv: TmdbTvDetail): GlobalTitleDetail {
    const tmdbId = tv.id;
    const year = tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null;
    const localTitle = this.findLocalByTmdbId(tmdbId, 'tv');
    const availability = localTitle ? 'local' : 'discover';

    return {
      tmdbId,
      kind: 'series',
      title: tv.name,
      originalTitle: tv.name,
      overview: tv.overview || '',
      tagline: tv.tagline || null,
      posterUrl: tmdbArtworkUrl('poster', tv.poster_path),
      backdropUrl: tmdbArtworkUrl('backdrop', tv.backdrop_path),
      releaseDate: tv.first_air_date || null,
      rating: tv.vote_average || null,
      year,
      genres: tv.genres?.map(g => g.name) || [],
      runtime: tv.episode_run_time?.[0] || null,
      status: tv.status || 'Unknown',
      availability,
      localId: localTitle?.id,
      numberOfSeasons: tv.number_of_seasons,
      numberOfEpisodes: tv.number_of_episodes,
      seasons: tv.seasons?.filter(s => s.season_number > 0).map(s => this.seasonToGlobal(s, tmdbId)) || [],
    };
  }

  /**
   * Convert TMDB season to global season
   */
  seasonToGlobal(season: TmdbSeason, tvId: number): GlobalSeason {
    const result: GlobalSeason = {
      seasonNumber: season.season_number,
      name: season.name || `Season ${season.season_number}`,
      overview: season.overview || '',
      posterUrl: tmdbArtworkUrl('poster', season.poster_path),
      airDate: season.air_date || null,
      episodeCount: season.episode_count || 0,
    };

    if (season.episodes) {
      result.episodes = season.episodes.map(ep => this.episodeToGlobal(ep, tvId));
    }

    return result;
  }

  /**
   * Convert TMDB episode to global episode
   */
  episodeToGlobal(episode: TmdbEpisode, tvId: number): GlobalEpisode {
    const localMedia = this.findLocalEpisode(tvId, episode.season_number || 0, episode.episode_number);
    const availability = localMedia ? 'local' : 'discover';

    return {
      tmdbId: 0, // TMDB doesn't provide episode IDs in season details
      episodeNumber: episode.episode_number,
      seasonNumber: episode.season_number || 0,
      name: episode.name || `Episode ${episode.episode_number}`,
      overview: episode.overview || '',
      stillUrl: tmdbArtworkUrl('still', episode.still_path),
      airDate: episode.air_date || null,
      runtime: episode.runtime || null,
      rating: episode.vote_average || null,
      availability,
      localMediaId: localMedia?.id,
    };
  }

  /**
   * Find local title by TMDB ID
   */
  private findLocalByTmdbId(tmdbId: number, kind: 'movie' | 'tv') {
    for (const title of this.store.titles.values()) {
      if (title.meta?.tmdbId === tmdbId && ((kind === 'movie' && title.kind === 'movie') || (kind === 'tv' && title.kind === 'series'))) {
        return title;
      }
    }
    return null;
  }

  /**
   * Find local episode by TMDB TV ID and episode numbers
   */
  private findLocalEpisode(tvId: number, season: number, episode: number) {
    const title = this.findLocalByTmdbId(tvId, 'tv');
    if (!title) return null;

    for (const media of this.store.media.values()) {
      if (media.titleId === title.id && media.season === season && media.episode === episode) {
        return media;
      }
    }
    return null;
  }
}
