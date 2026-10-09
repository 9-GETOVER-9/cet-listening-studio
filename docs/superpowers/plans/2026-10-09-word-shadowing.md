# 单词练习与新概念跟读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 完善26项单词练习并上线新概念输入法跟读。
**Architecture:** 独立WordPractice和NCEShadowing页面，来源适配、纯核对、存储和播放分离；旧FSRS与新口语成绩隔离。复用现有依赖，增量来源入口与路由。
**Tech Stack:** React/TypeScript、Dexie、ts-fsrs、HTMLAudio/SpeechSynthesis、Vitest。

## Task 1: 单词练习核心、页面及来源入口

Files: src/lib/wordPractice.ts, wordPracticeStore.ts, wordPracticeSources.ts, wordPracticeAudio.ts及对应test；src/pages/WordPractice.tsx；src/components/WordPracticeControls.tsx；modify IELTSDictation.tsx、IELTSFrequencyReview.tsx、Notebook.tsx。根代理修改router.tsx。

- [x] 写RED：首次错误重试后结果仍false，重复确认receipt仅一次；meaning模式不改变高频进度；notebook只更新fsrsNotebook；错误持久化后恢复、owner/上下文隔离、确认失败重试。
```ts
expect(checkSpelling(' CHECK. ', ['cheque','check'])).toBe(true)
expect(checkSpelling('live', ['lives'])).toBe(false)
```
- [x] Run `D:/node.exe node_modules/vitest/vitest.mjs run src/lib/wordPractice*.test.ts`，确认新行为缺失失败。
- [x] 实现纯核对状态（firstPassed保留首判，重复查看不改变results）与事务receipt；失败保留当前题。推荐队列读真实frequency progress与notebook FSRS。meaning为独立练习。
- [x] 实现播放原音/可用设备英美合成音、取消token、重复与倍速；缺原音/音标显示真实缺失。设置/有效时长/倒计时在后台、IME、笔记编辑/存储失败处暂停。
- [x] 实现26项UI与手机布局，添加源页面入口；输入法Enter只在答案输入与成功等待处动作，其他控件保留原生键。
- [x] Run 新增核心/存储/播放测试、lint和tsc；根代理验证浏览器与全部回归，并两阶段审查。
- [ ] 仅明确Task1文件提交“功能：完善单词拼写与错词复习”，feature/单词练习完善推送并创建依赖前置chore分支的草稿PR。

## Task 2: 新概念文本对齐、免判、持久化与页面

Files: src/lib/nceShadowing.ts、nceShadowingStore.ts、nceProperNames.ts及tests；src/pages/NCEShadowing.tsx；modify NCESelector.tsx、CardFlash.tsx、Review.tsx。根代理修改router.tsx。Task1审查完成后执行。

- [ ] 写RED：大小写/标点等价、John/London免判，live不能代替lives，名字漏读/误识别不吞邻词，全免判不100%，空输入不提交。
```ts
expect(scoreShadowing('John lives in London.', 'JOHN lives in london', ['John','London']).accuracy).toBe(100)
expect(scoreShadowing('John lives in London.', 'John live in London', ['John','London']).accuracy).toBeLessThan(100)
```
- [ ] Run `D:/node.exe node_modules/vitest/vitest.mjs run src/lib/nce*.test.ts`确认新行为失败。
- [ ] 实现token归一化、明确contraction/number等价、有序对齐与有限免判段，提供可修正的名字标记。以原句位置存储，防止名单导致普通同拼写词全局豁免。
- [ ] 持久化按owner/module/range/mode，序列化写入防旧草稿回写；不改fsrsMain。保存首轮和重练分别展示，重新输入立即失效旧分数。失败不跳句。
- [ ] 实现两种模式、手机多行输入与composition保护，语音入口说明、原音控制、禁用“个人录音回放 · 待开发”，原句标注权限，课程和卡片入口。
- [ ] Run新增测试+lint+tsc；两阶段审查、整合浏览器375px与刷新、分支feature/新概念输入法跟读提交推送，PR以前置Task1为base。

## Task 3: 整合验收、生产发布与记忆

- [ ] Run `D:/node.exe node_modules/vitest/vitest.mjs run`、eslint、tsc、vite build，排除材料/音频/配置/截图的Git变化。
- [ ] 用隔离Playwright访客验收来源入口、错误重拼、正确等待、IME/笔记、设置刷新、上一词不重复、隐藏模式、免判/错词、暂停与保存错误、空态及手机宽度；只本机生产浏览器，不绕过既有线上浏览器限制。
- [ ] 复用scripts/deploy.ps1 -FrontendOnly的release-only备份，发布前实际空间核算和既有词库SHA快照；全发布文件SHA与HTTPS/相关页面JS身份一致才宣称上线。
- [ ] 更新规格/验收和分支说明，Git实际端点/PR验证，memoryctl prewrite→更新相关项目note→claim→closeout dry-run，历史脏变更不混提交。