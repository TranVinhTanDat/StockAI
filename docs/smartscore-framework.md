# SmartScore — Bộ Tiêu Chí Phân Tích Chuẩn
## (Tương đương "prompt" cho hệ thống thuật toán)

---

## 1. DỮ LIỆU ĐẦU VÀO (đã tích hợp)

| Nhóm | Dữ liệu | Nguồn |
|---|---|---|
| **Giá & khối lượng** | Giá, %thay đổi, OHLCV 220 ngày | VPS API |
| **Kỹ thuật** | SMA20/50/200, RSI14, MACD, BB, ADX/DMI, ATR | Tính từ OHLCV |
| **Hỗ trợ/Kháng cự** | Swing high/low 60 ngày, Fibonacci | Tính từ OHLCV |
| **Cơ bản** | P/E, P/B, ROE, ROA, EPS, biên LN | Simplize API |
| **Tăng trưởng** | Doanh thu YoY, Lợi nhuận YoY (kế hoạch vs thực tế) | CafeF |
| **EPS theo quý** | 8 quý gần nhất (gia tốc/giảm tốc LN) | CafeF ChiSoTaiChinh |
| **Dòng tiền ngoại** | NN mua/bán ròng, room còn lại | VPS API |
| **Tin tức** | 12-15 tin gần nhất + sentiment score | CafeF + Vietcap |
| **VN-Index** | Trend 30 ngày, RSI VN-Index | VPS History API |

---

## 2. ĐIỂM SỐ 3 CHIỀU (0-100 mỗi chiều)

### 2.1 Kỹ Thuật (30% trọng số)

| Chỉ số | Điểm tối đa | Tín hiệu tốt nhất |
|---|---|---|
| Xu hướng (SMA) | 20 | Giá > SMA20 > SMA50 > SMA200 |
| RSI(14) | 15 | RSI 40-65 (bullish zone) hoặc <30 (oversold = cơ hội) |
| MACD | 15 | Golden Cross hoặc histogram mở rộng dương |
| Bollinger Bands | 10 | Giá tại BB dưới (oversold) |
| ADX/DMI | 10 | ADX>25 + DI+>DI- (uptrend mạnh) |
| Khối lượng | 15 | Khối lượng cao + giá tăng (xác nhận) |
| Momentum | 15 | Momentum 1T/3T dương, outperform VN-Index |

**Quy tắc đặc biệt:**
- RSI < 30: KHÔNG phạt điểm nặng → đây là cơ hội kỹ thuật
- ADX < 20: sideway → giảm trọng số kỹ thuật, tăng trọng fundamentals
- MACD Death Cross: -5 điểm penalty
- Giá < SMA200: downtrend dài hạn → cần fundamental mạnh để bù đắp

### 2.2 Cơ Bản (40% trọng số)

| Chỉ số | Điểm tối đa | Tiêu chí tốt |
|---|---|---|
| Định giá P/E | 20 | P/E < trung bình ngành × 0.8 |
| Sinh lời ROE | 20 | ROE > min ngành (15-20% tùy ngành) |
| ROA | 10 | ROA > min ngành |
| Tăng trưởng LN | 20 | Profit growth > 15% YoY |
| Nợ/Vốn | 10 | D/E < max ngành |
| Chất lượng LN | 10 | Profit growth > Revenue growth (biên LN mở rộng) |
| EPS trend | 10 | EPS tăng tốc qua các quý |

**Điểm đặc biệt:**
- PEG < 1: thêm 5 điểm (rẻ so tăng trưởng)
- EPS 8 quý liên tục tăng: thêm 5 điểm
- Kế hoạch KD vượt >110%: thêm 5 điểm

### 2.3 Tâm Lý & Dòng Tiền (30% trọng số)

| Chỉ số | Điểm tối đa | Tiêu chí tốt |
|---|---|---|
| Tin tức sentiment | 25 | Sentiment > 60/100 |
| Dòng tiền ngoại | 25 | NN mua ròng liên tục |
| Vị trí 52W | 20 | Giá ở 40-70% vùng 52W (không quá cao/thấp) |
| VN-Index trend | 20 | VN-Index uptrend, RSI < 70 |
| Relative Strength | 10 | Stock outperform VN-Index 30 ngày |

---

## 3. QUY TẮC KHUYẾN NGHỊ

