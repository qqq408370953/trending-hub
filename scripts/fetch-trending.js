import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  buildRankedItems,
  classifyKeyword,
  normalizeTitle,
  withStaleFallback
} from './trend-core.js';
import {
  mapLimit,
  parseBaiduHot,
  parseBaiduSuggestions,
  parseBilibiliRanking,
  parseDouyinHot
} from './trend-sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'trending.json');

const HEADERS = {
  'User-Agent': 'TrendingHub/2.0 (+https://github.com/qqq408370953/trending-hub)',
  Accept: 'text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

const FIXED_QUERIES = [
  ['游戏下载', 'downloads'],
  ['软件下载', 'downloads'],
  ['App 下载', 'downloads'],
  ['下载教程', 'downloads'],
  ['在哪里下载', 'downloads'],
  ['拼豆图纸', 'perler'],
  ['热门拼豆', 'perler'],
  ['角色拼豆', 'perler'],
  ['游戏拼豆', 'perler']
];

async function fetchWithTimeout(url, responseType = 'json') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return responseType === 'text' ? response.text() : response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function priorItems(previous, category) {
  const items = previous?.categories?.[category]?.items;
  return Array.isArray(items) ? items : [];
}

function directTopicSignals(topics) {
  return topics.flatMap((topic) => {
    const category = classifyKeyword(topic.title);
    if (!category) return [];
    return [{
      title: topic.title,
      source: topic.source,
      suggestionRank: 10,
      directHotRank: topic.rank,
      seedKind: category
    }];
  });
}

export function createTrendingSnapshot({
  previous = {},
  topics = [],
  suggestionResults = [],
  sourceStatus = [],
  now = new Date().toISOString()
}) {
  const signals = directTopicSignals(topics);

  for (const result of suggestionResults) {
    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
    suggestions.forEach((title, index) => {
      if (!classifyKeyword(title, { seedKind: result.seedKind })) return;
      signals.push({
        title,
        source: result.source,
        suggestionRank: index + 1,
        directHotRank: result.directHotRank,
        seedKind: result.seedKind,
        searchUrl: `https://www.baidu.com/s?wd=${encodeURIComponent(normalizeTitle(title))}`
      });
    });
  }

  const downloadSignals = signals.filter((signal) => (
    classifyKeyword(signal.title, { seedKind: signal.seedKind }) === 'downloads'
  ));
  const perlerSignals = signals.filter((signal) => (
    classifyKeyword(signal.title, { seedKind: signal.seedKind }) === 'perler'
  ));
  const previousDownloads = priorItems(previous, 'downloads');
  const previousPerler = priorItems(previous, 'perler');

  return {
    lastUpdated: now,
    categories: {
      downloads: {
        name: '下载热点',
        icon: '↧',
        description: '游戏、软件、App 与教程的下载意图词',
        items: withStaleFallback(
          buildRankedItems(downloadSignals, previousDownloads, now),
          previousDownloads
        )
      },
      perler: {
        name: '拼豆图纸',
        icon: '▦',
        description: '热门人物、动漫、游戏与节日的拼豆搜索词',
        items: withStaleFallback(
          buildRankedItems(perlerSignals, previousPerler, now),
          previousPerler
        )
      }
    },
    sources: sourceStatus
  };
}

async function getHotTopics() {
  const requests = [
    {
      name: '抖音热榜',
      load: async () => parseDouyinHot(await fetchWithTimeout(
        'https://www.douyin.com/aweme/v1/web/hot/search/list/'
      ))
    },
    {
      name: '百度热搜',
      load: async () => parseBaiduHot(await fetchWithTimeout(
        'https://top.baidu.com/board?tab=realtime',
        'text'
      ))
    },
    {
      name: 'Bilibili 热门',
      load: async () => parseBilibiliRanking(await fetchWithTimeout(
        'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all'
      ))
    }
  ];
  const settled = await Promise.allSettled(requests.map((request) => request.load()));
  const status = [];
  const topics = [];

  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === 'fulfilled') {
      topics.push(...result.value);
      status.push({ name: request.name, ok: true, count: result.value.length });
    } else {
      console.error(`${request.name} unavailable: ${result.reason?.message || 'unknown error'}`);
      status.push({ name: request.name, ok: false, count: 0 });
    }
  });

  return { topics, status };
}

function uniqueTopTopics(topics, limit = 15) {
  const bestByTitle = new Map();

  for (const topic of topics) {
    const title = normalizeTitle(topic.title);
    if (!title || title.length > 60) continue;
    const key = title.toLocaleLowerCase('zh-CN');
    const existing = bestByTitle.get(key);
    if (!existing || topic.rank < existing.rank) bestByTitle.set(key, { ...topic, title });
  }

  return [...bestByTitle.values()]
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, limit);
}

function buildSuggestionQueries(topics) {
  const fixed = FIXED_QUERIES.map(([query, seedKind]) => ({
    query,
    seedKind,
    source: '百度联想'
  }));
  const expanded = uniqueTopTopics(topics).flatMap((topic) => [
    {
      query: `${topic.title} 下载`,
      seedKind: 'downloads',
      source: `百度联想 · ${topic.source}`,
      directHotRank: topic.rank
    },
    {
      query: `${topic.title} 下载教程`,
      seedKind: 'downloads',
      source: `百度联想 · ${topic.source}`,
      directHotRank: topic.rank
    },
    {
      query: `${topic.title} 拼豆图纸`,
      seedKind: 'perler',
      source: `百度联想 · ${topic.source}`,
      directHotRank: topic.rank
    }
  ]);
  return [...fixed, ...expanded];
}

async function getSuggestions(topics) {
  const queries = buildSuggestionQueries(topics);
  let succeeded = 0;
  const results = await mapLimit(queries, 5, async (query) => {
    const url = `https://suggestion.baidu.com/su?wd=${encodeURIComponent(query.query)}&cb=window.baidu.sug`;
    try {
      const body = await fetchWithTimeout(url, 'text');
      succeeded += 1;
      return { ...query, suggestions: parseBaiduSuggestions(body) };
    } catch (error) {
      console.error(`百度联想 unavailable for query "${query.query}": ${error.message}`);
      return { ...query, suggestions: [] };
    }
  });

  return {
    results,
    status: {
      name: '百度联想',
      ok: succeeded > 0,
      count: results.reduce((total, result) => total + result.suggestions.length, 0)
    }
  };
}

async function readPrevious(dataPath) {
  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.categories ? parsed : { categories: {} };
  } catch {
    return { categories: {} };
  }
}

async function writeSnapshot(dataPath, snapshot) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, dataPath);
}

export async function main({ dataPath = DATA_PATH } = {}) {
  const now = new Date().toISOString();
  console.log(`Fetching focused trend signals at ${now}`);

  const previous = await readPrevious(dataPath);
  const hot = await getHotTopics();
  const suggestions = await getSuggestions(hot.topics);
  const snapshot = createTrendingSnapshot({
    previous,
    topics: hot.topics,
    suggestionResults: suggestions.results,
    sourceStatus: [...hot.status, suggestions.status],
    now
  });

  await writeSnapshot(dataPath, snapshot);
  for (const category of Object.values(snapshot.categories)) {
    const stale = category.items.some((item) => item.stale) ? ' (stale fallback)' : '';
    console.log(`${category.name}: ${category.items.length}${stale}`);
  }
  console.log(`Saved ${dataPath}`);
  return snapshot;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
