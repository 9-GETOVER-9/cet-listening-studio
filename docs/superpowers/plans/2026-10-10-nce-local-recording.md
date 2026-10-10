# 新概念本地录音 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this approved plan task-by-task.

**Goal:** 提供本地个人录音、回放、删除及下载。

**Architecture:** 独立 Dexie 数据库按 owner/cardId 隔离 Blob；MediaRecorder 控制器封装权限竞态和释放；可折叠组件接入已有跟读页，保持文字核对独立。

**Tech Stack:** React、TypeScript、Dexie、MediaRecorder、Vitest、fake-indexeddb。

### Task 1: 本地存储及录制生命周期

Create `src/lib/nceRecordingStore.ts`, `src/lib/localRecorder.ts` and corresponding `.test.ts` files.

- [x] 写入并运行失败测试：`listRecordings('a','c')` 不返回其他账号或句子；关闭数据库重开仍保留 Blob；`deleteRecording` 校验 owner；空录音拒绝保存。
- [x] 实现 `saveRecording(row)`, `listRecordings(owner,cardId)`, `deleteRecording(owner,cardId,id)`；索引 `id,[owner+cardId]`，独立数据库 `nce-local-recordings`。
- [x] 控制器测试：`start()` 延迟权限后 `dispose()` 释放 tracks；`stop()` 收集最终数据并按实际 MIME 返回 Blob；错误和取消释放麦克风。
- [x] 实现 `LocalRecorder`，注入 `getStream/createRecorder/now`，默认使用浏览器 API；`dispose()` 使未完成请求失效；空数据报错。
- [x] 运行 `D:\node.exe node_modules/vitest/vitest.mjs run src/lib/nceRecordingStore.test.ts src/lib/localRecorder.test.ts`，预期全通过。

### Task 2: 界面及学习页接入

Create `src/components/NCERecordingPanel.tsx`; modify `NCEPracticeActions.tsx`, `NCEPracticePanel.tsx`, `NCEShadowing.tsx` and panel tests.

- [x] 替换待开发测试，断言本地入口及待开发文字消失。
- [x] 组件使用不可变 owner/cardId，停止后自动保存；失败保留 draft，提供重试、下载及丢弃。回放 URL 在删除、切换、卸载时撤销。
- [x] 跟读页通过 `onBusyChange(boolean)` 阻止跳转、切句、自动继续；录音开始及回放时停止原音；原音播放停止个人回放。
- [x] 卡片入口导航到 `/nce/shadowing/:moduleId?targetId=:cardId&recording=1`，默认展开个人录音。
- [x] 浏览器实际录制合成音频、刷新恢复及删除；检查 375px 页面。完整运行 Vitest、ESLint、tsc 及 Vite build。

### Task 3: 审查与交付

- [x] 请求独立只读代码审查，修正重要问题并回归。
- [x] 按源代码规则提交到当前功能分支，更新已有 PR9；不提交音频和教材。
- [x] 沿用已授权部署，FrontendOnly 包发布；核验 HTTPS 及发布身份，教材数据不变。
- [x] 更新项目记忆的已验证状态。


已完成本地与线上验收，业务源码 b0fdbb5。项目记忆已写入并认领；closeout dry-run 因30份历史未认领变更未通过，正式归档保留待维护，不认领其他会话文件。
