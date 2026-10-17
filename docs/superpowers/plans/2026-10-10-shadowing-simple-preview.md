# 新概念简洁预览 Implementation Plan

> 本轮在现有功能工作区直接执行，按用户指定第三图制作可审阅的一版。

**Goal:** 明确阅读结果颜色，并把新概念跟读精简为适合手机的原句与输入气泡。

**Architecture:** 继续复用现有会话、存储、原音与比较逻辑。NCEPracticePanel 负责原句、折叠翻译/解析与结果；NCEShadowing 负责输入、播放、设置及切换，专用 CSS 不影响其他页面。

**Tech Stack:** React / TypeScript / Tailwind / Vitest / Playwright CLI。

## 阅读结果

- [x] 在 IELTSReadingSession.test.tsx 构造已揭示题目：正确已选、正确漏选、错误已选、未选干扰项。断言漏选行含红色而非绿色。
- [x] 运行该测试，观察当前漏选为绿色的失败。
- [x] 修改 IELTSReadingSession.tsx：`missed || wrong` 优先红色，已选正确使用 emerald-100 加深背景与边框；保留原标签和评分逻辑。
- [x] 定向测试后提交到原阅读分支，依次正向合并到已有依赖分支。

## 新概念简洁页

- [x] NCEPracticePanel.test.tsx 增加默认标注、默认翻译折叠、缺漏红色回归；运行并观察失败。
- [x] NCEPracticePanel.tsx 增加原音插槽、原文/翻译/解析按钮，默认可访问标注，错误/缺漏同用红色；沿用隐藏和权限限制。
- [x] NCEShadowing.tsx 移除计时 effect 和每日统计查询；练习范围/音频设置折叠，输入框缩为 3 行，底部三个主要动作，保留保存保护和 IME 禁用。
- [x] src/styles/nceShadowing.css 仅作用于 nce-shadowing，使用白卡、浅蓝输入气泡、圆角按钮和手机安全区。
- [x] 定向与整套测试、lint、TypeScript、build 通过。
- [x] 用隔离浏览器验收真实原句标注/播放/输入/核对/重练、隐藏与翻译、漏选红色、375px 布局及输入聚焦（物理手机键盘未实测）；保存截图到忽略目录。
- [x] 原分支提交源码，完成独立审查；本机预览提供用户查看后再决定上线。
