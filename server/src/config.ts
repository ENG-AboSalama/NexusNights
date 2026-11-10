import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Repo root (works from both src/ via tsx and dist/ after tsc). */
export const ROOT = path.resolve(__dirname, '..', '..');

const bool = z
  .string()
  .transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase()));

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MEDIA_PATH: z.string().default('./media'),
  DATA_PATH: z.string().default('./data'),
  TMDB_API_KEY: z.string().optional(),
  TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
  TMDB_IMAGE_BASE: z.string().url().default('https://image.tmdb.org/t/p'),
  TMDB_LANGUAGES: z.string().default('en-US,ar'),
  TMDB_CACHE_DAYS: z.coerce.number().min(0).default(14),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  FFMPEG_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  HLS_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  HLS_CACHE_GB: z.coerce.number().min(1).default(20),
  CLIENT_DIST: z.string().default('./client/dist'),
  SCAN_ON_START: bool.default('true'),
  ADMIN_TOKEN: z.string().min(8).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ALLOW_GUEST: z.string().optional(),
  CONTROL_ROLE_IDS: z.string().default(''),
  DISCORD_API_BASE: z.string().url().default('https://discord.com/api'),
  DISCORD_CDN_BASE: z.string().url().default('https://cdn.discordapp.com'),
  STREAMING_PROVIDERS_ENABLED: bool.default('true'),
});

export interface Config {
  env: string;
  isProd: boolean;
  port: number;
  mediaDir: string;
  dataDir: string;
  cacheDir: string;
  overridesDir: string;
  metadataFile: string;
  indexFile: string;
  tmdb: {
    apiKey?: string;
    baseUrl: string;
    imageBase: string;
    languages: string[]; // e.g. ['en-US', 'ar']
    cacheDays: number;
  };
  ffmpeg: string;
  ffprobe: string;
  ffmpegConcurrency: number;
  hlsConcurrency: number;
  hlsCacheBytes: number;
  clientDir: string;
  scanOnStart: boolean;
  adminToken?: string;
  trustProxy: number;
  discord: { clientId?: string; clientSecret?: string; redirectUri?: string; apiBase: string; cdnBase: string };
  jwtSecret?: string;
  /** Browser testing without Discord (?room=...). Default: on in development, off in production. */
  allowGuest: boolean;
  /** Discord role ids whose holders may always control playback (needs guilds.members.read). */
  controlRoleIds: string[];
  progressFile: string;
  /** Custom multi-provider streaming integration */
  streaming: {
    enabled: boolean;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env, opts: { loadDotenv?: boolean } = {}): Config {
  if (opts.loadDotenv !== false) dotenv.config({ path: path.join(ROOT, '.env') });
  // Treat `KEY=` (empty) like "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(ROOT, e.DATA_PATH);
  return {
    env: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    port: e.PORT,
    mediaDir: path.resolve(ROOT, e.MEDIA_PATH),
    dataDir,
    cacheDir: path.join(dataDir, 'cache'),
    overridesDir: path.join(dataDir, 'overrides'),
    metadataFile: path.join(dataDir, 'metadata.json'),
    indexFile: path.join(dataDir, 'library.json'),
    tmdb: {
      apiKey: e.TMDB_API_KEY,
      baseUrl: e.TMDB_BASE_URL.replace(/\/$/, ''),
      imageBase: e.TMDB_IMAGE_BASE.replace(/\/$/, ''),
      languages: e.TMDB_LANGUAGES.split(',').map((s) => s.trim()).filter(Boolean),
      cacheDays: e.TMDB_CACHE_DAYS,
    },
    ffmpeg: e.FFMPEG_PATH,
    ffprobe: e.FFPROBE_PATH,
    ffmpegConcurrency: e.FFMPEG_CONCURRENCY,
    hlsConcurrency: e.HLS_CONCURRENCY,
    hlsCacheBytes: Math.round(e.HLS_CACHE_GB * 1024 ** 3),
    clientDir: path.resolve(ROOT, e.CLIENT_DIST),
    scanOnStart: e.SCAN_ON_START,
    allowGuest: e.ALLOW_GUEST !== undefined ? ['true', '1', 'yes'].includes(e.ALLOW_GUEST.toLowerCase()) : e.NODE_ENV !== 'production',
    controlRoleIds: e.CONTROL_ROLE_IDS.split(',').map((x) => x.trim()).filter((x) => /^\d{15,25}$/.test(x)),
    progressFile: path.join(dataDir, 'progress.json'),
    adminToken: e.ADMIN_TOKEN,
    trustProxy: e.TRUST_PROXY,
    discord: { 
      clientId: e.DISCORD_CLIENT_ID, 
      clientSecret: e.DISCORD_CLIENT_SECRET, 
      redirectUri: e.DISCORD_REDIRECT_URI,
      apiBase: e.DISCORD_API_BASE.replace(/\/$/, ''), 
      cdnBase: e.DISCORD_CDN_BASE.replace(/\/$/, '') 
    },
    jwtSecret: e.JWT_SECRET,
    streaming: {
      enabled: e.STREAMING_PROVIDERS_ENABLED,
    },
  };
}

/** 'en-US' → 'en', 'ar' → 'ar' (the key used in the UI and in Localized<T>). */
export const langKey = (tmdbLang: string): string => tmdbLang.split(/[-_]/)[0].toLowerCase();
