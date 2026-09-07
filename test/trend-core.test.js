import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTitle,
  classifyKeyword,
  safeSearchUrl,
  buildRankedItems,
  withStaleFallback
} from '../scripts/trend-core.js';

test('classifies only the two requested keyword families', () => {
  assert.equal(classifyKeyword('心动小镇在哪里下载', { seedKind: 'downloads' }), 'downloads');
  assert.equal(classifyKeyword('马里奥拼豆图纸', { seedKind: 'perler' }), 'perler');
  assert.equal(classifyKeyword('今日娱乐热搜'), null);
});

test('download terms require relevant context and reject unsafe resource intent', () => {
  assert.equal(classifyKeyword('会议文件下载'), null);
  assert.equal(classifyKeyword('某游戏破解下载', { seedKind: 'downloads' }), null);
  assert.equal(classifyKeyword('某软件网盘下载', { seedKind: 'downloads' }), null);
  assert.equal(classifyKeyword('剪辑软件安装教程', { seedKind: 'downloads' }), 'downloads');
});

test('normalizes whitespace without changing the user keyword', () => {
  assert.equal(normalizeTitle('  星露谷   下载教程  '), '星露谷 下载教程');
});

test('accepts only HTTP search URLs and falls back to a Baidu search', () => {
  assert.equal(
    safeSearchUrl('javascript:alert(1)', '拼豆图纸'),
    'https://www.baidu.com/s?wd=%E6%8B%BC%E8%B1%86%E5%9B%BE%E7%BA%B8'
  );
  assert.equal(
    safeSearchUrl('https://example.com/search?q=x', 'x'),
    'https://example.com/search?q=x'
  );
});

test('merges duplicate signals and calculates growth from the previous score', () => {
  const items = buildRankedItems([
    {
      title: '星露谷怎么下载',
      source: '百度联想',
      suggestionRank: 2,
      seedKind: 'downloads'
    },
    {
      title: '星露谷怎么下载',
      source: '抖音热榜扩展',
      suggestionRank: 4,
      directHotRank: 3,
      seedKind: 'downloads'
    }
  ], [{
    title: '星露谷怎么下载',
    score: 100,
    firstSeenAt: '2026-09-06T00:00:00.000Z'
  }], '2026-09-07T00:00:00.000Z');

  assert.equal(items.length, 1);
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].score, 180);
  assert.equal(items[0].firstSeenAt, '2026-09-06T00:00:00.000Z');
  assert.equal(items[0].trend, 'rising');
  assert.equal(items[0].growth, 80);
  assert.deepEqual(items[0].source, ['百度联想', '抖音热榜扩展']);
});

test('marks unseen terms new and returns only the requested limit', () => {
  const signals = Array.from({ length: 35 }, (_, index) => ({
    title: `工具${index}下载教程`,
    source: '百度联想',
    suggestionRank: index + 1,
    seedKind: 'downloads'
  }));
  const items = buildRankedItems(signals, [], '2026-09-07T00:00:00.000Z', 30);

  assert.equal(items.length, 30);
  assert.equal(items[0].trend, 'new');
  assert.equal(items[0].growth, null);
});

test('uses previous category items as explicitly stale fallback', () => {
  const previous = [{ rank: 1, title: '旧词下载教程', stale: false }];
  assert.deepEqual(withStaleFallback([], previous), [
    { rank: 1, title: '旧词下载教程', stale: true }
  ]);
  assert.deepEqual(
    withStaleFallback([{ rank: 1, title: '新词下载教程' }], previous),
    [{ rank: 1, title: '新词下载教程' }]
  );
});
