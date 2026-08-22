-- 给 profiles 表添加 active_session_id 字段，用于单设备登录限制
-- 新登录的设备会写入自己的 session ID，旧设备检测到不一致时自动登出

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS active_session_id text;
