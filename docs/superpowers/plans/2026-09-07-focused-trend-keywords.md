# Focused Trend Keywords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic social trend dashboard with an hourly radar containing only download-intent keywords and perler-pattern keywords suitable for follow-the-trend content planning.

**Architecture:** Keep the existing Node.js static-site pipeline, but separate deterministic keyword rules into `scripts/trend-core.js`, source adapters into `scripts/trend-sources.js`, orchestration into `scripts/fetch-trending.js`, and HTML rendering into `scripts/build-html.js`. Public hot-list titles seed Baidu suggestion lookups; only returned phrases that match the two narrow categories survive, and the checked-in previous snapshot supplies growth baselines and stale fallback data.

**Tech Stack:** Node.js 20 ESM, Node built-in test runner, node-fetch, Cheerio, static HTML/CSS/JavaScript, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-07-focused-trend-keywords-design.md`

## Global Constraints

- Output only `downloads` and `perler` categories.
- Do not provide, cache, or link directly to downloadable third-party files.
- Reject terms involving piracy, cracks, cheats, activation codes, or cloud-drive resources.
- Keep the existing Node.js 20 ESM project and GitHub Pages deployment.
- Use public endpoints that require no user-provided API key.
- Display computed values as signal growth, never as official platform search volume.
- Keep at most 30 items per category and preserve the previous category with `stale: true` when a current fetch returns no items.

---

### Task 1: Keyword classification and scoring core

**Files:**
- Create: `scripts/trend-core.js`
- Create: `test/trend-core.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeTitle(value: unknown): string`
- Produces: `classifyKeyword(title: string, context?: { seedKind?: string }): 'downloads' | 'perler' | null`
- Produces: `safeSearchUrl(value: string, fallbackQuery: string): string`
- Produces: `buildRankedItems(signals: Signal[], previousItems: TrendItem[], now: string, limit?: number): TrendItem[]`
- Produces: `withStaleFallback(currentItems: TrendItem[], previousItems: TrendItem[]): TrendItem[]`
- Consumes: no project-local interfaces.

`Signal` has `{ title, source, suggestionRank, directHotRank?, searchUrl?, seedKind? }`. `TrendItem` has `{ rank, title, searchUrl, score, growth, trend, source, firstSeenAt, stale }`.

- [ ] **Step 1: Add the Node test command and write failing classification tests**

Add `"test": "node --test"` to `package.json`. Create `test/trend-core.test.js` with literal behavior checks:

```js
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
  assert.equal(safeSearchUrl('javascript:alert(1)', '拼豆图纸'), 'https://www.baidu.com/s?wd=%E6%8B%BC%E8%B1%86%E5%9B%BE%E7%BA%B8');
  assert.equal(safeSearchUrl('https://example.com/search?q=x', 'x'), 'https://example.com/search?q=x');
});
```

- [ ] **Step 2: Run the classification tests and verify RED**

Run: `npm test -- test/trend-core.test.js`

Expected: FAIL because `scripts/trend-core.js` does not exist.

- [ ] **Step 3: Implement minimal classification and URL safety**

Create `scripts/trend-core.js` with explicit regular expressions:

```js
const DOWNLOAD_INTENT = /(下载|怎么下载|在哪(?:里)?下载|下载教程|安装教程)/i;
const DOWNLOAD_CONTEXT = /(游戏|软件|app|应用|工具|教程|客户端|模拟器|插件)/i;
const PERLER_INTENT = /(拼豆|拼豆图纸|豆豆图纸|像素拼豆)/i;
const BLOCKED = /(破解|盗版|外挂|激活码|注册码|网盘|百度盘|夸克盘|磁力|torrent)/i;

export function normalizeTitle(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
}

export function classifyKeyword(title, { seedKind } = {}) {
  const value = normalizeTitle(title);
  if (!value || BLOCKED.test(value)) return null;
  if (PERLER_INTENT.test(value)) return 'perler';
  if (DOWNLOAD_INTENT.test(value) && (seedKind === 'downloads' || DOWNLOAD_CONTEXT.test(value))) return 'downloads';
  return null;
}

