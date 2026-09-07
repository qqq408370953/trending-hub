import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { safeSearchUrl } from './trend-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = path.join(__dirname, '..', 'data', 'trending.json');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'public', 'index.html');
const CATEGORY_KEYS = ['downloads', 'perler'];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  });
}

function trendPresentation(item) {
  if (item.trend === 'new' || item.growth === null) {
    return { className: 'new', label: '新上榜' };
  }
  if (item.trend === 'rising' || Number(item.growth) > 0) {
    return { className: 'rising', label: `信号环比 +${Math.abs(Number(item.growth))}%` };
  }
  if (item.trend === 'falling' || Number(item.growth) < 0) {
    return { className: 'falling', label: `信号环比 -${Math.abs(Number(item.growth))}%` };
  }
  return { className: 'steady', label: '信号持平' };
}

function renderItem(item) {
  const trend = trendPresentation(item);
  const title = escapeHtml(item.title);
  const url = escapeHtml(safeSearchUrl(item.searchUrl, item.title));
  const sources = Array.isArray(item.source) ? item.source : [item.source].filter(Boolean);
  const staleLabel = item.stale ? '<span class="stale-tag">沿用上次数据</span>' : '';

  return `
          <li class="trend-row">
            <span class="rank ${Number(item.rank) <= 3 ? 'top' : ''}">${escapeHtml(item.rank)}</span>
            <div class="trend-main">
              <a class="keyword" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
              <div class="meta">
                <span>${escapeHtml(sources.join(' · ') || '公开信号')}</span>
                <span>发现于 ${escapeHtml(formatDate(item.firstSeenAt))}</span>
                <span>信号分 ${escapeHtml(item.score)}</span>
                ${staleLabel}
              </div>
            </div>
            <span class="trend-badge ${trend.className}">${escapeHtml(trend.label)}</span>
          </li>`;
}

function renderCategory(key, category) {
  const items = Array.isArray(category?.items) ? category.items : [];
  const hasStale = items.some((item) => item.stale);
  const defaultNames = key === 'downloads'
    ? { name: '下载热点', icon: '↧', description: '游戏、软件、App 与教程的下载意图词' }
    : { name: '拼豆图纸', icon: '▦', description: '热门人物、动漫、游戏与节日的拼豆搜索词' };
  const details = { ...defaultNames, ...category };

  return `
      <section class="category-card" data-category="${key}" aria-labelledby="${key}-title">
        <div class="category-head">
          <span class="category-icon ${key}">${escapeHtml(details.icon)}</span>
          <div>
            <h2 id="${key}-title">${escapeHtml(details.name)}</h2>
            <p>${escapeHtml(details.description)}</p>
          </div>
          <span class="count">${items.length} 个词</span>
        </div>
        ${hasStale ? '<div class="stale-notice">当前来源暂不可用，以下内容沿用最近一次成功结果。</div>' : ''}
        ${items.length > 0
          ? `<ol class="trend-list">${items.map(renderItem).join('')}</ol>`
          : '<div class="empty"><strong>本轮暂无符合条件的词</strong><span>系统只保留真实出现的下载或拼豆搜索表达。</span></div>'}
      </section>`;
}

function renderSourceStatus(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) return '等待首次信号采集';
  return list.map((source) => (
    `<span class="source ${source.ok ? 'ok' : 'down'}"><i></i>${escapeHtml(source.name)}</span>`
  )).join('');
}

