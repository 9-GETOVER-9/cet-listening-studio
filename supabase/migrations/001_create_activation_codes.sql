-- ============================================================
-- 激活码表：存储100个邀请码
-- ============================================================
CREATE TABLE IF NOT EXISTS activation_codes (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,
  days        INTEGER NOT NULL DEFAULT 30,  -- 赠送天数
  used        BOOLEAN NOT NULL DEFAULT false,
  used_by     UUID,                          -- 使用者用户ID
  used_at     TIMESTAMPTZ,                   -- 使用时间
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ                    -- 过期时间（NULL=永不过期）
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_used ON activation_codes(used);

-- 启用 RLS
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- 所有人可读取未使用的码（前端验证用）
-- 只有服务端可更新
CREATE POLICY "Anyone can view unused codes for validation"
  ON activation_codes FOR SELECT
  USING (used = false);

CREATE POLICY "Service role can update codes"
  ON activation_codes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
