# StockAI VN — Phân Tích Chứng Khoán Việt Nam

Ứng dụng web phân tích chứng khoán Việt Nam chuyên nghiệp với AI. Dữ liệu thật từ TCBS API, khuyến nghị MUA/BÁN cụ thể.

## Tính Năng

- **Giá realtime** từ TCBS (tự động refresh 60s)
- **Biểu đồ nến** 90 ngày với SMA20/50, Bollinger Bands, RSI, MACD
- **Phân tích AI** (Claude claude-opus-4-5) với khuyến nghị MUA/BÁN, giá mục tiêu, cắt lỗ
- **Tin tức** từ CafeF với phân tích sentiment tự động
- **Danh mục ảo** 500 triệu VNĐ — mua/bán cổ phiếu, theo dõi lãi/lỗ
- **Cảnh báo giá** với browser notification
- **Công cụ**: Tính phí GD, tính lãi/lỗ, mô phỏng DCA, tính P/E, từ điển thuật ngữ

---

## Cài Đặt Nhanh

### 1. Clone & cài đặt

```bash
git clone <repo-url>
cd stockai-vn
npm install
```

### 2. Tạo file .env.local

```bash
cp .env.example .env.local
```

Điền các giá trị:

```env
CLAUDE_API_KEY=sk-ant-...
FINNHUB_KEY=                          # optional
NEXT_PUBLIC_SUPABASE_URL=             # optional
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # optional
```

> **Không có Supabase?** App vẫn chạy đầy đủ với localStorage. Supabase chỉ cần để đồng bộ dữ liệu đa thiết bị.

### 3. Lấy API Keys

**Claude API (bắt buộc):**
1. Vào [console.anthropic.com](https://console.anthropic.com) → API Keys
2. Tạo key mới → copy vào `CLAUDE_API_KEY`

**Finnhub (tùy chọn — tin tức quốc tế):**
1. Đăng ký tại [finnhub.io](https://finnhub.io/register)
2. Copy API key → điền vào `FINNHUB_KEY`

**Supabase (tùy chọn — đồng bộ đa thiết bị):**
1. Tạo project tại [supabase.com](https://supabase.com)
2. SQL Editor → chạy schema SQL bên dưới
3. Settings → API → copy URL và anon key

### 4. Chạy local

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)

---

## Supabase Schema (tùy chọn)

```sql
-- Watchlist
CREATE TABLE watchlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  symbol text NOT NULL,
  market text DEFAULT 'VN',
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- Portfolio
CREATE TABLE portfolio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  symbol text NOT NULL,
  qty numeric NOT NULL,
  avg_cost numeric NOT NULL,
  total_cost numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Lịch sử giao dịch
CREATE TABLE trades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  symbol text NOT NULL,
  type text NOT NULL,
  qty numeric NOT NULL,
  price numeric NOT NULL,
  fee numeric NOT NULL,
  tax numeric DEFAULT 0,
  total numeric NOT NULL,
  traded_at timestamptz DEFAULT now()
);

-- Lịch sử phân tích AI
CREATE TABLE analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  symbol text NOT NULL,
  recommendation text NOT NULL,
  confidence int,
  target_price numeric,
  stop_loss numeric,
  full_result jsonb NOT NULL,
  analyzed_at timestamptz DEFAULT now()
);

-- Cảnh báo giá
CREATE TABLE alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  symbol text NOT NULL,
  condition text NOT NULL,
  target_price numeric NOT NULL,
  is_active boolean DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Balance
CREATE TABLE balance (
  user_id text PRIMARY KEY,
  cash numeric DEFAULT 500000000,
  updated_at timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance ENABLE ROW LEVEL SECURITY;

-- Policies (app dùng localStorage user_id, không dùng Supabase Auth)
CREATE POLICY "Allow all" ON watchlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON portfolio FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON analyses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON balance FOR ALL USING (true) WITH CHECK (true);
```

---

## Deploy lên Vercel

```bash
npm install -g vercel
vercel login
vercel
```

Hoặc import từ GitHub tại [vercel.com/new](https://vercel.com/new).

**Thêm Environment Variables trên Vercel:**
- Dashboard → Project → Settings → Environment Variables
- Thêm: `CLAUDE_API_KEY`, `FINNHUB_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

```bash
vercel --prod
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router |
| Language | TypeScript strict |
| Styling | Tailwind CSS v3 |
| Charts | Lightweight Charts (TradingView) |
| AI | Claude claude-opus-4-5 |
| Data VN | TCBS API (miễn phí) |
| Data QT | Finnhub API (free tier) |
| Tỷ giá | ExchangeRate-API |
| Database | Supabase / localStorage |
| Deploy | Vercel |

---

## Lưu Ý

- Dữ liệu từ TCBS API chỉ để tham khảo, không phải tư vấn đầu tư
- Chi phí Claude API: ~$0.01-0.05 mỗi lần phân tích
- Danh mục ảo bắt đầu với 500 triệu VNĐ
