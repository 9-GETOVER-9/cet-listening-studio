# 按发布范围备份与回退

`deploy.ps1 -FrontendOnly` 使用安装器的 `release-only` 模式。发布前独立备份 HTML、资产和服务工作线程，以及发布包将替换的既有 JSON；记录首次新增 JSON，在失败回退时移除这些新增文件。未发布的词库和音频保持原位。默认非 FrontendOnly 发布仍使用原有完整备份模式。

release-only 仅允许 data 下平铺的普通 JSON 文件，文件名须符合 ASCII 白名单；文件与目录冲突、嵌套数据、非 JSON、符号链接和非法发布包在切换前拒绝。回退时校验目标记录及独立备份文件，先写临时文件再替换已有 JSON。旧哈希资源保留，先发布资源，再切换 HTML 和服务工作线程。

空间预检保留原有守卫，计入展开包、独立备份、合并资产、资产回退副本、核心临时文件和 64 MiB 余量。release-only 额外计入最大旧目标 JSON 的回退临时副本；不能因为只发布一个新词库而省略这一项。没有通过清理旧备份或学习材料来释放空间。

验证命令：

```sh
bash scripts/test-server-install.sh
bash scripts/test-release-only-install.sh
```

新夹具需要 Python 3 创建真实 ZIP，Git Bash 下可通过 CET_TEST_PYTHON 指定已有 Python。夹具覆盖成功切换、独立备份、未改词库/音频、回退新增与已有 JSON、HTML 切换后服务工作线程失败、目录冲突和白名单拒绝。Linux 额外用 32 MiB 旧 JSON 在切换前复制失败处测量实际空间峰值；原完整备份夹具继续覆盖原流程。

2026-10-09：上述两组夹具在 Git Bash 和 Linux 隔离目录通过；PowerShell 打包夹具、167 项应用测试及 lint 通过，独立审查通过。使用已验收的生产构建发布雅思专区、阅读和原句标注；82 个发布文件服务器 SHA 一致，公网页面、相关 JS、阅读 JSON 身份检查通过，11 份既有词库 JSON 未改变。线上交互验收未替代本机生产浏览器验收，物理手机及真实账号仍待验证。