export function safeSearchUrl(value, fallbackQuery) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {}
  return `https://www.baidu.com/s?wd=${encodeURIComponent(normalizeTitle(fallbackQuery))}`;
}
```

- [ ] **Step 4: Run the classification tests and verify GREEN**

Run: `npm test -- test/trend-core.test.js`

Expected: the four classification and URL tests pass; scoring imports still require exported stubs or the next tests must be added before importing them.

- [ ] **Step 5: Add failing scoring, growth, sorting, deduplication, limit, and fallback tests**

Extend `test/trend-core.test.js`:

```js
test('merges duplicate signals and calculates growth from the previous score', () => {
  const items = buildRankedItems([
    { title: '星露谷怎么下载', source: '百度联想', suggestionRank: 2, seedKind: 'downloads' },
    { title: '星露谷怎么下载', source: '抖音热榜扩展', suggestionRank: 4, directHotRank: 3, seedKind: 'downloads' }
  ], [{ title: '星露谷怎么下载', score: 100, firstSeenAt: '2026-09-06T00:00:00.000Z' }], '2026-09-07T00:00:00.000Z');

  assert.equal(items.length, 1);
  assert.equal(items[0].rank, 1);
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
  assert.deepEqual(withStaleFallback([], previous), [{ rank: 1, title: '旧词下载教程', stale: true }]);
  assert.deepEqual(withStaleFallback([{ rank: 1, title: '新词下载教程' }], previous), [{ rank: 1, title: '新词下载教程' }]);
});
```

The hand-derived expected score is 180: rank 2 contributes 90, rank 4 contributes 70, and direct hot rank 3 contributes 20. With a previous score of 100, growth is `(180 - 100) / 100 = 80%`.

- [ ] **Step 6: Run the new tests and verify RED**

Run: `npm test -- test/trend-core.test.js`

Expected: FAIL because `buildRankedItems` and `withStaleFallback` are not implemented.

- [ ] **Step 7: Implement deterministic ranking and stale fallback**

Use `Math.max(1, 11 - suggestionRank) * 10` for suggestion evidence and `Math.max(0, 23 - directHotRank)` for direct hot evidence. Merge normalized case-insensitive titles, deduplicate sources, preserve the prior `firstSeenAt`, calculate integer percentage growth, sort by score then best suggestion rank then title, slice to `limit`, and assign ranks after slicing. Set `searchUrl` through `safeSearchUrl`, `stale: false`, and trends `new`, `rising`, `falling`, or `steady`.

- [ ] **Step 8: Run the core tests and commit**

Run: `npm test -- test/trend-core.test.js`

Expected: all core tests pass.

Commit:

```bash
git add package.json scripts/trend-core.js test/trend-core.test.js
git commit -m "feat: add focused keyword trend rules"
```

---

### Task 2: Public source adapters and focused fetch pipeline

**Files:**
- Create: `scripts/trend-sources.js`
- Replace: `scripts/fetch-trending.js`
- Create: `test/trend-sources.test.js`
- Create: `test/fetch-trending.test.js`

**Interfaces:**
- Consumes: `normalizeTitle`, `classifyKeyword`, `buildRankedItems`, and `withStaleFallback` from Task 1.
- Produces: `parseBaiduHot(html: string): HotTopic[]`
- Produces: `parseBilibiliRanking(payload: object): HotTopic[]`
- Produces: `parseDouyinHot(payload: object): HotTopic[]`
- Produces: `parseBaiduSuggestions(body: string): string[]`
- Produces: `mapLimit(values: T[], limit: number, worker: (value: T) => Promise<R>): Promise<R[]>`
- Produces: `createTrendingSnapshot({ previous, topics, suggestionResults, now }): TrendingSnapshot`
- Produces: executable `main()` that writes `data/trending.json`.

`HotTopic` has `{ title, source, rank }`. `suggestionResults` contains `{ query, seedKind, source, directHotRank, suggestions }` entries.

- [ ] **Step 1: Write failing parser tests with complete literal fixtures**

Create `test/trend-sources.test.js` using a minimal Baidu HTML card, a Bilibili `{ code: 0, data: { list: [...] } }` response, a Douyin `{ data: { word_list: [...] } }` response, and `window.baidu.sug({"q":"拼豆图纸","s":["库洛米拼豆图纸"]});`. Assert exact `HotTopic[]` and suggestion arrays without live network calls.

- [ ] **Step 2: Run source parser tests and verify RED**

Run: `npm test -- test/trend-sources.test.js`

Expected: FAIL because `scripts/trend-sources.js` does not exist.

- [ ] **Step 3: Implement source parsers and the concurrency helper**

Implement parsers with optional chaining and type checks. `parseBaiduHot` uses Cheerio selectors `.c-single-text-ellipsis` and `[class*="title"]`, deduplicates titles, and returns at most 30 records. `parseBaiduSuggestions` extracts the JSON object between the first `(` and last `)`, parses it, and returns a normalized `s` array or `[]`. `mapLimit` launches at most `limit` workers and preserves input order.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm test -- test/trend-sources.test.js`

