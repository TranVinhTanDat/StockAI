import nodemailer from 'nodemailer'

let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  }
  return _transporter
}

const FROM = `StockAI VN <${process.env.GMAIL_USER || 'noreply@gmail.com'}>`

export async function sendAlertEmail(
  to: string,
  data: {
    symbol: string
    condition: 'ABOVE' | 'BELOW'
    targetPrice: number
    currentPrice: number
  }
): Promise<void> {
  const { symbol, condition, targetPrice, currentPrice } = data
  const direction = condition === 'ABOVE' ? 'vượt ngưỡng' : 'xuống dưới ngưỡng'
  const conditionText = condition === 'ABOVE' ? '▲ Vượt trên' : '▼ Xuống dưới'
  const color = condition === 'ABOVE' ? '#22c55e' : '#ef4444'

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: `[StockAI VN] ${symbol} đã ${direction} ngưỡng cảnh báo!`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:480px;margin:32px auto;background:#1a1d27;border:1px solid #2d3142;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#00d4aa22,#00d4aa11);padding:28px 28px 20px;border-bottom:1px solid #2d3142">
    <div style="font-size:22px;font-weight:700;color:#00d4aa">📈 StockAI VN</div>
    <div style="font-size:13px;color:#8892a4;margin-top:4px">Cảnh báo giá đã kích hoạt</div>
  </div>
  <div style="padding:28px">
    <div style="background:#0f1117;border:1px solid #2d3142;border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:28px;font-weight:800;color:#f1f5f9">${symbol}</span>
        <span style="background:${color}22;color:${color};border:1px solid ${color}44;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">${conditionText}</span>
      </div>
      <div style="color:#8892a4;font-size:13px;margin-bottom:8px">
        Ngưỡng cảnh báo: <strong style="color:#f1f5f9">${(targetPrice * 1000).toLocaleString('vi-VN')}₫</strong>
      </div>
      <div style="color:#8892a4;font-size:13px">
        Giá hiện tại: <strong style="color:${color};font-size:18px">${(currentPrice * 1000).toLocaleString('vi-VN')}₫</strong>
      </div>
    </div>
    <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://stockaivn.vercel.app'}"
       style="display:block;text-align:center;background:#00d4aa;color:#0f1117;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
      Xem chi tiết trên StockAI VN →
    </a>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #2d3142;text-align:center">
    <p style="font-size:11px;color:#4a5568;margin:0">Email này được gửi tự động từ StockAI VN. Không trả lời email này.</p>
  </div>
</div>
</body>
</html>`,
  })
}

export async function sendOtpEmail(to: string, otp: string, username: string): Promise<void> {
  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: `[StockAI VN] Mã OTP đặt lại mật khẩu: ${otp}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:480px;margin:32px auto;background:#1a1d27;border:1px solid #2d3142;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#00d4aa22,#00d4aa11);padding:28px 28px 20px;border-bottom:1px solid #2d3142">
    <div style="font-size:22px;font-weight:700;color:#00d4aa">📈 StockAI VN</div>
    <div style="font-size:13px;color:#8892a4;margin-top:4px">Yêu cầu đặt lại mật khẩu</div>
  </div>
  <div style="padding:28px">
    <p style="color:#c9d1d9;font-size:14px;margin:0 0 20px">
      Xin chào <strong style="color:#f1f5f9">${username}</strong>,<br><br>
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Dùng mã OTP bên dưới:
    </p>
    <div style="background:#0f1117;border:2px dashed #00d4aa44;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
      <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#00d4aa;font-family:monospace">${otp}</div>
      <div style="font-size:12px;color:#8892a4;margin-top:8px">Mã có hiệu lực trong <strong style="color:#f1f5f9">10 phút</strong></div>
    </div>
    <div style="background:#ef444411;border:1px solid #ef444422;border-radius:8px;padding:12px;margin-bottom:20px">
      <p style="font-size:12px;color:#fca5a5;margin:0">
        ⚠️ Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.
      </p>
    </div>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #2d3142;text-align:center">
    <p style="font-size:11px;color:#4a5568;margin:0">Email tự động từ StockAI VN. Không trả lời email này.</p>
  </div>
</div>
</body>
</html>`,
  })
}
