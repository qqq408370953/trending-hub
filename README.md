# 跟风关键词雷达 📡

![Build Status](https://github.com/qqq408370953/trending-hub/actions/workflows/fetch-trending.yml/badge.svg)

一个范围刻意收窄的中文热点监测工具，只寻找适合跟风创作的两类搜索词：

- **下载热点**：游戏、软件、App、工具和教程相关的“下载、怎么下载、在哪里下载、安装教程”等表达。
- **拼豆图纸**：热门人物、动漫、游戏、节日相关的“拼豆、拼豆图纸、像素拼豆”等表达。

点击关键词只会打开公开搜索结果。本项目不提供文件下载、不聚合网盘资源，也不会收录破解、盗版、外挂或激活码相关内容。

## 工作方式

系统每小时执行一次：

1. 从抖音公开热榜、百度热搜和 Bilibili 公开排行榜读取当前热门主题。
2. 使用百度公开搜索联想验证用户是否已经形成具体的下载或拼豆搜索表达。
3. 只保留符合上述两类规则的真实返回词，并按信号分排序。
4. 与仓库内上一轮快照比较，展示“新上榜”或“信号环比”。
5. 生成静态页面并通过 GitHub Pages 发布。

“信号环比”是本站根据信号来源、联想排名和重复出现次数计算的变化，不代表任何平台公布的搜索量。

## 特性

- 🎯 **只有两个分类**：不混入娱乐、新闻等无关通用热榜。
- 📈 **发现潜力词**：突出新出现或信号增长较快的关键词。
- 🧹 **风险词过滤**：排除破解、盗版、外挂、激活码和网盘资源。
- 🕐 **每小时更新**：GitHub Actions 在每小时第 17 分钟自动运行。
- 🧯 **失败回退**：单个分类暂时抓不到内容时，保留最近成功结果并明确标记。
- 📱 **响应式页面**：桌面双栏、移动端单栏，可快速筛选两类关键词。

## 快速开始

### GitHub Pages

1. Fork 本仓库。
2. 在 Settings → Pages 中将 Source 设为 **GitHub Actions**。
3. 在 Actions 页面启用工作流。
4. 手动运行 **Fetch Focused Trend Keywords**，或等待下一个整点后的第 17 分钟。

页面地址通常为 `https://你的用户名.github.io/trending-hub/`。

### 本地运行

```bash
git clone https://github.com/你的用户名/trending-hub.git
cd trending-hub
npm ci
npm test
npm run fetch
npm run build
npm run dev
```

`npm run fetch` 需要访问公开数据源；单元测试不访问网络。

## 数据结构

抓取结果保存在 `data/trending.json`：

```json
{
  "lastUpdated": "2026-09-07T08:00:00.000Z",
  "categories": {
    "downloads": {
      "name": "下载热点",
      "items": [
        {
          "rank": 1,
          "title": "示例 App 下载教程",
          "searchUrl": "https://www.baidu.com/s?wd=...",
          "score": 180,
          "growth": 80,
          "trend": "rising",
          "source": ["百度联想 · 抖音热榜"],
          "firstSeenAt": "2026-09-07T07:00:00.000Z",
          "stale": false
        }
      ]
    },
    "perler": {
      "name": "拼豆图纸",
      "items": []
    }
  },
  "sources": []
}
```

每类最多保留 30 条。`growth: null` 表示首次发现，`stale: true` 表示本轮沿用了上次成功数据。

## 项目结构

```text
trending-hub/
├── .github/workflows/fetch-trending.yml  # 每小时测试、抓取、构建和部署
├── scripts/
│   ├── trend-core.js                     # 分类、过滤、计分与环比
│   ├── trend-sources.js                  # 公开来源解析器
│   ├── fetch-trending.js                 # 抓取编排与历史回退
│   └── build-html.js                     # 静态页面生成
├── test/                                 # 不访问网络的自动测试
├── data/trending.json                    # 最近一次关键词快照
└── public/index.html                     # GitHub Pages 页面
```

## 注意事项

- 公开站点可能调整接口或临时限制访问；页面会显示来源状态，并在可能时沿用最近成功结果。
- 首次运行没有历史基线，因此关键词显示“新上榜”；从第二次有效运行开始才可能出现信号环比。
- 自动评分只用于辅助选题，发布作品前仍应人工检查关键词语境、版权和平台规范。

## License

MIT License