Expected: all parser and concurrency tests pass.

- [ ] **Step 5: Write failing snapshot tests**

Create `test/fetch-trending.test.js` with one download suggestion, one perler suggestion, one irrelevant suggestion, and a previous perler item. Assert that `createTrendingSnapshot` returns exactly the two category keys, filters the irrelevant phrase, calculates download growth, sets ISO `lastUpdated`, and falls back to the previous perler item with `stale: true` when the perler suggestion list is empty.

- [ ] **Step 6: Run snapshot tests and verify RED**

Run: `npm test -- test/fetch-trending.test.js`

Expected: FAIL because the new fetch module and `createTrendingSnapshot` do not exist.

- [ ] **Step 7: Implement snapshot orchestration and executable networking**

Replace `scripts/fetch-trending.js` with:

- `fetchWithTimeout(url, { responseType })` using a 12-second `AbortController` timeout.
- Independent `Promise.allSettled` calls for the three hot-list endpoints.
- Topic normalization and deduplication, limited to the best 15 titles.
- Fixed queries from the spec plus three expansion queries per hot title.
- Baidu suggestion requests through `https://suggestion.baidu.com/su?wd=<encoded>&cb=window.baidu.sug` with `mapLimit(..., 5, ...)`.
- `createTrendingSnapshot` that converts only classified suggestions to `Signal` objects, ranks each category, applies stale fallback independently, and reports source status without response bodies or credentials.
- An ESM direct-execution guard using `pathToFileURL(process.argv[1]).href === import.meta.url` so tests can import the module without starting network work.
- Reading the old `data/trending.json` as `{ categories: {} }` when missing or incompatible, then atomically writing the completed JSON via a sibling temporary file and rename.

- [ ] **Step 8: Run fetch-unit tests and the full test suite**

Run: `npm test`

Expected: all core, parser, and snapshot tests pass without network access.

- [ ] **Step 9: Commit the focused data pipeline**

```bash
git add scripts/fetch-trending.js scripts/trend-sources.js test/trend-sources.test.js test/fetch-trending.test.js
git commit -m "feat: collect download and perler trend signals"
```

---

### Task 3: Two-category static dashboard

**Files:**
- Replace: `scripts/build-html.js`
- Create: `test/build-html.test.js`

**Interfaces:**
- Consumes: the `TrendingSnapshot` written by Task 2.
- Produces: `escapeHtml(value: unknown): string`
- Produces: `renderHTML(data: TrendingSnapshot): string`
- Produces: executable `buildHTML({ dataPath?, outputPath? }): Promise<void>`.

- [ ] **Step 1: Write failing renderer tests**

Create a two-category fixture containing one rising download term and one new perler term. Assert that `renderHTML` includes `跟风关键词雷达`, buttons with `data-category="downloads"` and `data-category="perler"`, `信号环比 +125%`, `新上榜`, both keyword titles, and their sources. Add a malicious title `<img src=x onerror=alert(1)>下载教程` and `javascript:` URL; assert the raw tag and dangerous scheme are absent while escaped text and a Baidu fallback URL are present.

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `npm test -- test/build-html.test.js`

Expected: FAIL because the old renderer has no exported `renderHTML` and still renders platform cards.

- [ ] **Step 3: Implement the compact two-list UI**

Replace the page template with:

- Header title `跟风关键词雷达` and subtitle `只看下载与拼豆图纸两类可能爆发的搜索词`.
- Three accessible filter buttons: all, downloads, perler.
- A two-column `.category-grid` with a dedicated card per category.
- Rows containing rank, escaped title, trend badge, signal score, source list, and first-seen time.
- Rising growth rendered as `信号环比 +N%`, falling growth as `信号环比 -N%`, steady as `信号持平`, and new items as `新上榜`.
- A visible stale banner when any item is stale and an explicit empty state when a category has no items.
- Search-only links using `safeSearchUrl`, `target="_blank"`, and `rel="noopener noreferrer"`.
- Responsive one-column layout below 760px, keyboard-visible focus states, reduced-motion handling, and no external font or front-end dependency.
- Client-side category filtering only; no automatic page reload loop.

