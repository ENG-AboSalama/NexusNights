import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEpisodeInfo, parseSeasonFromName, parseTitle, normalizeKey } from '../src/library/parse';

const ep = (name: string) => {
  const i = parseEpisodeInfo(name);
  return [i.season, i.episode, i.episodeEnd];
};

test('S02E03 variants', () => {
  assert.deepEqual(ep('The.Boys.S02E03.1080p.WEB-DL.x264'), [2, 3, undefined]);
  assert.deepEqual(ep('the boys s02e03'), [2, 3, undefined]);
  assert.deepEqual(ep('Show S02 E03 - Title'), [2, 3, undefined]);
  assert.deepEqual(ep('Show.S01E05E06.720p'), [1, 5, 6]);
  assert.deepEqual(ep('Show.S01E05-E06'), [1, 5, 6]);
  assert.deepEqual(ep('Show.S01E05-06'), [1, 5, 6]);
});

test('2x03 and resolution is not an episode', () => {
  assert.deepEqual(ep('the boys 2x03 - Something'), [2, 3, undefined]);
  assert.equal(parseEpisodeInfo('Movie 1920x1080').episode, undefined);
  assert.equal(parseEpisodeInfo('Movie.x264.1080p').via, 'none');
});

test('word forms (EN + AR)', () => {
  assert.deepEqual(ep('Season 2 Episode 3'), [2, 3, undefined]);
  assert.deepEqual(ep('season.2.ep.3'), [2, 3, undefined]);
  assert.deepEqual(ep('Episode 3'), [undefined, 3, undefined]);
  assert.deepEqual(ep('EP03'), [undefined, 3, undefined]);
  assert.deepEqual(ep('الموسم 2 الحلقة 3'), [2, 3, undefined]);
  assert.deepEqual(ep('الحلقة 12'), [undefined, 12, undefined]);
});

test('leading / trailing numbers', () => {
  assert.deepEqual(ep('04'), [undefined, 4, undefined]);
  assert.deepEqual(ep('03 - Some Title'), [undefined, 3, undefined]);
  assert.deepEqual(ep('Some Show 07'), [undefined, 7, undefined]);
  assert.equal(parseEpisodeInfo('random words').via, 'none');
});

test('title hint extraction', () => {
  assert.equal(parseEpisodeInfo('the boys 2x02 - Nothing Like It In the World').titleHint, 'Nothing Like It In the World');
  assert.equal(parseEpisodeInfo('The.Boys.S02E01.1080p.WEB-DL.x264').titleHint, undefined);
  assert.equal(parseEpisodeInfo('Show.S01E02.Pilot.720p.HDTV').titleHint, 'Pilot');
});

test('season from folder names', () => {
  assert.equal(parseSeasonFromName('s02'), 2);
  assert.equal(parseSeasonFromName('Season 2'), 2);
  assert.equal(parseSeasonFromName('Season.02'), 2);
  assert.equal(parseSeasonFromName('The Boys S02'), 2);
  assert.equal(parseSeasonFromName('الموسم 3'), 3);
  assert.equal(parseSeasonFromName('Specials'), 0);
  assert.equal(parseSeasonFromName('the-boys'), undefined);
  assert.equal(parseSeasonFromName('Lost (2004)'), undefined);
});

test('title + year', () => {
  assert.deepEqual(parseTitle('the-boys'), { title: 'The Boys', year: undefined });
  assert.deepEqual(parseTitle('Inception.2010.1080p.BluRay.x264'), { title: 'Inception', year: 2010 });
  assert.deepEqual(parseTitle('Inception (2010)'), { title: 'Inception', year: 2010 });
  assert.deepEqual(parseTitle('Blade Runner 2049 (2017)'), { title: 'Blade Runner 2049', year: 2017 });
  assert.deepEqual(parseTitle('2012 (2009)'), { title: '2012', year: 2009 });
  assert.equal(parseTitle('The.Boys.S02.1080p').title, 'The Boys');
  assert.equal(parseTitle('Spider-Man.2002.720p').title, 'Spider-Man');
});

test('normalizeKey collides slugs and names', () => {
  assert.equal(normalizeKey('the-boys'), normalizeKey('The Boys'));
  assert.equal(normalizeKey('THE.BOYS'), normalizeKey('the_boys'));
});
