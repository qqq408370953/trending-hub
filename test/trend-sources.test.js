import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseBaiduHot,
  parseBilibiliRanking,
  parseDouyinHot,
  parseBaiduSuggestions,
  decodeBaiduBody,
  mapLimit
} from '../scripts/trend-sources.js';

test('parses and deduplicates Baidu hot-list HTML', () => {
  const html = `
    <main>
      <div class="c-single-text-ellipsis">星露谷更新</div>
      <div class="c-single-text-ellipsis"> 星露谷更新 </div>
      <div class="c-single-text-ellipsis">库洛米新造型</div>
    </main>
  `;

  assert.deepEqual(parseBaiduHot(html), [
    { title: '星露谷更新', source: '百度热搜', rank: 1 },
    { title: '库洛米新造型', source: '百度热搜', rank: 2 }
  ]);
});

test('parses Bilibili ranking payload', () => {
  const payload = {
    code: 0,
    message: '0',
    ttl: 1,
    data: {
      note: '',
      list: [
        {
          aid: 1,
          bvid: 'BV1example',
          title: '热门游戏试玩',
          stat: { view: 120000 }
        }
      ]
    }
  };

  assert.deepEqual(parseBilibiliRanking(payload), [
    { title: '热门游戏试玩', source: 'Bilibili 热门', rank: 1 }
  ]);
});

test('parses Douyin hot-search payload', () => {
  const payload = {
    status_code: 0,
    data: {
      active_time: '2026-09-07',
      word_list: [
        { word: '热门角色登场', hot_value: 321000, position: 1 }
      ]
    }
  };

  assert.deepEqual(parseDouyinHot(payload), [
    { title: '热门角色登场', source: '抖音热榜', rank: 1 }
  ]);
});

test('parses Baidu JSONP suggestions and rejects malformed bodies', () => {
  assert.deepEqual(
    parseBaiduSuggestions('window.baidu.sug({"q":"拼豆图纸","s":["库洛米拼豆图纸","星露谷拼豆"]});'),
    ['库洛米拼豆图纸', '星露谷拼豆']
  );
  assert.deepEqual(parseBaiduSuggestions('<html>blocked</html>'), []);
});

test('parses the unquoted-key JSONP shape returned by Baidu', () => {
  assert.deepEqual(
    parseBaiduSuggestions('window.baidu.sug({q:"拼豆图纸",p:false,s:["库洛米拼豆图纸","星露谷拼豆"]});'),
    ['库洛米拼豆图纸', '星露谷拼豆']
  );
});

test('decodes Baidu suggestion bytes as GBK', () => {
  const bytes = Uint8Array.from([0xc6, 0xb4, 0xb6, 0xb9, 0xcd, 0xbc, 0xd6, 0xbd]);
  assert.equal(decodeBaiduBody(bytes.buffer), '拼豆图纸');
});

test('mapLimit preserves result order and enforces the concurrency limit', async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(maximumActive, 2);
});
