/**
 * Dynamic Meta Tags Utilities
 * Update page metadata for social sharing (Discord, WhatsApp, Twitter, etc.)
 */

interface MetaTagsConfig {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'video.movie' | 'video.tv_show';
}

/**
 * Update meta tags dynamically for social sharing embeds
 */
export function updateMetaTags(config: MetaTagsConfig): void {
  const {
    title,
    description,
    image = 'https://nexusnight.com/og-image.png',
    url = window.location.href,
    type = 'website',
  } = config;

  // Update document title
  document.title = title;

  // Update or create meta tags
  setMetaTag('name', 'title', title);
  setMetaTag('name', 'description', description);

  // Open Graph
  setMetaTag('property', 'og:type', type);
  setMetaTag('property', 'og:url', url);
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:image', image);

  // Twitter Card
  setMetaTag('property', 'twitter:card', 'summary_large_image');
  setMetaTag('property', 'twitter:url', url);
  setMetaTag('property', 'twitter:title', title);
  setMetaTag('property', 'twitter:description', description);
  setMetaTag('property', 'twitter:image', image);

  // Discord-specific
  setMetaTag('name', 'discord:site_name', 'NexusNight');
  setMetaTag('property', 'discord:color', '#8b5cf6');
}

/**
 * Set or update a meta tag
 */
function setMetaTag(attribute: 'name' | 'property', key: string, value: string): void {
  let tag = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement;
  
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  
  tag.content = value;
}

/**
 * Reset to default homepage meta tags
 */
export function resetMetaTags(): void {
  updateMetaTags({
    title: 'NexusNight - Watch Movies & Series Together',
    description: 'Watch movies and TV shows with friends in real-time. Powered by Discord Activity. Stream together, chat together, enjoy together.',
    url: window.location.origin,
  });
}

/**
 * Generate meta tags for a movie
 */
export function setMovieMetaTags(movie: {
  title: string;
  overview: string;
  posterPath?: string | null;
  releaseYear?: number | null;
}): void {
  const year = movie.releaseYear ? ` (${movie.releaseYear})` : '';
  const image = movie.posterPath 
    ? `https://image.tmdb.org/t/p/w1280${movie.posterPath}`
    : undefined;

  updateMetaTags({
    title: `${movie.title}${year} - NexusNight`,
    description: movie.overview || `Watch ${movie.title} on NexusNight`,
    image,
    type: 'video.movie',
  });
}

/**
 * Generate meta tags for a TV series
 */
export function setSeriesMetaTags(series: {
  title: string;
  overview: string;
  posterPath?: string | null;
  releaseYear?: number | null;
  season?: number;
  episode?: number;
}): void {
  const year = series.releaseYear ? ` (${series.releaseYear})` : '';
  const seasonEp = series.season && series.episode 
    ? ` - S${series.season}E${series.episode}` 
    : '';
  
  const image = series.posterPath 
    ? `https://image.tmdb.org/t/p/w1280${series.posterPath}`
    : undefined;

  updateMetaTags({
    title: `${series.title}${year}${seasonEp} - NexusNight`,
    description: series.overview || `Watch ${series.title} on NexusNight`,
    image,
    type: 'video.tv_show',
  });
}