export function renderHTML(data = {}) {
  const categories = data?.categories || {};
  const cards = CATEGORY_KEYS.map((key) => renderCategory(key, categories[key])).join('');
  const total = CATEGORY_KEYS.reduce((sum, key) => (
    sum + (Array.isArray(categories[key]?.items) ? categories[key].items.length : 0)
  ), 0);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="只追踪下载与拼豆图纸两类可能爆发的中文搜索关键词">
  <meta name="color-scheme" content="light">
  <title>跟风关键词雷达</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
  <style>
    :root {
      --ink: #202532;
      --muted: #6f7787;
      --line: #e6e8ee;
      --paper: #ffffff;
      --canvas: #f5f6f9;
      --download: #ff6b3d;
      --perler: #8068e8;
      --rise: #df3046;
      --rise-soft: #fff0f2;
      --new: #3f6fd9;
      --new-soft: #eef4ff;
      --shadow: 0 12px 36px rgba(31, 39, 55, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 0%, rgba(128, 104, 232, .08), transparent 25rem),
        radial-gradient(circle at 90% 8%, rgba(255, 107, 61, .08), transparent 24rem),
        var(--canvas);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    a { color: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    button:focus-visible, a:focus-visible { outline: 3px solid rgba(63, 111, 217, .3); outline-offset: 3px; }

    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 44px 0 52px; }
    .masthead { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .eyebrow { margin: 0 0 8px; color: var(--rise); font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 46px); line-height: 1.08; letter-spacing: -.04em; }
    .intro { max-width: 620px; margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.7; }
    .summary { min-width: 180px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.75); text-align: right; }
    .summary strong { display: block; font-size: 25px; line-height: 1; }
    .summary span { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; }

    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .filters { display: inline-flex; gap: 5px; padding: 5px; border: 1px solid var(--line); border-radius: 13px; background: var(--paper); box-shadow: 0 4px 16px rgba(31,39,55,.04); }
    .filter { border: 0; border-radius: 9px; padding: 9px 14px; color: var(--muted); background: transparent; cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; }
    .filter:hover { color: var(--ink); background: var(--canvas); }
    .filter.active { color: #fff; background: var(--ink); }
    .updated { color: var(--muted); font-size: 12px; }

    .category-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; }
    .category-card { overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--paper); box-shadow: var(--shadow); }
    .category-card.hidden { display: none; }
    .category-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
    .category-icon { display: grid; width: 40px; height: 40px; place-items: center; flex: 0 0 auto; border-radius: 12px; color: #fff; font-size: 22px; font-weight: 900; }
    .category-icon.downloads { background: linear-gradient(145deg, #ff855f, var(--download)); }
    .category-icon.perler { background: linear-gradient(145deg, #a492f0, var(--perler)); }
    .category-head h2 { margin: 0; font-size: 17px; }
    .category-head p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
    .count { margin-left: auto; padding: 4px 8px; border-radius: 99px; color: var(--muted); background: var(--canvas); font-size: 11px; white-space: nowrap; }
    .stale-notice { padding: 9px 20px; color: #8b5a15; background: #fff8e8; border-bottom: 1px solid #f3e6c7; font-size: 11px; }

    .trend-list { max-height: 680px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
    .trend-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 11px; align-items: start; padding: 15px 20px; border-bottom: 1px solid var(--line); }
    .trend-row:last-child { border-bottom: 0; }
    .trend-row:hover { background: #fafbfc; }
    .rank { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 7px; color: var(--muted); background: var(--canvas); font-size: 11px; font-weight: 800; }
    .rank.top { color: #fff; background: var(--rise); }
    .trend-main { min-width: 0; }
    .keyword { display: inline; font-size: 14px; font-weight: 750; line-height: 1.45; text-decoration: none; overflow-wrap: anywhere; }
    .keyword:hover { color: var(--new); text-decoration: underline; text-underline-offset: 3px; }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; color: var(--muted); font-size: 10px; line-height: 1.4; }
    .stale-tag { color: #8b5a15; }
    .trend-badge { margin-top: 1px; padding: 5px 8px; border-radius: 8px; font-size: 10px; font-weight: 800; white-space: nowrap; }
    .trend-badge.rising { color: var(--rise); background: var(--rise-soft); }
    .trend-badge.new { color: var(--new); background: var(--new-soft); }
    .trend-badge.falling, .trend-badge.steady { color: var(--muted); background: var(--canvas); }
    .empty { display: grid; gap: 6px; padding: 56px 24px; color: var(--muted); text-align: center; }
    .empty strong { color: var(--ink); font-size: 14px; }
    .empty span { font-size: 11px; }

    .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 18px; padding: 0 4px; color: var(--muted); font-size: 11px; }
    .sources { display: flex; flex-wrap: wrap; gap: 10px; }
    .source { display: inline-flex; align-items: center; gap: 5px; }
    .source i { width: 6px; height: 6px; border-radius: 50%; background: #aab0bd; }
    .source.ok i { background: #26a269; }
    .source.down i { background: #df3046; }

    @media (max-width: 760px) {
      .shell { width: min(100% - 20px, 620px); padding-top: 26px; }
      .masthead { align-items: start; flex-direction: column; }
      .summary { width: 100%; text-align: left; }
      .toolbar { align-items: stretch; flex-direction: column; }
      .filters { display: grid; grid-template-columns: repeat(3, 1fr); }
      .filter { padding-inline: 8px; }
      .category-grid { grid-template-columns: 1fr; }
      .trend-row { grid-template-columns: 26px minmax(0, 1fr); padding: 14px; }
      .trend-badge { grid-column: 2; justify-self: start; }
      .category-head { padding-inline: 14px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .filter, .trend-row, .keyword { transition: color .18s ease, background .18s ease; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Trend Signal Monitor</p>
        <h1>跟风关键词雷达</h1>
        <p class="intro">只看下载与拼豆图纸两类可能爆发的搜索词。环比来自本站公开信号评分，不代表平台官方搜索量。</p>
      </div>
      <div class="summary"><strong>${total}</strong><span>本轮有效关键词</span></div>
    </header>

    <div class="toolbar">
      <nav class="filters" aria-label="关键词分类筛选">
        <button class="filter active" type="button" data-category="all" aria-pressed="true">全部</button>
        <button class="filter" type="button" data-category="downloads" aria-pressed="false">下载热点</button>
        <button class="filter" type="button" data-category="perler" aria-pressed="false">拼豆图纸</button>
      </nav>
      <span class="updated">更新于 ${escapeHtml(formatDate(data.lastUpdated))} · 每小时监测</span>
    </div>

    <div class="category-grid">${cards}
    </div>

    <footer class="foot">
      <div class="sources">${renderSourceStatus(data.sources)}</div>
      <span>点击关键词查看公开搜索结果，不提供文件下载</span>
    </footer>
  </main>

  <script>
    document.querySelectorAll('.filter').forEach((button) => {
      button.addEventListener('click', () => {
        const selected = button.dataset.category;
        document.querySelectorAll('.filter').forEach((item) => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        document.querySelectorAll('.category-card').forEach((card) => {
          card.classList.toggle('hidden', selected !== 'all' && card.dataset.category !== selected);
        });
      });
    });
  </script>
</body>
</html>`;
}

export async function buildHTML({
  dataPath = DEFAULT_DATA_PATH,
  outputPath = DEFAULT_OUTPUT_PATH
} = {}) {
  let data;
  try {
    data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch {
    data = { lastUpdated: new Date().toISOString(), categories: {}, sources: [] };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderHTML(data), 'utf8');
  console.log(`HTML built: ${outputPath}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  buildHTML().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
