# 邀请码系统部署指南

## 概览

本项目的邀请码系统由两部分组成：

- 数据表和邀请码数据：`app/supabase/migrations/001_create_activation_codes.sql`、`app/supabase/100_invitation_codes.sql`
- Edge Function：`app/supabase/functions/activate-code/index.ts`

邀请码格式为 `INV-XXXX-XXXX`。
当前脚本已改为可重复执行：再次导入邀请码时会自动跳过已存在的 `code`。

## 正确部署方式

### 1. 创建或校验数据表

在 Supabase SQL Editor 中执行：

```sql
CREATE TABLE IF NOT EXISTS activation_codes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  days INTEGER NOT NULL DEFAULT 30,
  used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_used ON activation_codes(used);
```

如果历史表结构里还有额外的 `NOT NULL` 字段，例如 `type`，请先修正后再导入邀请码。

### 2. 导入邀请码

在 Supabase SQL Editor 中执行 `app/supabase/100_invitation_codes.sql`。

这个脚本现在使用 `ON CONFLICT (code) DO NOTHING`，所以重复执行不会因为重复主键而失败。

### 3. 用 CLI 部署 Edge Function

Edge Function 不要再依赖 Dashboard 在线编辑。以仓库本地文件为准，并使用 Supabase CLI 部署。

```bash
cd "D:\桌面\Listen Launch sss\app"
supabase functions deploy activate-code
```

### 4. 校验环境变量

`activate-code` 依赖 Supabase 系统内置环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

不要再使用旧的 `SERVICE_ROLE_KEY` 名称。

## 验证方法

### 检查可用邀请码数量

```sql
SELECT COUNT(*) FROM activation_codes WHERE used = false;
```

### 检查已使用的邀请码

```sql
SELECT code, used_by, used_at
FROM activation_codes
WHERE used = true
ORDER BY used_at DESC;
```

### 验证函数是否已部署

部署后在 Supabase Dashboard 的 Edge Functions 页面确认：

- 函数名为 `activate-code`
- 最新部署版本已更新
- 日志中没有 `SUPABASE_SERVICE_ROLE_KEY` 缺失、profile 更新失败等错误

## 推荐操作顺序

1. 先执行 migration / 建表 SQL。
2. 再导入 `100_invitation_codes.sql`。
3. 最后用 CLI 部署 `activate-code`。
4. 用测试账号兑换一个邀请码，确认 `profiles.is_pro` 和 `pro_expires_at` 已更新。

## 备注

- `checkOnly: true` 仅做邀请码有效性校验，不消耗邀请码。
- 真正兑换时，函数会先占用邀请码，再更新用户资料；如果资料更新失败，会回滚邀请码状态。
- 前端注册流程应先验证邀请码，再允许创建新用户。
