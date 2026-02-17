# RiichiMahjongBench Leaderboard

大模型立直麻将测试排行榜（Cloudflare 可部署静态站点）初始化仓库。

本仓库负责两件事：

1. 解析比赛结果目录中的日志（`run.log` / `games/*.jsonl`）
2. 生成可直接被前端读取的 `public/data/leaderboard.json`

然后 `public/` 下的页面会把该 JSON 渲染成模型排行榜。

## 项目结构

- `scripts/generate-leaderboard.mjs`
  - 扫描结果目录
  - 解析分数
  - 生成 `public/data/leaderboard.json`
- `public/index.html`
  - 排行榜页面
- `public/app.js`
  - 拉取并展示排行榜数据
- `public/styles.css`
  - 页面样式
- `public/data/leaderboard.json`
  - 由构建命令自动生成的展示数据

## 环境与启动

本仓库基于 Node.js 原生模块实现，不依赖额外 npm 依赖。

```bash
# 只要有 Node.js 即可（建议 20+）
npm install
```

> 说明：项目只使用 Node.js 原生模块，`npm install` 主要用于生成本地环境，不会安装业务依赖。

## 一键生成排行榜数据（核心命令）

### 推荐命令（你要求的）

```bash
npm run build -- --input LOG_PATH
```

- `LOG_PATH`：你的比赛根目录，例如：

```bash
npm run build -- --input /mnt/hdd1/xiahan_github/RiichiMahjongBench/logs
```

执行后会读取该路径下所有 run 目录（如 `2026-02-17_20-44-05`），
并写出 `public/data/leaderboard.json`。

### 运行结果

成功后，页面会自动读取 `public/data/leaderboard.json` 并显示：

- 平均分
- 最高分 / 最低分
- 参与 run 次数
- 最近分数
- 最近一次变动
- 运行概况（总 run 数、已完成/进行中）

## 其他参数

除了上面推荐命令，也可以手动指定输出路径：

```bash
node scripts/generate-leaderboard.mjs --input LOG_PATH --output /tmp/leaderboard.json
```

支持环境变量：

- `RESULTS_DIR`：替代 `--input`

## 开发与本地预览

1. 先生成数据：

```bash
npm run build -- --input LOG_PATH
```

2. 用浏览器直接打开 `public/index.html`（本文件会读取 `public/data/leaderboard.json`）

3. 更新日志后，重复执行第 1 步即可刷新数据

## Cloudflare 部署（推荐）

1. 将仓库推送到 GitHub
2. 在 Cloudflare Pages 中创建项目并绑定仓库
3. 配置构建参数：
   - **Build command**: `npm run build -- --input /mnt/hdd1/xiahan_github/RiichiMahjongBench/logs`
   - **Build output directory**: `public`
4. 每次日志更新后重新触发部署，页面会自动刷新为新排行榜

> 如果日志目录会变动但仓库里不提交 `leaderboard.json`，建议在 CI 中先执行一次
> `npm run build -- --input LOG_PATH`，再把输出提交到构建产物目录。

## 注意

- 当前脚本是“静态快照”模式：每次构建重新读取日志并生成一次 JSON；
- 当前日志尚未完成对局时会被标记为 `partial`，也会一并显示在排行计算中。
