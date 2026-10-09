# 原句标注 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. User has authorized inline execution.

**Goal:** 在四六级、新概念的学习和复习原句中可选择显示连读、弱读及短语。

**Architecture:** 纯函数负责将 AIAnalysis 转为保留原句的片段；共享 React 组件负责颜色、图例和可选单词收藏；Zustand 持久化总开关及三个子开关。两个卡片页面共用组件，并传入现有解析权限。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Zustand persist, Vitest, Playwright CLI.

---

### Task 1: 匹配与设置

Files: src/lib/sentenceAnnotations.ts / .test.ts, src/store/settingsStore.ts, src/store/sentenceAnnotationSettings.test.ts.

- [ ] 先写匹配、无损原句、下划线/音标/箭头格式、单词边界、重复及重叠测试。例：`expect(parts.map(p => p.text).join('')).toBe(text)`；`to` 不应命中 `today`。
- [ ] `D:\node.exe node_modules/vitest/vitest.mjs run src/lib/sentenceAnnotations.test.ts src/store/sentenceAnnotationSettings.test.ts` 确认新功能缺失导致失败。
- [ ] 实现 `annotateSentence(text, analysis, options, unlocked = true)`，返回 `Array<{text: string; annotations: SentenceAnnotation[]}>`，用原字符串位置切片保留空格，完整 token 窗口匹配。
- [ ] 添加 `sentenceAnnotations: {enabled:true, linking:true, weak:true, phrases:true}` 和 `setSentenceAnnotationSetting(key,value)`；persist 合并旧值时补齐字段，只接受 boolean。
- [ ] 重跑上述测试，全部通过。

### Task 2: 共享显示与页面接入

Files: src/components/AnnotatedSentence.tsx / .test.tsx, src/pages/CardFlash.tsx, src/pages/Review.tsx, src/pages/Profile.tsx.

- [ ] 先写服务端渲染测试：锁定隐藏标注、关闭恢复纯文本、重叠有两层提示、收藏控件保留、HTML 转义。
- [ ] 新建 `AnnotatedSentence`：读取设置、调用 annotateSentence，连读蓝/弱读紫/短语绿，重叠用绿色下划线，图例有文字。可选 `onWordClick(word,event)` 保留学习页点击收藏和事件隔离。
- [ ] CardFlash/Review 原 English 段落替换为共享组件，传 `unlocked={canViewAi || Boolean(currentCard.aiUnlocked)}`。CardFlash 传现有收藏逻辑；前面与拼接选句列表保持原状。
- [ ] Profile 设置增加总开关及 linking/weak/phrases 子开关，`role="switch" aria-checked={value}`，总关闭时禁用子开关但不清除选择。
- [ ] 完成定向测试与 TypeScript 检查。

### Task 3: 验证、交付

- [ ] 独立访客浏览器验证学习、复习、设置刷新、收藏、解析锁定和 375px 无溢出；截图存 output/playwright。
- [ ] `D:\node.exe node_modules/vitest/vitest.mjs run`、`D:\node.exe node_modules/eslint/bin/eslint.js .`、`D:\node.exe node_modules/typescript/bin/tsc -b`、`D:\node.exe node_modules/vite/bin/vite.js build` 全通过。
- [ ] 审阅完整 diff，只提交本功能文件；更新原本机预览对应源码并重新构建，素材不纳入 Git。
- [ ] 更新相关共享项目记忆，执行 memoryctl prewrite、claim 和 closeout --dry-run；只处理本会话文件。
