import * as cheerio from 'cheerio';

import { normalizeTitle } from './trend-core.js';

function uniqueTopics(titles, source, maxItems = 30) {
  const seen = new Set();
  const topics = [];

  for (const rawTitle of titles) {
    const title = normalizeTitle(rawTitle);
    const key = title.toLocaleLowerCase('zh-CN');
    if (!title || seen.has(key)) continue;
    seen.add(key);
    topics.push({ title, source, rank: topics.length + 1 });
    if (topics.length >= maxItems) break;
  }

  return topics;
}

export function parseBaiduHot(html) {
  if (typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  let titles = $('.c-single-text-ellipsis')
    .map((_index, element) => $(element).text())
    .get();

  if (titles.length === 0) {
    titles = $('[class*="title"]')
      .map((_index, element) => $(element).text())
      .get();
  }

  return uniqueTopics(titles, '百度热搜');
}

export function parseBilibiliRanking(payload) {
  const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  return uniqueTopics(list.map((item) => item?.title), 'Bilibili 热门', 20);
}

export function parseDouyinHot(payload) {
  const list = Array.isArray(payload?.data?.word_list) ? payload.data.word_list : [];
  return uniqueTopics(
    list.map((item) => item?.word || item?.sentence_tag),
    '抖音热榜',
    30
  );
}

export function parseBaiduSuggestions(body) {
  if (typeof body !== 'string') return [];
  const start = body.indexOf('(');
  const end = body.lastIndexOf(')');
  if (start < 0 || end <= start) return [];

  try {
    const payload = JSON.parse(body.slice(start + 1, end));
    if (!Array.isArray(payload?.s)) return [];
    return [...new Set(payload.s.map(normalizeTitle).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function mapLimit(values, limit, worker) {
  const items = Array.from(values);
  if (items.length === 0) return [];

  const concurrency = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}