### Điểm → Khuyến nghị ban đầu
```
≥ 78: MUA MẠNH
60-77: MUA
46-59: GIỮ
32-45: BÁN
< 32:  BÁN MẠNH
```

### Guard Rules (ưu tiên cao hơn điểm số)

**BÁN Guard (chống BÁN sai):**
- BÁN → GIỮ nếu KHÔNG có: (ADX≥25 downtrend) VÀ (fundamental xấu) VÀ (tin xấu)
- BÁN → GIỮ nếu fundamental tốt (fund≥58) + profit growth ≥ 0 + sentiment ≥ 42

**GIỮ → BÁN Downgrade:**
- Khi: ADX≥25 confirmed bear + fund<50 + P/E vượt max ngành 25% + RSI≥38
- Đây là PLX-type: kỹ thuật phá vỡ + định giá đắt + cơ bản yếu

**GIỮ → MUA Upgrade (3 con đường):**
1. Fund≥60 + profit growth≥10% + sentiment≥40 + không phải extreme downtrend
2. RSI<38 (deep oversold) + fund≥47 + có lãi + định giá OK
3. NN mua ròng mạnh + MACD acceleration + sentiment≥60

**MUA → GIỮ Downgrade:**
- Tech≥65 + Sent≥65 nhưng fundamental yếu + profit growth = 0 → "chờ xác nhận kết quả"

---

## 4. CÁC KỊCH BẢN ĐẶC BIỆT

### Kịch bản A: Giá giảm sâu (>20% từ đỉnh)
```
NẾU fundamental TỐT (ROE>12%, EPS tăng, P/E thấp so ngành):
  → GIỮ hoặc MUA (value opportunity)
  → Đây là cơ hội tích lũy, KHÔNG phải tín hiệu bán

NẾU fundamental XẤU (lỗ, nợ cao, ROE<8%, EPS giảm liên tiếp):
  → BÁN (structural breakdown, không phải temporary dip)
  → "Bẫy giá rẻ" — giá rẻ nhưng doanh nghiệp đang suy yếu

NẾU chưa rõ (fundamental neutral, giảm theo thị trường):
  → GIỮ, chờ Q tiếp theo để xác nhận
```

### Kịch bản B: RSI < 30 (quá bán kỹ thuật)
```
→ KHÔNG tự động BÁN chỉ vì giá thấp
→ Kiểm tra fundamental:
  - Fundamental tốt: GIỮ + confidence cao (recovery thesis)
  - Fundamental xấu: BÁN (RSI oversold là "dead cat bounce" risk)
→ Entry zone: bao gồm giá hiện tại (mua dần ngay, không chờ)
→ Confidence: cộng thêm 8 điểm (tạm thời dip)
```

### Kịch bản C: Thị trường chung giảm (VN-Index -5%+ trong 30 ngày)
```
→ Bear market regime → giảm điểm sentiment ~8 điểm tự động
→ Ngưỡng MUA → GIỮ: hạ từ 44 xuống 40 (bù đắp market drag)
→ Chỉ MUA MẠNH khi mã thực sự nổi bật về fundamental
→ Ưu tiên: GIỮ tiền mặt hoặc mã phòng thủ (ngân hàng, điện, tiêu dùng)
```

### Kịch bản D: Sideway (ADX < 20)
```
→ Không có xu hướng rõ → GIỮ chờ breakout
→ Fundamental quyết định: tốt = GIỮ với target breakout, xấu = BÁN
→ Mục tiêu: kháng cự gần nhất
→ Cắt lỗ: dưới hỗ trợ mạnh nhất
```

### Kịch bản E: Uptrend mạnh (ADX > 25, DI+ > DI-)
```
→ MUA nếu fundamental không quá xấu (không mua cổ phiếu tệ dù kỹ thuật đẹp)
→ Mục tiêu: kháng cự kỹ thuật tiếp theo
→ Trailing stop: di chuyển stop lên theo giá (bảo vệ lợi nhuận)
```

---

## 5. TÍNH TOÁN MỤC TIÊU & CẮT LỖ