Export `renderHTML` and `buildHTML`, and use the same ESM direct-execution guard as the fetch script.

- [ ] **Step 4: Run renderer and full tests**

Run: `npm test`

Expected: all tests pass and no generated HTML contains the old `.platform-card` model.

- [ ] **Step 5: Commit the dashboard**

```bash
git add scripts/build-html.js test/build-html.test.js
git commit -m "feat: render focused follow-trend dashboard"
```

---

### Task 4: Automation, documentation, and checked-in output

**Files:**
- Modify: `.github/workflows/fetch-trending.yml`
- Modify: `README.md`
- Modify: `package.json`
- Replace generated: `data/trending.json`
- Replace generated: `public/index.html`

**Interfaces:**
- Consumes: `npm test`, `npm run fetch`, and `npm run build` from earlier tasks.
- Produces: hourly GitHub Pages updates and user-facing project documentation.

- [ ] **Step 1: Update workflow behavior**

Change the cron to `17 * * * *` to avoid the top-of-hour load spike. Run `npm test` before `npm run fetch`; remove `continue-on-error: true`; keep build, data/public commit, and Pages deployment. Extend push path filters to `test/**`, `package*.json`, and `README.md` so code or test changes trigger a validation build.

- [ ] **Step 2: Rewrite README around the narrow purpose**

Document:

- The two categories and the fact that links open searches rather than files.
- The four public signals and the computed signal-growth definition.
- Safety exclusions and stale fallback behavior.
- `npm ci`, `npm test`, `npm run fetch`, `npm run build`, and `npm run dev`.
- The new `categories` JSON schema and project file layout.
- Hourly update behavior and external-source availability caveat.

Remove claims about X, TikTok hashtags, Instagram, Weibo, Zhihu, generic global trends, and 30-minute updates.

- [ ] **Step 3: Run a live fetch to produce the first focused snapshot**

Run: `npm run fetch`

Expected: `data/trending.json` contains only `categories.downloads` and `categories.perler`. If all external sources are unavailable, write valid empty category arrays rather than retaining incompatible legacy `platforms` data.

- [ ] **Step 4: Build the checked-in HTML**

Run: `npm run build`

Expected: `public/index.html` is regenerated from the new category snapshot.

- [ ] **Step 5: Verify the complete repository**

Run:

```bash
npm test
npm run build
node -e "const d=require('./data/trending.json'); const k=Object.keys(d.categories||{}); if (k.join(',')!=='downloads,perler') process.exit(1);"
git diff --check
git status --short
```

Expected: tests exit 0, build exits 0, the JSON category assertion exits 0, `git diff --check` prints nothing, and status contains only intentional implementation/generated changes.

- [ ] **Step 6: Commit automation, docs, and output**

```bash
git add .github/workflows/fetch-trending.yml README.md package.json package-lock.json data/trending.json public/index.html
git commit -m "chore: publish focused trend keyword radar"
```

---

### Task 5: Final verification and delivery

**Files:**
- Verify only: all tracked files.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: a verified commit series ready for `origin/main`.

- [ ] **Step 1: Re-run fresh verification**

Run `npm test && npm run build && git diff --check` and inspect the full output. Then run `git status --short`, `git log -5 --oneline --decorate`, and inspect `git diff origin/main...HEAD --stat` plus the focused diffs for workflow, scripts, tests, README, and generated data.

- [ ] **Step 2: Confirm remote has not advanced**

Run `git fetch origin main` followed by `git rev-list --left-right --count origin/main...HEAD`.

Expected: the local branch is not behind. If remote automation advanced `main`, rebase the implementation commits onto `origin/main`, resolve only generated data conflicts by regenerating `data/trending.json` and `public/index.html`, then repeat Step 1.

- [ ] **Step 3: Push the verified branch**

Run: `git push origin main`

Expected: GitHub reports `main -> main` without force-push.

- [ ] **Step 4: Verify the remote commit**

Run `git ls-remote origin refs/heads/main` and compare its hash with `git rev-parse HEAD`.

Expected: both hashes match. Report the repository URL, final commit hash, tests run, and any live-source limitation observed during the first fetch.
