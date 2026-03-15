-- ============================================================
-- StockAI VN — Supabase Schema
-- Chạy toàn bộ file này trong: Supabase > SQL Editor > New query
-- ============================================================

-- ── App Users (custom JWT auth — username + password) ─────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast username lookup
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);

-- ── Profiles (linked to auth.users) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  target_price    NUMERIC NOT NULL,
  stop_loss       NUMERIC NOT NULL,
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

-- ── Analysis Cache (shared, no user restriction) ──────────────
CREATE TABLE IF NOT EXISTS public.analysis_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL UNIQUE,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts          ENABLE ROW LEVEL SECURITY;
-- analysis_cache: NO RLS — shared cache, accessible server-side only

-- Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "users_own_profile"    ON public.profiles;
DROP POLICY IF EXISTS "users_own_watchlist"  ON public.watchlist;
DROP POLICY IF EXISTS "users_own_portfolio"  ON public.portfolio;
DROP POLICY IF EXISTS "users_own_trades"     ON public.trades;
DROP POLICY IF EXISTS "users_own_balance"    ON public.balance;
DROP POLICY IF EXISTS "users_own_analyses"   ON public.analyses;
DROP POLICY IF EXISTS "users_own_alerts"     ON public.alerts;

-- Each user can only read/write their own data
CREATE POLICY "users_own_profile"   ON public.profiles   FOR ALL USING (auth.uid() = id);
CREATE POLICY "users_own_watchlist" ON public.watchlist  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_portfolio" ON public.portfolio  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_trades"    ON public.trades     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_balance"   ON public.balance    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_analyses"  ON public.analyses   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_alerts"    ON public.alerts     FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile when user signs up
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Safe column migrations (add missing columns if table already exists)
-- ============================================================

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS is_active     BOOLEAN    NOT NULL DEFAULT true;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS triggered_at  TIMESTAMPTZ;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS condition     TEXT;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS target_price  NUMERIC;

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_watchlist_user   ON public.watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_user   ON public.portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_user      ON public.trades(user_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_user    ON public.analyses(user_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user      ON public.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_cache_symbol     ON public.analysis_cache(symbol);
