import type { Config } from '../config';
import type { IndexFile, MediaItem, Title } from '../types';
import { readJson, writeJsonAtomic } from '../util/fsx';

/** In-memory view of data/library.json with the lookups the API needs. */
export class LibraryStore {
  scannedAt: string | null = null;
  titles = new Map<string, Title>();
  media = new Map<string, MediaItem>();
  private byTitle = new Map<string, MediaItem[]>();

  constructor(private cfg: Config) {}

  async load(): Promise<void> {
    const idx = await readJson<IndexFile>(this.cfg.indexFile);
    if (idx?.version === 1) this.replace(idx.titles, idx.media, idx.scannedAt);
  }

  replace(titles: Title[], media: MediaItem[], scannedAt: string | null = this.scannedAt): void {
    this.titles = new Map(titles.map((t) => [t.id, t]));
    this.media = new Map(media.map((m) => [m.id, m]));
    this.scannedAt = scannedAt;
    this.byTitle = new Map();
    for (const m of media) {
      const list = this.byTitle.get(m.titleId) ?? [];
      list.push(m);
      this.byTitle.set(m.titleId, list);
    }
    for (const list of this.byTitle.values()) {
      list.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    }
  }

  itemsOf(titleId: string): MediaItem[] {
    return this.byTitle.get(titleId) ?? [];
  }

  async save(): Promise<void> {
    const idx: IndexFile = {
      version: 1,
      scannedAt: this.scannedAt,
      titles: [...this.titles.values()],
      media: [...this.media.values()],
    };
    await writeJsonAtomic(this.cfg.indexFile, idx);
  }
}
