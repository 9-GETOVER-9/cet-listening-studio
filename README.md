<div align="center">

# CET Listening Studio

**听音、练习、标记难点，再把学过的内容带回复习。**

`四六级` · `新概念英语` · `难点本` · `间隔复习`

[![GitHub Stars](https://img.shields.io/github/stars/9-GETOVER-9/cet-listening-studio?style=for-the-badge&color=839778)](https://github.com/9-GETOVER-9/cet-listening-studio/stargazers)

[快速开始](#section-2) · [功能矩阵](#section-3) · [运行前配置](#section-7)

</div>

---

<a id="section-1"></a>

## 一句话介绍

一个在浏览器中使用的听力训练应用，提供四六级与新概念英语内容入口、卡片训练、难点本和综合复习。

<a id="section-2"></a>

## 快速开始

```bash
git clone https://github.com/9-GETOVER-9/cet-listening-studio.git
cd cet-listening-studio
pnpm install
pnpm dev
```

<a id="section-3"></a>

## 功能矩阵

| 功能 | 说明 |
|---|---|
| 内容选择 | 进入四六级或新概念英语听力材料 |
| 卡片训练 | 按材料逐步完成听力练习 |
| 难点本 | 收藏并回顾词语、短语及发音难点 |
| 综合复习 | 根据学习记录安排待复习卡片 |
| 学习概览 | 查看当天任务与进度 |

<a id="section-4"></a>

## 核心工作流

```text
选材料 → 听力训练 → 标记难点 → 难点本 → 综合复习
```

<a id="section-5"></a>

## 项目结构

| 路径 | 用途 |
|---|---|
| `src/pages/` | 页面与训练流程 |
| `src/db/` | 本地学习记录 |
| `src/lib/fsrs.ts` | 复习调度 |
| `supabase/` | 云端相关配置与脚本 |
| `DEPLOY.md` | 部署说明 |

<a id="section-6"></a>

## 验证与部署

`pnpm test`、`pnpm lint` 和 `pnpm build` 分别运行测试、静态检查与构建。部署步骤见 [DEPLOY.md](DEPLOY.md)。

<a id="section-7"></a>

## 运行前配置

先参考 [.env.example](.env.example) 配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`；登录依赖自己的 Supabase 项目。数据库配置见 [supabase/](supabase/)。不要把服务端密钥写入前端环境变量。

课程加载器会请求 `/data/modules.json` 及 `/data/audio/` 下的素材。当前源码仓库不包含完整课程数据与音频，运行时需要自行提供有权使用的对应素材。安装前端依赖不等于已经安装课程内容。
