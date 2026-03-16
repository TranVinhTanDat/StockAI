-- ============================================================
-- StockAI VN — Supabase Schema (v2 — synced with codebase)
-- Chạy toàn bộ file này trong: Supabase > SQL Editor > New query
-- ============================================================

-- ── App Users (custom JWT auth — username + password) ─────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);

-- ── Watchlist ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlist (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL,
  symbol    TEXT NOT NULL,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- ── Portfolio ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  symbol      TEXT NOT NULL,
  qty         NUMERIC NOT NULL DEFAULT 0,
  avg_cost    NUMERIC NOT NULL DEFAULT 0,
  total_cost  NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- ── Trades ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  symbol     TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  qty        NUMERIC NOT NULL,
  price      NUMERIC NOT NULL,
  fee        NUMERIC NOT NULL DEFAULT 0,
  tax        NUMERIC NOT NULL DEFAULT 0,
  total      NUMERIC NOT NULL,
  traded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Balance ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.balance (
  user_id     UUID PRIMARY KEY,
  cash        NUMERIC NOT NULL DEFAULT 500000000,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Analyses (user's personal history) ───────────────────────
CREATE TABLE IF NOT EXISTS public.analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  symbol          TEXT NOT NULL,
  recommendation  TEXT NOT NULL,
  confidence      NUMERIC NOT NULL,
  target_price    NUMERIC,
  stop_loss       NUMERIC,
  full_result     JSONB NOT NULL,
  analyzed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Alerts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  symbol        TEXT NOT NULL,
  condition     TEXT NOT NULL CHECK (condition IN ('ABOVE', 'BELOW')),
  target_price  NUMERIC NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  triggered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Analysis Cache (shared server-side cache) ─────────────────
-- NOTE: column 'data' (not 'result'), 'expires_at' required — matches analyze/route.ts
CREATE TABLE IF NOT EXISTS public.analysis_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL,
  data        JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Optimize Results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.optimize_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  result      JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Predictions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.predictions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  style        TEXT NOT NULL,
  predictions  JSONB NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, style)
);

-- ── Push Subscriptions (Web Push API) ────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  subscription JSONB NOT NULL,
  user_id      UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: DISABLED — App uses service_role key on server.
-- Custom JWT auth is NOT Supabase Auth → auth.uid() = NULL → RLS blocks.
-- All writes go through API routes with service_role key.
-- ============================================================
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

-- ============================================================
-- GRANT permissions for anon key (client-side browser access)
-- Required because tables are created via SQL, not Supabase dashboard
-- Without these, anon key gets 406 Not Acceptable on all queries
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_cache     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.optimize_results   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO anon, authenticated;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_watchlist_user    ON public.watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_user    ON public.portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_user       ON public.trades(user_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_user     ON public.analyses(user_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user       ON public.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_cache_symbol      ON public.analysis_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_cache_expires     ON public.analysis_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_optimize_user     ON public.optimize_results(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user  ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user         ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_anonymous    ON public.push_subscriptions(anonymous_id);
