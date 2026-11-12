import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'title'; id: string }
  | { name: 'watch'; id: string }
  | { name: 'global-title'; kind: 'movie' | 'series'; tmdbId: number }
  | { name: 'embed-poc' }
  | { name: 'providers' }
  | { name: 'discover-rooms' }
  | { name: 'admin-dashboard' };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  
  // Admin Dashboard
  if (parts[0] === 'admin' || parts[0] === 'dashboard' || parts[0] === 'admin-dashboard') {
    return { name: 'admin-dashboard' };
  }
  
  // Discover Rooms page
  if (parts[0] === 'rooms' || parts[0] === 'discover') {
    return { name: 'discover-rooms' };
  }
  
  // Streaming Providers management page
  if (parts[0] === 'providers' || parts[0] === 'streaming-providers') {
    return { name: 'providers' };
  }

  // Player.js Compatibility POC route
  if (parts[0] === 'poc' || parts[0] === 'embed-poc') {
    return { name: 'embed-poc' };
  }
  
  // Watch route: supports both local IDs (12 hex chars) and synthetic streaming IDs
  if (parts[0] === 'watch' && parts[1]) {
    return { name: 'watch', id: parts[1] };
  }
  
  // Global title routes: #/title/tmdb:ID -> convert to #/movie/ID or #/tv/ID
  // This handles legacy search results that might still use tmdb: format
  if (parts[0] === 'title' && parts[1] && parts[1].startsWith('tmdb:')) {
    // We can't determine movie vs tv from just the ID, so redirect to home
    // The search bar should now use the correct format
    return { name: 'home' };
  }
  
  // Local title IDs (12 hex chars)
  if (parts[0] === 'title' && parts[1] && /^[a-f0-9]{12}$/.test(parts[1])) {
    return { name: 'title', id: parts[1] };
  }
  
  // Global title routes: #/movie/603 or #/tv/1396
  if ((parts[0] === 'movie' || parts[0] === 'tv') && parts[1] && /^\d+$/.test(parts[1])) {
    return { name: 'global-title', kind: parts[0] === 'movie' ? 'movie' : 'series', tmdbId: parseInt(parts[1], 10) };
  }
  
  return { name: 'home' };
}

/** Hash routing: works inside the Discord iframe without any server-side route handling. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = {
  home: () => { location.hash = '#/'; },
  title: (id: string) => { location.hash = `#/title/${id}`; },
  watch: (id: string) => { location.hash = `#/watch/${id}`; },
  embedPoc: () => { location.hash = '#/poc'; },
  providers: () => { location.hash = '#/providers'; },
  discoverRooms: () => { location.hash = '#/rooms'; },
  adminDashboard: () => { location.hash = '#/admin'; },
  globalTitle: (kind: 'movie' | 'series', tmdbId: number) => { 
    location.hash = `#/${kind === 'movie' ? 'movie' : 'tv'}/${tmdbId}`; 
  },
};

export const hrefs = {
  home: '#/',
  title: (id: string) => `#/title/${id}`,
  watch: (id: string) => `#/watch/${id}`,
  providers: '#/providers',
  discoverRooms: '#/rooms',
  adminDashboard: '#/admin',
  globalTitle: (kind: 'movie' | 'series', tmdbId: number) => 
    `#/${kind === 'movie' ? 'movie' : 'tv'}/${tmdbId}`,
};
