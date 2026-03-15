-- ============================================================
-- StockAI VN — MIGRATION (chạy nếu database đã có sẵn)
-- Chạy file này trong: Supabase > SQL Editor > New query
-- An toàn để chạy nhiều lần (idempotent)
-- ============================================================

-- ── 1. app_users: thêm is_active ─────────────────────────────
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ── 2. analyses: bỏ NOT NULL trên target_price / stop_loss ───
-- (code không luôn cung cấp giá trị này)
ALTER TABLE public.analyses ALTER COLUMN target_price DROP NOT NULL;
ALTER TABLE public.analyses ALTER COLUMN stop_loss    DROP NOT NULL;

-- ── 3. analysis_cache: rename result→data + thêm expires_at ──
-- Nếu bảng CŨ có cột 'result' (không có 'data', 'expires_at'):
DO $$
BEGIN
  -- Thêm cột data nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='analysis_cache' AND column_name='data'
  ) THEN
    -- Copy từ result nếu tồn tại, nếu không thì tạo rỗng
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='analysis_cache' AND column_name='result'
    ) THEN
      ALTER TABLE public.analysis_cache ADD COLUMN data JSONB;
      UPDATE public.analysis_cache SET data = result;
      ALTER TABLE public.analysis_cache ALTER COLUMN data SET NOT NULL;
    ELSE
      ALTER TABLE public.analysis_cache ADD COLUMN data JSONB NOT NULL DEFAULT '{}';
    END IF;
  END IF;

  -- Thêm expires_at nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='analysis_cache' AND column_name='expires_at'
  ) THEN
    ALTER TABLE public.analysis_cache ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '4 hours');
  END IF;

  -- Bỏ UNIQUE constraint trên symbol nếu có (code insert nhiều record cùng symbol)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='analysis_cache'
    AND constraint_type='UNIQUE'
    AND constraint_name LIKE '%symbol%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.analysis_cache DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema='public' AND table_name='analysis_cache'
      AND constraint_type='UNIQUE'
      AND constraint_name LIKE '%symbol%'
      LIMIT 1
    );
  END IF;
END $$;

-- Xoá cột result cũ (nếu có, sau khi đã copy sang data)
ALTER TABLE public.analysis_cache DROP COLUMN IF EXISTS result;

-- ── 4. Tạo bảng mới (nếu chưa có) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.optimize_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  result      JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.predictions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  style        TEXT NOT NULL,
  predictions  JSONB NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, style)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  subscription JSONB NOT NULL,
  user_id      UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Tắt RLS cho tất cả bảng ───────────────────────────────
-- App dùng custom JWT (không phải Supabase Auth) → auth.uid() = NULL → RLS chặn
ALTER TABLE public.app_users          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_cache     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimize_results   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY;

-- ── 6. Xoá policies cũ dùng auth.uid() (incompatible) ───────
DROP POLICY IF EXISTS "users_own_profile"   ON public.profiles;
DROP POLICY IF EXISTS "users_own_watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "users_own_portfolio" ON public.portfolio;
DROP POLICY IF EXISTS "users_own_trades"    ON public.trades;
DROP POLICY IF EXISTS "users_own_balance"   ON public.balance;
DROP POLICY IF EXISTS "users_own_analyses"  ON public.analyses;
DROP POLICY IF EXISTS "users_own_alerts"    ON public.alerts;

-- ── 7. Thêm indexes còn thiếu ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cache_expires    ON public.analysis_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_optimize_user    ON public.optimize_results(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user        ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_anonymous   ON public.push_subscriptions(anonymous_id);
