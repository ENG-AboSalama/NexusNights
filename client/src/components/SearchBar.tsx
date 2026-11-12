/**
 * Global Search Bar
 * 
 * Searches TMDB catalog with debouncing
 */

import { useState, useEffect, useRef } from 'react';
import { u } from '../api';
import { useI18n } from '../i18n';
import { go } from '../router';
import { tmdbArtworkUrl } from '../util/tmdb-artwork';
import { Spinner, Star, X } from './Icons';

interface SearchResult {
  id: number;
  media_type?: 'movie' | 'tv';
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
}

interface SearchResponse {
  results: SearchResult[];
  total_results: number;
}

export function SearchBar() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  
  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    
    setLoading(true);
    debounceTimer.current = setTimeout(() => {
      performSearch(query);
    }, 300);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);
  
  async function performSearch(searchQuery: string) {
    try {
      const [moviesRes, tvRes] = await Promise.all([
        fetch(u(`/api/tmdb/search/movie?query=${encodeURIComponent(searchQuery)}`)),
        fetch(u(`/api/tmdb/search/tv?query=${encodeURIComponent(searchQuery)}`))
      ]);
      
      const [moviesData, tvData] = await Promise.all([
        moviesRes.json() as Promise<SearchResponse>,
        tvRes.json() as Promise<SearchResponse>
      ]);
      
      // Combine and sort by popularity
      const combined = [
        ...moviesData.results.map(r => ({ ...r, media_type: 'movie' as const })),
        ...tvData.results.map(r => ({ ...r, media_type: 'tv' as const }))
      ];
      combined.sort((a, b) => b.vote_average - a.vote_average);
      
      setResults(combined.slice(0, 8)); // Top 8 results
      setShowResults(true);
      setLoading(false);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
      setLoading(false);
    }
  }
  
  function handleResultClick(result: SearchResult) {
    // Navigate to global title page with correct route format
    const kind = result.media_type === 'tv' ? 'series' : 'movie';
    go.globalTitle(kind, result.id);
    setShowResults(false);
    setQuery('');
  }
  
  function clearSearch() {
    setQuery('');
    setResults([]);
    setShowResults(false);
  }
  
  return (
    <div ref={searchRef} className="relative w-full max-w-md" dir="ltr">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={lang === 'ar' ? 'ابحث عن أفلام ومسلسلات…' : 'Search movies & TV shows…'}
          aria-label={lang === 'ar' ? 'البحث في الأفلام والمسلسلات' : 'Search for movies and TV shows'}
          className="w-full h-9 px-4 pe-20 bg-white/5 border border-white/10 rounded-full text-sm text-bone placeholder:text-dust focus:outline-none focus:border-gilt/60 transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        
        <div className="absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {loading && <Spinner className="size-4 text-gilt" aria-hidden="true" />}
          {query && !loading && (
            <button
              onClick={clearSearch}
              className="text-dust hover:text-bone transition-colors"
              aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      
      {/* Results Dropdown */}
      {showResults && results.length > 0 && (
        <div 
          className="absolute top-full mt-2 w-full bg-crypt/98 backdrop-blur-xl border border-gilt/20 rounded-2xl shadow-[0_8px_32px_0_rgba(201,168,106,0.15)] overflow-hidden z-50"
          role="listbox"
          aria-label={lang === 'ar' ? 'نتائج البحث' : 'Search results'}
        >
          <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
            {results.map(result => (
              <SearchResultItem
                key={result.id}
                result={result}
                onClick={() => handleResultClick(result)}
              />
            ))}
          </div>
          
          <div className="px-4 py-2.5 bg-gilt/5 border-t border-gilt/20 text-xs text-gilt/90 text-center font-medium" role="status">
            {results.length} {t('results')}
          </div>
        </div>
      )}
      
      {loading && (
        <div className="sr-only" role="status" aria-live="polite">
          {lang === 'ar' ? 'جاري البحث…' : 'Searching…'}
        </div>
      )}
    </div>
  );
}

function SearchResultItem({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const { lang } = useI18n();
  const title = result.title || result.name || '';
  const year = result.release_date?.substring(0, 4) || result.first_air_date?.substring(0, 4);
  const posterUrl = tmdbArtworkUrl('poster', result.poster_path);
  const mediaType = result.media_type === 'tv' ? (lang === 'ar' ? 'مسلسل' : 'TV') : (lang === 'ar' ? 'فيلم' : 'Movie');
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 hover:bg-gilt/10 active:bg-gilt/15 transition-all duration-200 text-start group"
    >
      {/* Poster */}
      <div className="flex-shrink-0 w-14 h-20 bg-ink/50 rounded-lg overflow-hidden ring-1 ring-gilt/20 group-hover:ring-gilt/40 transition-all duration-200 group-hover:scale-[1.02]">
        {posterUrl ? (
          <img src={posterUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gilt/50 text-2xl">
            🎬
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-bone group-hover:text-gilt transition-colors truncate leading-snug">{title}</h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-dust flex-wrap">
          <span className="px-2 py-0.5 bg-gilt/15 text-gilt/95 rounded-md font-medium">{mediaType}</span>
          {year && <span className="text-dust/80">{year}</span>}
          {result.vote_average > 0 && (
            <span className="flex items-center gap-1 text-gilt/90">
              <Star className="size-3 fill-gilt/70" />
              <span className="font-medium">{result.vote_average.toFixed(1)}</span>
            </span>
          )}
        </div>
        {result.overview && (
          <p className="text-xs text-dust/75 line-clamp-2 mt-1.5 leading-relaxed">{result.overview}</p>
        )}
      </div>
    </button>
  );
}
