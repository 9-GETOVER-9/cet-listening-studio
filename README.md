# CET Listening Studio · 四六级与新概念听力训练

从听音辨词到精听纠错、难点收藏和间隔复习，把一次听力练习变成可持续的学习记录。

**React · TypeScript · Vite · IndexedDB · FSRS**

## 一句话介绍

一个在浏览器中使用的英语训练应用，提供四六级、新概念和雅思入口、卡片训练、难点本、综合复习与学习统计。

## 快速开始

```bash
git clone https://github.com/9-GETOVER-9/cet-listening-studio.git
cd cet-listening-studio
pnpm install
pnpm dev
```

## 功能矩阵

| 功能 | 说明 |
|---|---|
| 内容选择 | 进入四六级或新概念英语听力材料 |
| 卡片训练 | 按材料逐步完成听力练习 |
| 难点本 | 收藏并回顾词语、短语及发音难点 |
| 综合复习 | 根据学习记录安排待复习卡片 |
| 学习概览 | 查看当天任务与进度 |
| 雅思听力 | 王陆/高频听写、双语随身听、错词复习与词条笔记 |
| 雅思阅读 538 | 第一章三类词条、多选辨认、主动回忆、FSRS 与自动批注 |
| 听力时长与签到 | 按实际播放记录时长，查看学习统计与签到反馈 |

## 核心工作流

```text
选材料 → 听力训练 → 标记难点 → 难点本 → 综合复习
```

## 项目结构

| 路径 | 用途 |
|---|---|
| `src/pages/` | 页面与训练流程 |
| `src/db/` | 本地学习记录 |
| `src/lib/fsrs.ts` | 复习调度 |
| `supabase/` | 云端相关配置与脚本 |
| `DEPLOY.md` | 部署说明 |

## 验证与部署

`pnpm test`、`pnpm lint` 和 `pnpm build` 分别运行测试、静态检查与构建。部署步骤见 [DEPLOY.md](DEPLOY.md)。

## 源码与后续维护

仓库只维护代码、测试和工具，音频、教材、生成词库和本地凭证单独保存，不随 Git 上传。克隆后按 `.env.example` 配置 `.env.local`；完整学习页面所需的 `public/data/` 内容须另行准备。

新功能使用 `feature/*`，普通 Bug 修复在 `dev` 完成，稳定后再审阅合并到 `main`。各功能入口、当前分支与依赖顺序见 [代码维护与分支约定](docs/GIT_WORKFLOW.md)，本次检查见 [代码上传验收](docs/CODE_PUBLISH_VALIDATION.md)。

## 详细说明

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
