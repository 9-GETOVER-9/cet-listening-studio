# 原句标注修正 Implementation Plan
> 按用户授权在现有隔离工作区直接执行，使用 executing-plans 逐步验收。
**Goal:** 清楚表示词间连读以及完整短语范围。
**Architecture:** sentenceAnnotations.ts 提供精确范围与词间连接位置，AnnotatedSentence.tsx 以独立样式渲染发音和短语，专用CSS负责括线/弧线。所有消费者共同更新。
**Tech Stack:** React、TypeScript、Vitest、Playwright。
- [x] 添加截图push Silicon / Silicon Valley以及at_a bank只连at/a的渲染回归，观察缺少连接符的失败。
- [x] 抽取匹配范围（start/end/joins），保持annotateSentence既有返回形状与锁定逻辑。
- [x] 移除连读/短语碎片框，词间保留原空白并覆盖蓝色SVG弧线；短语所有片段统一琥珀底线并标出整体两端，弱读使用紫色底。
- [x] 同步设置/说明图例，运行定向、全套测试、lint、tsc及build。
- [x] 隔离本机浏览器验证375px重叠句、换行、开关、收藏和原音；更新5198预览，保存私有截图。
- [x] 只提交本次源码/测试/文档到原分支，不部署；记录项目记忆与已知实测边界。