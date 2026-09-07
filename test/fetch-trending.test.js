import test from 'node:test';
import assert from 'node:assert/strict';

import { createTrendingSnapshot } from '../scripts/fetch-trending.js';

test('builds only focused categories and computes growth from prior signals', () => {
  const snapshot = createTrendingSnapshot({
    previous: {
      categories: {
        downloads: {
          items: [{
            rank: 1,
            title: '剪映 App 下载教程',
            score: 50,
            firstSeenAt: '2026-09-06T00:00:00.000Z',
            stale: false
          }]
        },
        perler: { items: [] }
      }
    },
    topics: [],
    suggestionResults: [{
      query: 'App 下载',
      seedKind: 'downloads',
      source: '百度联想',
      suggestions: ['剪映 App 下载教程', '今日娱乐热搜']
    }, {
      query: '拼豆图纸',
      seedKind: 'perler',
      source: '百度联想',
      suggestions: ['库洛米拼豆图纸']
    }],
    sourceStatus: [
      { name: '百度联想', ok: true },
      { name: '抖音热榜', ok: false }
    ],
    now: '2026-09-07T00:00:00.000Z'
  });

  assert.deepEqual(Object.keys(snapshot.categories), ['downloads', 'perler']);
  assert.equal(snapshot.lastUpdated, '2026-09-07T00:00:00.000Z');
  assert.equal(snapshot.categories.downloads.items.length, 1);
  assert.equal(snapshot.categories.downloads.items[0].title, '剪映 App 下载教程');
  assert.equal(snapshot.categories.downloads.items[0].growth, 100);
  assert.equal(snapshot.categories.perler.items[0].title, '库洛米拼豆图纸');
  assert.deepEqual(snapshot.sources, [
    { name: '百度联想', ok: true },
    { name: '抖音热榜', ok: false }
  ]);
});

test('keeps the prior category as stale when no current signal survives', () => {
  const previousPerler = {
    rank: 1,
    title: '旧角色拼豆图纸',
    searchUrl: 'https://www.baidu.com/s?wd=old',
    score: 80,
    growth: 20,
    trend: 'rising',
    source: ['百度联想'],
    firstSeenAt: '2026-09-05T00:00:00.000Z',
    stale: false
  };
  const snapshot = createTrendingSnapshot({
    previous: {
      categories: {
        downloads: { items: [] },
        perler: { items: [previousPerler] }
      }
    },
    topics: [],
    suggestionResults: [{
      query: '拼豆图纸',
      seedKind: 'perler',
      source: '百度联想',
      suggestions: ['普通新闻']
    }],
    sourceStatus: [],
    now: '2026-09-07T00:00:00.000Z'
  });

  assert.deepEqual(snapshot.categories.perler.items, [
    { ...previousPerler, stale: true }
  ]);
  assert.deepEqual(snapshot.categories.downloads.items, []);
});

test('drops unrelated expansion fallbacks and keywords carrying an older year', () => {
  const snapshot = createTrendingSnapshot({
    previous: { categories: {} },
    topics: [],
    suggestionResults: [{
      query: '某明星演唱会官宣 拼豆图纸',
      topicTitle: '某明星演唱会官宣',
      seedKind: 'perler',
      source: '百度联想 · 百度热搜',
      suggestions: ['2025年最火拼豆图纸', '某明星演唱会拼豆图纸']
    }],
    sourceStatus: [],
    now: '2026-09-07T00:00:00.000Z'
  });

  assert.deepEqual(
    snapshot.categories.perler.items.map((item) => item.title),
    ['某明星演唱会拼豆图纸']
  );
});
