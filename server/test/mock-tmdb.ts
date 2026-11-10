import http from 'node:http';
import type { AddressInfo } from 'node:net';

const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const BOYS = {
  en: { name: 'The Boys', overview: 'A group of vigilantes set out to take down corrupt superheroes.', tagline: '', genres: [{ id: 1, name: 'Sci-Fi & Fantasy' }] },
  ar: { name: 'الأولاد', overview: 'مجموعة من المنتقمين تقاتل أبطالا خارقين فاسدين.', tagline: '', genres: [{ id: 1, name: 'خيال علمي' }] },
};
const EPS = {
  en: ['The Big Ride', 'Proper Preparation and Planning', 'We Gotta Go Now', 'Nothing Like It in the World'],
  ar: ['الرحلة الكبيرة', 'التحضير السليم', 'علينا أن نذهب الآن', 'لا شيء مثله في العالم'],
};

export interface MockTmdb {
  baseUrl: string;
  imageBase: string;
  calls: string[];
  close(): Promise<void>;
}

export async function startMockTmdb(): Promise<MockTmdb> {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    calls.push(url.pathname);
    const lang = url.searchParams.get('language')?.startsWith('ar') ? 'ar' : 'en';
    const json = (o: unknown, code = 200) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (url.searchParams.get('api_key') !== 'testkey' && !url.pathname.startsWith('/t/p/')) return json({ status_message: 'Invalid API key' }, 401);

    if (url.pathname.startsWith('/t/p/')) {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(PIXEL);
    }
    if (url.pathname === '/3/search/tv') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      return json({ results: q === 'the boys' ? [{ id: 76479, name: 'The Boys', original_name: 'The Boys', first_air_date: '2019-07-25', popularity: 200 }, { id: 1, name: 'The Boys (2006)', first_air_date: '2006-01-01' }] : [] });
    }
    if (url.pathname === '/3/search/movie') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      return json({ results: q === 'inception' ? [{ id: 27205, title: 'Inception', release_date: '2010-07-15', popularity: 90 }] : [] });
    }
    if (url.pathname === '/3/tv/76479') {
      return json({ id: 76479, ...BOYS[lang], poster_path: '/boys-poster.jpg', backdrop_path: '/boys-backdrop.jpg', first_air_date: '2019-07-25', vote_average: 8.4, status: 'Returning Series' });
    }
    if (url.pathname === '/3/tv/76479/season/2') {
      return json({
        season_number: 2,
        name: lang === 'ar' ? 'الموسم 2' : 'Season 2',
        episodes: EPS[lang].map((name, i) => ({ episode_number: i + 1, name, overview: `${name} overview`, air_date: '2020-09-04', runtime: 60, still_path: `/still-${i + 1}.jpg`, vote_average: 8 })),
      });
    }
    if (url.pathname === '/3/movie/27205') {
      return json({ id: 27205, title: lang === 'ar' ? 'البداية' : 'Inception', overview: 'Dreams within dreams.', genres: [{ id: 2, name: 'Action' }], poster_path: '/inc.jpg', backdrop_path: '/inc-b.jpg', release_date: '2010-07-15', runtime: 148, vote_average: 8.8 });
    }
    return json({ status_message: 'not found' }, 404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/3`,
    imageBase: `http://127.0.0.1:${port}/t/p`,
    calls,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
