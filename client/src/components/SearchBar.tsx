/**
 * Global Search Bar
 * 
 * Searches TMDB catalog with debouncing and keyboard navigation
 */

import { useState, useEffect, useRef } from 'react';
import { u } from '../api';
import { useI18n } from '../i18n';
import { go } from '../router';
import { tmdbArtworkUrl } from '../util/tmdb-artwork';
import { Search, Spinner, Star, X } from './Icons';

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

interface SearchBarProps {
  autoFocus?: boolean;
  onClose?: () => void;
  className?: string;
}

export function SearchBar({ autoFocus = false, onClose, className = '' }: SearchBarProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus if requested
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Global '/' shortcut to focus search
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Click outside to close results
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
      setSelectedIndex(-1);
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
        fetch(u(`/api/tmdb/search/tv?query=${encodeURIComponent(searchQuery)}`)),
      ]);

      const [moviesData, tvData] = await Promise.all([
        moviesRes.json() as Promise<SearchResponse>,
        tvRes.json() as Promise<SearchResponse>,
      ]);

      // Combine and sort by popularity/rating
      const combined: SearchResult[] = [
        ...moviesData.results.map((r) => ({ ...r, media_type: 'movie' as const })),
        ...tvData.results.map((r) => ({ ...r, media_type: 'tv' as const })),
      ];
      combined.sort((a, b) => b.vote_average - a.vote_average);

      setResults(combined.slice(0, 8)); // Top 8 results
      setSelectedIndex(-1);
      setShowResults(true);
      setLoading(false);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
      setLoading(false);
    }
  }

  function handleResultClick(result: SearchResult) {
    const kind = result.media_type === 'tv' ? 'series' : 'movie';
    go.globalTitle(kind, result.id);
    setShowResults(false);
    setQuery('');
    onClose?.();
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showResults || results.length === 0) {
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        onClose?.();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        handleResultClick(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowResults(false);
      inputRef.current?.blur();
      onClose?.();
    }
  }

  return (
    <div ref={searchRef} className={`relative w-full ${className}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="relative group">
        <div className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 flex items-center text-dust/60 transition-colors group-focus-within:text-gilt">
          <Search className="size-4" aria-hidden="true" />
        </div>

        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="w-full h-9 ps-10 pe-16 bg-white/[0.04] border border-white/10 rounded-full text-sm text-bone placeholder:text-dust/60 transition-all duration-300 focus:outline-none focus:border-gilt/50 focus:bg-white/[0.06] hover:border-white/15"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="absolute end-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {loading && <Spinner className="size-4 text-gilt" aria-hidden="true" />}
          {query && !loading && (
            <button
              onClick={clearSearch}
              className="p-1 rounded-full text-dust/70 hover:text-bone hover:bg-white/10 transition-colors"
              aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
          {!query && (
            <kbd className="pointer-events-none hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-dust/50 bg-white/[0.06] border border-white/10 rounded">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Results Dropdown */}
      {showResults && results.length > 0 && (
        <div
          className="absolute top-full mt-2 w-full bg-coal/98 backdrop-blur-2xl border border-gilt/20 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.9),0_0_24px_rgba(212,175,106,0.12)] overflow-hidden z-50 divide-y divide-white/[0.04]"
          role="listbox"
          aria-label={t('searchResults')}
        >
          <div className="max-h-[min(65vh,480px)] overflow-y-auto scrollbar-thin divide-y divide-white/[0.03]">
            {results.map((result, idx) => (
              <SearchResultItem
                key={result.id}
                result={result}
                selected={idx === selectedIndex}
                onClick={() => handleResultClick(result)}
              />
            ))}
          </div>

          <div className="px-4 py-2 bg-gilt/[0.03] text-xs text-dust/70 flex items-center justify-between font-mono" role="status">
            <span>{results.length} {t('searchResults')}</span>
            <span className="hidden sm:inline text-[11px] text-dust/50">
              {lang === 'ar' ? 'استخدم الأسهم للتنقل و Enter للاختيار' : 'Use ↑↓ to navigate, Enter to select'}
            </span>
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

function SearchResultItem({
  result,
  selected,
  onClick,
}: {
  result: SearchResult;
  selected: boolean;
  onClick: () => void;
}) {
  const { lang } = useI18n();
  const title = result.title || result.name || '';
  const year = result.release_date?.substring(0, 4) || result.first_air_date?.substring(0, 4);
  const posterUrl = tmdbArtworkUrl('poster', result.poster_path);
  const isTv = result.media_type === 'tv';
  const mediaType = isTv ? (lang === 'ar' ? 'مسلسل' : 'TV') : (lang === 'ar' ? 'فيلم' : 'Movie');

  return (
    <button
      onClick={onClick}
      role="option"
      aria-selected={selected}
      className={`w-full flex items-start gap-3.5 p-3 text-start transition-all duration-200 group ${
        selected ? 'bg-gilt/15 text-bone' : 'hover:bg-white/[0.05] active:bg-gilt/10'
      }`}
    >
      {/* Poster */}
      <div className="flex-shrink-0 w-12 h-16 bg-crypt/80 rounded-md overflow-hidden ring-1 ring-white/10 group-hover:ring-gilt/40 transition-all duration-200 group-hover:scale-[1.03]">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gilt/40 text-xl bg-ink/60">
            🎬
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-bone group-hover:text-gilt transition-colors truncate leading-tight">
          {title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-dust flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase ${
              isTv
                ? 'bg-sky-500/15 border border-sky-500/25 text-sky-300'
                : 'bg-blood/15 border border-blood/25 text-blood-hot'
            }`}
          >
            {mediaType}
          </span>
          {year && <span className="text-dust/70 font-mono text-[11px]">{year}</span>}
          {result.vote_average > 0 && (
            <span className="flex items-center gap-1 text-gilt font-mono text-[11px]">
              <Star className="size-3 fill-gilt" />
              <span>{result.vote_average.toFixed(1)}</span>
            </span>
          )}
        </div>
        {result.overview && (
          <p className="text-xs text-dust/60 line-clamp-1 mt-1 leading-relaxed">
            {result.overview}
          </p>
        )}
      </div>
    </button>
  );
}
