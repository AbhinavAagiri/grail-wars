import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { LIMITS, type SearchCandidate } from '@hgd/shared';
import { generatedAvatar, onPortraitError } from '../lib/avatar';
import { useStore } from '../store';

const PROVIDER_LABEL: Record<string, string> = {
  anilist: 'AniList',
  vsb: 'VS Battles',
  wikipedia: 'Wikipedia',
  fandom: 'Fandom',
  tmdb: 'TMDB',
  custom: 'Custom',
  fallback: 'Offline list',
};

export function CharacterSearch({
  placeholder,
  onSelect,
  onCustom,
  disabled,
}: {
  placeholder?: string;
  onSelect: (candidate: SearchCandidate) => void;
  onCustom: (name: string) => void;
  disabled?: boolean;
}) {
  const search = useStore((s) => s.search);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await search(trimmed);
      setResults(found);
      setLoading(false);
      setHighlight(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const choose = (candidate: SearchCandidate) => {
    onSelect(candidate);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const rows = results.slice(0, 8);
  const trimmed = query.trim();
  const showCustomRow = trimmed.length >= 2 && !rows.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <input
        className="hgd-input !text-[13px]"
        placeholder={placeholder ?? 'Search any character…'}
        value={query}
        disabled={disabled}
        maxLength={LIMITS.CHARACTER_NAME_MAX}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          const total = rows.length + (showCustomRow ? 1 : 0);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(total - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter' && total > 0) {
            e.preventDefault();
            if (highlight < rows.length) choose(rows[highlight]);
            else if (showCustomRow) {
              onCustom(trimmed);
              setQuery('');
              setOpen(false);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        aria-label="Search for a character"
        autoComplete="off"
      />

      {open && (rows.length > 0 || showCustomRow || loading) && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-glow">
          {loading && rows.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-muted">Searching the Throne of Heroes…</div>
          )}
          {rows.map((candidate, i) => (
            <button
              key={candidate.key}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(candidate)}
              className={clsx(
                'flex w-full items-center gap-2 px-2 py-2 text-left transition-colors',
                highlight === i ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <img
                src={candidate.thumb || generatedAvatar(candidate.name)}
                alt=""
                loading="lazy"
                onError={onPortraitError(candidate.name)}
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{candidate.name}</span>
                <span className="block truncate text-[11px] text-muted">{candidate.source}</span>
              </span>
              <span className="shrink-0 rounded bg-surface px-1.5 py-[2px] text-[10px] uppercase tracking-wide text-muted">
                {PROVIDER_LABEL[candidate.provider] ?? candidate.provider}
              </span>
            </button>
          ))}
          {showCustomRow && (
            <button
              type="button"
              onMouseEnter={() => setHighlight(rows.length)}
              onClick={() => {
                onCustom(trimmed);
                setQuery('');
                setOpen(false);
              }}
              className={clsx(
                'w-full border-t border-border px-3 py-2 text-left text-[12px]',
                highlight === rows.length ? 'bg-surface-2 text-gold' : 'text-muted hover:bg-surface-2',
              )}
            >
              Use exactly what I typed: <span className="text-gold">“{trimmed}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
