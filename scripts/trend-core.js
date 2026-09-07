const DOWNLOAD_INTENT = /(下载|怎么下载|在哪(?:里)?下载|下载教程|安装教程)/i;
const DOWNLOAD_CONTEXT = /(游戏|软件|app|应用|工具|教程|客户端|模拟器|插件)/i;
const PERLER_INTENT = /(拼豆|拼豆图纸|豆豆图纸|像素拼豆)/i;
const BLOCKED = /(破解|盗版|外挂|激活码|注册码|网盘|百度盘|夸克盘|磁力|torrent)/i;
const GENERIC_DOWNLOAD = /^(?:游戏|软件|app|应用)?\s*下载(?:软件|平台|商店|应用|免费)?$|^下载教程(?:视频|来了)?$/i;
const TOPIC_STOP_WORDS = /(拼豆图纸|豆豆图纸|像素拼豆|拼豆|在哪里下载|在哪下载|怎么下载|下载教程|安装教程|下载|最新|热门|教程|图纸|游戏|软件|更新|发布|上线|官宣|怎么|哪里)/gi;
const GENERIC_SUBJECT_WORDS = /(拼豆图纸|豆豆图纸|像素拼豆|拼豆|在哪里下载|在哪下载|怎么下载|下载教程|安装教程|下载|游戏|软件|app|应用|工具|教程|客户端|模拟器|插件|热门|角色|大全|网站|平台|商店|免费|推荐|中心|官方|新版|最新|视频|链接|怎么玩|玩法|图片|图案|带色号|色号|安卓版|手机版|电脑版|pc版|安装)/gi;

export function normalizeTitle(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, 100)
    : '';
}

export function classifyKeyword(title, { seedKind } = {}) {
  const value = normalizeTitle(title);
  if (!value || BLOCKED.test(value) || GENERIC_DOWNLOAD.test(value)) return null;
  if (PERLER_INTENT.test(value) && hasSpecificSubject(value)) return 'perler';
  if (
    DOWNLOAD_INTENT.test(value)
    && (seedKind === 'downloads' || DOWNLOAD_CONTEXT.test(value))
    && hasSpecificSubject(value)
  ) {
    return 'downloads';
  }
  return null;
}

function hasSpecificSubject(value) {
  const subject = normalizeTitle(value)
    .replace(GENERIC_SUBJECT_WORDS, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return subject.length >= 2 && /\p{L}/u.test(subject);
}

function topicFingerprint(value) {
  return normalizeTitle(value)
    .toLocaleLowerCase('zh-CN')
    .replace(TOPIC_STOP_WORDS, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function isSuggestionRelevantToTopic(topicTitle, suggestionTitle) {
  const topic = topicFingerprint(topicTitle);
  const suggestion = topicFingerprint(suggestionTitle);
  if (topic.length < 2 || suggestion.length < 2) return false;

  for (let length = Math.min(topic.length, suggestion.length); length >= 2; length -= 1) {
    for (let start = 0; start <= topic.length - length; start += 1) {
      if (suggestion.includes(topic.slice(start, start + length))) return true;
    }
  }
  return false;
}

export function safeSearchUrl(value, fallbackQuery) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
  } catch {}

  return `https://www.baidu.com/s?wd=${encodeURIComponent(normalizeTitle(fallbackQuery))}`;
}

function suggestionScore(rank) {
  const normalizedRank = Number.isFinite(Number(rank)) ? Number(rank) : 10;
  return Math.max(1, 11 - normalizedRank) * 10;
}

function hotScore(rank) {
  if (!Number.isFinite(Number(rank))) return 0;
  return Math.max(0, 23 - Number(rank));
}

function growthState(score, previousScore) {
  if (!Number.isFinite(previousScore) || previousScore <= 0) {
    return { growth: null, trend: 'new' };
  }

  const growth = Math.round(((score - previousScore) / previousScore) * 100);
  if (growth > 0) return { growth, trend: 'rising' };
  if (growth < 0) return { growth, trend: 'falling' };
  return { growth: 0, trend: 'steady' };
}

export function buildRankedItems(signals, previousItems = [], now, limit = 30) {
  const previousByTitle = new Map(
    previousItems.map((item) => [normalizeTitle(item.title).toLocaleLowerCase('zh-CN'), item])
  );
  const merged = new Map();

  for (const signal of signals) {
    const title = normalizeTitle(signal?.title);
    if (!classifyKeyword(title, { seedKind: signal?.seedKind })) continue;

    const key = title.toLocaleLowerCase('zh-CN');
    const entry = merged.get(key) || {
      title,
      score: 0,
      bestSuggestionRank: Number.POSITIVE_INFINITY,
      sources: new Set(),
      searchUrl: ''
    };
    const rank = Number(signal.suggestionRank);

    entry.score += suggestionScore(rank) + hotScore(signal.directHotRank);
    entry.bestSuggestionRank = Math.min(
      entry.bestSuggestionRank,
      Number.isFinite(rank) ? rank : Number.POSITIVE_INFINITY
    );
    if (normalizeTitle(signal.source)) entry.sources.add(normalizeTitle(signal.source));
    if (!entry.searchUrl && signal.searchUrl) entry.searchUrl = signal.searchUrl;
    merged.set(key, entry);
  }

  return [...merged.entries()]
    .map(([key, entry]) => {
      const previous = previousByTitle.get(key);
      const state = growthState(entry.score, Number(previous?.score));
      return {
        title: entry.title,
        searchUrl: safeSearchUrl(entry.searchUrl, entry.title),
        score: entry.score,
        growth: state.growth,
        trend: state.trend,
        source: [...entry.sources],
        firstSeenAt: previous?.firstSeenAt || now,
        stale: false,
        bestSuggestionRank: entry.bestSuggestionRank
      };
    })
    .sort((a, b) => (
      b.score - a.score
      || a.bestSuggestionRank - b.bestSuggestionRank
      || a.title.localeCompare(b.title, 'zh-CN')
    ))
    .slice(0, limit)
    .map(({ bestSuggestionRank: _bestSuggestionRank, ...item }, index) => ({
      rank: index + 1,
      ...item
    }));
}

export function withStaleFallback(currentItems, previousItems = []) {
  if (currentItems.length > 0) return currentItems;
  return previousItems.map((item) => ({ ...item, stale: true }));
}
