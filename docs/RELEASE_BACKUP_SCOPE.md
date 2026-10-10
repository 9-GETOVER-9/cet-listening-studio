# 按发布范围备份与回退

`deploy.ps1 -FrontendOnly` 使用安装器的 `release-only` 模式。发布前独立备份 HTML、资产和服务工作线程，以及发布包将替换的既有 JSON；记录首次新增 JSON，在失败回退时移除这些新增文件。未发布的词库和音频保持原位。默认非 FrontendOnly 发布仍使用原有完整备份模式。

release-only 仅允许 data 下平铺的普通 JSON 文件，文件名须符合 ASCII 白名单；文件与目录冲突、嵌套数据、非 JSON、符号链接和非法发布包在切换前拒绝。回退时校验目标记录及独立备份文件，先写临时文件再替换已有 JSON。旧哈希资源保留，先发布资源，再切换 HTML 和服务工作线程。

空间预检保留原有守卫，计入展开包、独立备份、合并资产、资产回退副本、核心临时文件和 64 MiB 余量。release-only 额外计入最大旧目标 JSON 的回退临时副本；不能因为只发布一个新词库而省略这一项。没有通过清理旧备份或学习材料来释放空间。

验证命令：

```sh
bash scripts/test-server-install.sh
bash scripts/test-release-only-install.sh
bash scripts/test-static-release-install.sh
```

新夹具需要 Python 3 创建真实 ZIP，Git Bash 下可通过 CET_TEST_PYTHON 指定已有 Python。夹具覆盖成功切换、独立备份、未改词库/音频、回退新增与已有 JSON、HTML 切换后服务工作线程失败、目录冲突和白名单拒绝。Linux 额外用 32 MiB 旧 JSON 在切换前复制失败处测量实际空间峰值；原完整备份夹具继续覆盖原流程。

2026-10-09：上述两组夹具在 Git Bash 和 Linux 隔离目录通过；PowerShell 打包夹具、167 项应用测试及 lint 通过，独立审查通过。使用已验收的生产构建发布雅思专区、阅读和原句标注；82 个发布文件服务器 SHA 一致，公网页面、相关 JS、阅读 JSON 身份检查通过，11 份既有词库 JSON 未改变。线上交互验收未替代本机生产浏览器验收，物理手机及真实账号仍待验证。

根目录静态资源采用明确名单：favicon.svg、icon-192.svg、icon-512.svg、icons.svg、landing.html、wechat-pay.jpg。名单统一用于普通文件校验、独立备份、原子发布、回退和空间核算，避免页面更新后图标或落地页仍为旧文件。新备份写入 `.static-resources` 标识；没有此标识的历史完整备份不推断静态文件原先不存在，因此回退旧备份不会删除现有图标。新增夹具覆盖两种范围的成功、切换失败、静态目录拒绝及历史备份兼容。

2026-10-10：Windows checkout 的 CRLF 使安装器 shebang 被解析为 bash\r，首次启动退出127且未进入安装。仓库现固定 `*.sh text eol=lf`，已将安装器转为LF并完成本次前端发布。release-only 空间预检95394KiB通过，备份cet-listening-20261010-145645-XDYilj；90个发布文件服务器SHA一致，31项HTTPS身份核验通过，14份既有JSON保持发布前值，发布不含音频或词库。业务构建源7bab212，本次含简洁跟读与原句连接/短语括线改版。
