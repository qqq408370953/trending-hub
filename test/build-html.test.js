import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildHTML, renderHTML } from '../scripts/build-html.js';

const fixture = {
  lastUpdated: '2026-09-07T08:00:00.000Z',
  categories: {
    downloads: {
      name: '下载热点',
      icon: '↧',
      description: '游戏、软件、App 与教程的下载意图词',
      items: [{
        rank: 1,
        title: '心动小镇怎么下载',
        searchUrl: 'https://www.baidu.com/s?wd=download',
        score: 225,
        growth: 125,
        trend: 'rising',
        source: ['百度联想 · 抖音热榜'],
        firstSeenAt: '2026-09-07T07:00:00.000Z',
        stale: false
      }]
    },
    perler: {
      name: '拼豆图纸',
      icon: '▦',
      description: '热门人物、动漫、游戏与节日的拼豆搜索词',
      items: [{
        rank: 1,
        title: '库洛米拼豆图纸',
        searchUrl: 'https://www.baidu.com/s?wd=perler',
        score: 100,
        growth: null,
        trend: 'new',
        source: ['百度联想'],
        firstSeenAt: '2026-09-07T08:00:00.000Z',
        stale: false
      }]
    }
  },
  sources: [{ name: '百度联想', ok: true, count: 2 }]
};

test('renders only the focused trend dashboard and its signal labels', () => {
  const html = renderHTML(fixture);

  assert.match(html, /跟风关键词雷达/);
  assert.match(html, /data-category="downloads"/);
  assert.match(html, /data-category="perler"/);
  assert.match(html, /信号环比 \+125%/);
  assert.match(html, /新上榜/);
  assert.match(html, /心动小镇怎么下载/);
  assert.match(html, /库洛米拼豆图纸/);
  assert.match(html, /百度联想 · 抖音热榜/);
  assert.doesNotMatch(html, /platform-card/);
  assert.doesNotMatch(html, /^[ \t]+$/m);
});

test('escapes keyword content and replaces dangerous links with search links', () => {
  const unsafe = structuredClone(fixture);
  unsafe.categories.downloads.items[0].title = '<img src=x onerror=alert(1)>下载教程';
  unsafe.categories.downloads.items[0].searchUrl = 'javascript:alert(1)';
  const html = renderHTML(unsafe);

  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;下载教程/);
  assert.match(html, /https:\/\/www\.baidu\.com\/s\?wd=/);
});

test('writes rendered output from a supplied data file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'trending-hub-'));
  const dataPath = path.join(directory, 'trending.json');
  const outputPath = path.join(directory, 'index.html');
  await fs.writeFile(dataPath, JSON.stringify(fixture), 'utf8');

  await buildHTML({ dataPath, outputPath });

  const html = await fs.readFile(outputPath, 'utf8');
  assert.match(html, /心动小镇怎么下载/);
  assert.match(html, /只看下载与拼豆图纸/);
});
