# 邀请码系统部署

系统同时支持原有按天兑换码与一次性终身 Pro 码。前端不读取邀请码表；Edge Function 使用已验证的 Supabase 登录身份，数据库在单个事务内核销邀请码并更新会员资料。

## 部署

1. 确认 `profiles` 和 `activation_codes` 表已按历史 migration 建好。
2. 在目标 Supabase 项目的 SQL Editor 以管理员身份执行 `supabase/migrations/006_lifetime_invitation_codes.sql`。该 migration 新增终身标记、撤销客户端直接读写邀请码及修改会员字段的能力，并将新用户 60 天体验和邀请码兑换收口到数据库函数。
3. 管理员在 SQL Editor 执行 `supabase/generate_lifetime_invite_codes.sql`。默认生成 10 个高熵一次性终身码并显示在结果区。将结果私下保存；不要把实际邀请码提交到代码仓库或公开页面。
4. 从项目目录运行 `supabase functions deploy activate-code --project-ref <Supabase项目ID>` 和 `supabase functions deploy manage-activation-codes --project-ref <Supabase项目ID>`。前者供用户兑换；后者只允许管理员邮箱生成、查看和清理邀请码，管理页不再直接访问邀请码表。
5. 用专用测试账号验证：有效终身码兑换后 `profiles.is_pro=true`、`pro_expires_at IS NULL`、邀请码 `used=true`；再次兑换同一码必须失败。限时码应按原 `days` 延长且不会覆盖已有终身权益。

Edge Function 需要 Supabase 内置环境变量 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。服务角色密钥只留在 Supabase 服务端，不能放在网页环境变量、SQL 示例或公开仓库里。

## 邀请码字段

- `is_lifetime=true` 表示永久 Pro，兑换后会员到期时间为空。
- `is_lifetime=false` 使用 `days` 字段；若用户已有有效限时 Pro，则在原到期时间后续期。
- `expires_at` 是邀请码本身的兑换截止时间；为空表示兑换码本身不设截止日。
- 每个邀请码只能成功兑换一次；数据库原子更新可阻止并发重复领取。
- 客户端不能读取未用邀请码、伪造目标用户 ID 或直接写入 Pro 会员字段。
