'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

const TERMS = [
  { term: 'P/E (Price to Earnings)', def: 'Tỷ số giá trên lợi nhuận mỗi cổ phiếu. P/E cao = kỳ vọng tăng trưởng cao hoặc đang bị định giá cao. P/E ngành VN TB khoảng 12-18x.' },
  { term: 'EPS (Earnings Per Share)', def: 'Lợi nhuận sau thuế chia cho số cổ phiếu đang lưu hành. Chỉ số đo hiệu quả sinh lời trên mỗi cổ phiếu.' },
  { term: 'ROE (Return on Equity)', def: 'Tỷ suất lợi nhuận trên vốn chủ sở hữu. ROE > 15% được xem là tốt. Ngân hàng VN thường ROE 15-25%.' },
  { term: 'ROA (Return on Assets)', def: 'Tỷ suất lợi nhuận trên tổng tài sản. Đánh giá hiệu quả sử dụng tài sản của doanh nghiệp.' },
  { term: 'MACD', def: 'Moving Average Convergence Divergence - Chỉ báo động lượng. MACD cắt Signal từ dưới lên = tín hiệu MUA.' },
  { term: 'RSI (Relative Strength Index)', def: 'Chỉ báo sức mạnh tương đối 0-100. RSI > 70 = quá mua, RSI < 30 = quá bán. Dùng RSI 14 ngày.' },
  { term: 'Bollinger Bands', def: 'Dải băng biến động gồm SMA ± 2 độ lệch chuẩn. Giá chạm BB Upper = kháng cự, BB Lower = hỗ trợ.' },
  { term: 'SMA (Simple Moving Average)', def: 'Đường trung bình động giản đơn. SMA20 = xu hướng ngắn hạn, SMA50 = xu hướng trung hạn.' },
  { term: 'EMA (Exponential Moving Average)', def: 'Đường trung bình động có trọng số, ưu tiên giá gần hơn SMA. Phản ứng nhanh hơn với biến động giá.' },
  { term: 'Volume (Khối lượng)', def: 'Số cổ phiếu được giao dịch trong phiên. Volume tăng khi giá tăng = xác nhận xu hướng tăng.' },
  { term: 'Market Cap', def: 'Vốn hóa thị trường = Giá cổ phiếu × Số cổ phiếu. HOSE: >5000 tỷ = Large Cap.' },
  { term: 'DCA (Dollar Cost Averaging)', def: 'Chiến lược đầu tư đều đặn một số tiền cố định theo định kỳ bất kể giá thị trường.' },
  { term: 'Stop Loss', def: 'Lệnh cắt lỗ tự động khi giá xuống đến mức cho phép. Bảo vệ tài khoản khỏi thua lỗ lớn. Thường đặt -7 đến -10%.' },
  { term: 'Take Profit', def: 'Chốt lời khi giá đạt mục tiêu. Kỷ luật quan trọng: chốt lời theo kế hoạch, không tham.' },
  { term: 'Kháng cự (Resistance)', def: 'Vùng giá mà áp lực bán mạnh, khó vượt qua. Khi vượt kháng cự = tín hiệu tăng mạnh.' },
  { term: 'Hỗ trợ (Support)', def: 'Vùng giá mà áp lực mua mạnh, khó xuyên thủng. Khi thủng hỗ trợ = tín hiệu giảm mạnh.' },
  { term: 'Thanh khoản', def: 'Khả năng mua/bán cổ phiếu dễ dàng không ảnh hưởng giá. Cổ phiếu thanh khoản cao an toàn hơn.' },
  { term: 'Margin Call', def: 'Yêu cầu nạp thêm tiền khi giá trị tài sản thế chấp xuống dưới mức tối thiểu khi dùng margin.' },
  { term: 'T+2', def: 'Quy định thanh toán: mua cổ phiếu hôm nay (T), nhận cổ phiếu sau 2 ngày làm việc (T+2).' },
  { term: 'Room nước ngoài', def: 'Tỷ lệ sở hữu tối đa của nhà đầu tư nước ngoài. Hết room = nước ngoài không mua thêm được.' },
  { term: 'Cổ tức', def: 'Phần lợi nhuận chia cho cổ đông. Cổ tức tiền mặt hoặc cổ phiếu. Ngày chốt quyền là ngày quan trọng.' },
  { term: 'Phát hành thêm', def: 'Doanh nghiệp phát hành thêm cổ phiếu mới. Thường làm pha loãng cổ phiếu hiện hữu.' },
  { term: 'Book Value', def: 'Giá trị sổ sách = Tổng tài sản - Nợ phải trả. P/B < 1 có thể là cơ hội mua dưới giá trị.' },
  { term: 'Beta', def: 'Độ nhạy cảm của cổ phiếu với thị trường. Beta > 1 = biến động mạnh hơn VN-Index.' },
  { term: 'Fibonacci', def: 'Các mức thoái lui 23.6%, 38.2%, 50%, 61.8%, 78.6%. Dùng để xác định vùng hỗ trợ/kháng cự tiềm năng.' },
  { term: 'Candlestick', def: 'Biểu đồ nến Nhật. Mỗi nến cho thấy giá Mở, Cao, Thấp, Đóng của một phiên giao dịch.' },
  { term: 'Bear Market', def: 'Thị trường gấu: chỉ số giảm >20% từ đỉnh. Xu hướng giảm dài hạn.' },
  { term: 'Bull Market', def: 'Thị trường bò: chỉ số tăng >20% từ đáy. Xu hướng tăng dài hạn.' },
  { term: 'Doji', def: 'Mẫu nến có giá mở và đóng gần nhau, thân rất nhỏ. Báo hiệu thị trường do dự, có thể đảo chiều.' },
  { term: 'Hammer', def: 'Nến búa: thân nhỏ trên, bóng dưới dài. Xuất hiện ở đáy giá = tín hiệu đảo chiều tăng.' },
  { term: 'Golden Cross', def: 'SMA20 cắt SMA50 từ dưới lên = tín hiệu mua mạnh trong phân tích kỹ thuật.' },
  { term: 'Death Cross', def: 'SMA20 cắt SMA50 từ trên xuống = tín hiệu bán mạnh trong phân tích kỹ thuật.' },
  { term: 'Drawdown', def: 'Mức sụt giảm từ đỉnh xuống đáy. Max Drawdown = mức giảm lớn nhất trong lịch sử.' },
  { term: 'Sharpe Ratio', def: 'Đo lợi nhuận điều chỉnh theo rủi ro. Sharpe > 1 là tốt, > 2 là rất tốt.' },
  { term: 'Thoái lui', def: 'Điều chỉnh giá ngắn hạn ngược chiều xu hướng chính. Cơ hội mua trong xu hướng tăng.' },
]

export default function Glossary() {
  const [search, setSearch] = useState('')

  const filtered = TERMS.filter(
    (t) =>
      t.term.toLowerCase().includes(search.toLowerCase()) ||
      t.def.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Từ Điển Thuật Ngữ ({TERMS.length} thuật ngữ)</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm thuật ngữ..."
          className="input-dark w-full pl-10 text-sm"
        />
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map((t) => (
          <div key={t.term} className="bg-surface2 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-accent mb-0.5">{t.term}</p>
            <p className="text-xs text-gray-300 leading-relaxed">{t.def}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted text-sm py-4">Không tìm thấy thuật ngữ</p>
        )}
      </div>
    </div>
  )
}
