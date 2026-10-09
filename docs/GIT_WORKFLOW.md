# 代码维护与分支约定

本仓库保存应用代码、测试、配置和导入工具。音频、教材、原始 CSV/PDF/APKG、生成的词库、翻译缓存、浏览器记录、构建产物和本地凭证不上传。`public/data/` 由本机或部署环境单独提供。

## 分支

- `main`：稳定版本，仅通过审阅后的合并请求更新。
- `dev`：开发集成分支；普通 Bug 修复从最新 dev 直接修改、测试、提交。
- `feature/*`：新增功能；合并后发现的问题回 dev 修复，尚未合并的功能继续原分支。
- `chore/*`：依赖、开发检查和发布工具维护。
- `hotfix/*`：必须直接修复稳定版本的紧急问题。

提交信息使用中文，例如 `功能：新增雅思阅读间隔复习`、`修复：保留刷新前的选择状态`。不强推，不自动合并稳定分支，不在后台持续上传。

## 2026-10-09 代码归档

此前多个功能共同保留在本机未提交工作区。本次从最新远程 main 建立独立工作区，只复制明确列出的代码；保留远程 README 更新和原本机工作区。

| 分支 | 范围 | 主要入口 |
| --- | --- | --- |
| `chore/代码上传与发布检查` | 数据/媒体排除规则、依赖、检查配置、发布与回退工具 | `scripts/`、`package.json` |
| `feature/学习复习与听力统计` | 卡片/难点本/复习交互、随身听、课程筛选、学习同步、听力统计、签到 | `src/pages/Review.tsx`、`Walkman.tsx`、`Profile.tsx`、`src/lib/listeningTime.ts` |
| `feature/雅思听力与词条笔记` | 王陆/高频听写、双语播放、错词复习、原因标记、词条笔记和导入工具 | `src/pages/IELTSDictation.tsx`、`src/lib/ieltsFrequencyProgress.ts` |
| `feature/雅思阅读538` | 雅思专区、三类阅读、多选/回忆、FSRS、自动批注与备份 | `src/pages/IELTSReading.tsx`、`src/lib/ieltsReadingStore.ts` |
| `feature/原句发音与短语标注` | 四六级/新概念学习及复习原句标注、设置中心开关 | `src/components/AnnotatedSentence.tsx`、`src/lib/sentenceAnnotations.ts` |

这些分支按表格顺序依赖前一分支，共享的播放与存储接口先进入前置提交。合并请求按前置顺序审阅；第一个指向 dev，后续先指向前置功能分支以展示本功能的增量。前置内容进入 dev 后，将下一请求的目标切换为 dev，再同步与验证。各分支端点分别运行测试和 TypeScript 检查。

## 克隆后的开发环境

安装 Node.js 与 pnpm，运行 `pnpm install --frozen-lockfile`。按 `.env.example` 配置本机 `.env.local`，只使用前端可公开的 Supabase anon 配置，不将服务端凭证放入 `VITE_` 变量。

测试和构建：

```sh
pnpm test
pnpm lint
pnpm build
```

运行完整学习页面前，另行准备经授权的数据到 `public/data/`；仓库不会自动下载或提供教材和音频。导入工具只生成本机数据，不把工具输出加入 Git。阅读第一章导入器为 `tools/import_ielts_reading_538.py`；三个输入路径通过命令参数传入，源文件指纹不匹配时不能沿用原核验结论。

保存历史个人词库相关实现便于维护，但当前听力页仅开放王陆与高频入口，不恢复已取消的网络库和个人生词入口。