### Mục Tiêu (Target Price)
```
Bước 1: Kháng cự kỹ thuật × 0.98 (nếu upside 3-30%)
Bước 2: Nếu không có kháng cự rõ → EPS × P/E ngành (fair value)
         → MUA MẠNH: nếu fair value > target KT, dùng fair value (upside tối đa 50%)
         → MUA: tương tự, upside tối đa 40%
         → GIỮ fund tốt: tối đa 22% upside | GIỮ neutral: tối đa 13%
Bước 3: Đảm bảo upside vs downside ≥ 1.5:1 (R:R ratio)
```

### Cắt Lỗ (Stop Loss)
```
MUA MẠNH / MUA:
  - Ưu tiên: dưới hỗ trợ mạnh × 1-2.5% (ATR-based buffer)
  - Tối thiểu: 4% dưới giá hiện tại (tránh quá sát)
  - Tối đa: 8% dưới giá hiện tại (risk management)

GIỮ:
  - Dưới hỗ trợ gần nhất, buffer nhỏ (0.7-2%)
  - Minimum: 4% dưới giá (với RSI<35 oversold)
  - Tiêu chuẩn: 4-6% dưới giá

BÁN:
  - Stop = ngưỡng kháng cự gần nhất + 1.5% (nếu giá vượt lên → luận điểm vô hiệu)
  - Hard cap: tối đa 9% trên giá hiện tại
  - Tối thiểu: 4% trên giá (tránh quá sát)
```

### Vào Lệnh (Entry Zone)
```
MUA MẠNH: [hỗ trợ SMA20 hoặc kỹ thuật, giá + 1%]
  → Mua ngay hoặc trên dips nhỏ (<10%)

MUA: [hỗ trợ tốt nhất (SMA20/SMA50/kháng cự cũ), giá hiện tại]
  → Mua trên dips, không đuổi giá lên cao

GIỮ (RSI<35 = oversold): [hỗ trợ sâu, giá + 0.3%]
  → Tích lũy ngay vì đã oversold, không cần chờ pullback

GIỮ thông thường: [vùng hỗ trợ gần nhất ± 2.5%]
  → Chỉ mua thêm khi về đúng support, không mua ở giá hiện tại

BÁN/BÁN MẠNH: [fair value sâu = EPS × peMax × 0.55]
  → Vùng giá có thể mua lại sau khi đã bán xong
```

---

## 6. ĐỘ TIN CẬY (Confidence Score)

```
Base = Overall Score (0-100)
+ Alignment bonus: +3 nếu 3 chiều đồng thuận (stdDev < 10)
+ Fund conviction: MUA + fund≥50 → +(fund-50)×0.8 (value plays)
+ Oversold bonus: RSI<35 + GIỮ/MUA → +8 điểm
- Divergence penalty: tech vs fund/sent chênh >20 → -6 điểm
- GIỮ với fund tốt (≥60) + tech yếu (<45): giảm penalty ×0.4 (không phạt nặng recovery)

Label:
  ≥ 70: CAO
  52-69: TRUNG BÌNH
  < 52: THẤP
```

---

## 7. THỜI GIAN NẮM GIỮ

| Khuyến nghị | Điều kiện | Thời gian |
|---|---|---|
| MUA MẠNH | Score ≥ 75 | 3-6 tháng |
| MUA | Score ≥ 60 | 1-3 tháng |
| MUA | Profit growth ≥ 25% | 3-6 tháng |
| MUA | Bình thường | 1-3 tháng |
| GIỮ | Fund ≥ 60 (FPT-type) | 3-6 tháng |
| GIỮ | Fund < 60 | 1-2 tháng |
| BÁN/BÁN MẠNH | Bất kỳ | Không khuyến nghị |

---

## 8. NGUYÊN TẮC VÀNG

1. **Giá giảm ≠ BÁN** — luôn kiểm tra WHY giá giảm trước
2. **RSI oversold ≠ BÁN** — thường là cơ hội nếu fundamental tốt
3. **Giá cao ≠ MUA** — kiểm tra P/E so ngành, tránh "đuổi giá"
4. **Fundamental là neo** — kỹ thuật dự báo ngắn hạn, fundamental quyết định dài hạn
5. **R:R ≥ 1.5:1** — không vào lệnh nếu reward/risk kém
6. **Không suy diễn** — N/A là N/A, không đoán mò
7. **Ngành matter** — ngân hàng D/E cao là bình thường; tech cần ROE cao hơn
8. **Dòng tiền ngoại** — NN mua ròng liên tục = tín hiệu mạnh nhất tại TTCK VN
