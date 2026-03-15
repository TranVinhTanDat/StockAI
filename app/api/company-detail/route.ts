import { NextResponse } from 'next/server'

const CAFEF_BASE = 'https://cafef.vn/du-lieu/Ajax/PageNew'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://cafef.vn/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

async function cafefFetch(path: string): Promise<AnyObj> {
  const url = `${CAFEF_BASE}/${path}`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`CafeF HTTP ${res.status}: ${path}`)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return null }
}

// Parse .NET WCF JSON date: /Date(1234567890000)/
function parseDotNetDate(d: string): string {
  if (!d) return ''
  const m = String(d).match(/\/Date\((\d+)\)\//)
  if (m) return new Date(parseInt(m[1])).toISOString().split('T')[0]
  return d
}

// Parse Vietnamese number string: "76.795.662" → 76795662, "4,51" → 4.51
function parseViNumber(s: string | number): number {
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  if (!s) return 0
  // Remove dots (VN thousands separator), replace comma with dot (decimal)
  const normalized = String(s).replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return isNaN(n) ? 0 : n
}

// Parse American-format numbers: "8,000,000" → 8000000, "131,170.05" → 131170.05
// CafeF ChiSoTaiChinh returns numbers in American format (commas = thousands, dot = decimal)
function parseAmNum(s: string | number): number {
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  if (!s) return 0
  const n = parseFloat(String(s).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

// Parse Vietnamese amount strings like "75.400 tỷ" → 75400 (in tỷ = billion VND)
// Also handles embedded amounts: "tăng 9.5%, ước đạt 23.000 tỷ đồng" → 23000
function parseViAmount(s: string): number {
  if (!s || s === 'N/A') return 0
  const str = String(s).trim()
  // First try to find embedded "X nghìn tỷ" or "X tỷ" patterns
  const nghìnTyMatch = str.match(/(\d[\d.]*)\s*nghìn\s*tỷ/i)
  if (nghìnTyMatch) return parseViNumber(nghìnTyMatch[1]) * 1000
  const tyMatch = str.match(/(\d[\d.]*)\s*tỷ/i)
  if (tyMatch) return parseViNumber(tyMatch[1])
  const trieuMatch = str.match(/(\d[\d.]*)\s*triệu/i)
  if (trieuMatch) return parseViNumber(trieuMatch[1]) / 1000
  // Fallback: try to parse the whole string
  const cleaned = str.replace(/[^\d.,]/g, '')
  return parseViNumber(cleaned)
}

// Strip HTML tags
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getIntro(symbol: string) {
  try {
    const data = await cafefFetch(`CompanyIntro.ashx?Symbol=${symbol}`)
    if (!data) return null
    const d = data.Data || data.data || data
    if (!d) return null
    return {
      companyName: d.Name || d.FullName || d.CompanyName || symbol,
      shortName: d.ShortName || d.Symbol || symbol,
      logo: '',  // static.cafef.vn/images/listlogo/ is blocked — use initials avatar
      website: d.Web || d.Website || d.website || '',
      description: d.Intro || d.Description || d.Introduce || d.introduce || '',
    }
  } catch { return null }
}

async function getBasicInfo(symbol: string) {
  try {
    // Call both CompanyIntro (exchange/industry) and ChiSoTaiChinh (KLCP/MarketCap) in parallel
    const [introData, ratioData] = await Promise.all([
      cafefFetch(`CompanyIntro.ashx?Symbol=${symbol}`),
      cafefFetch(`ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Q&Sort=DESC`),
    ])
    const d = introData?.Data || introData?.data || introData || {}
    const exchange = d.CenterId === 1 ? 'HOSE' : d.CenterId === 2 ? 'HNX' : d.CenterId === 9 ? 'UpCOM' : (d.San || d.Exchange || '')

    // Extract KLCP and market cap from ChiSoTaiChinh code map
    const ratioArr: AnyObj[] = (ratioData?.Data && Array.isArray(ratioData.Data)) ? ratioData.Data : []
    const cm: Record<string, string> = {}
    for (const item of ratioArr) { if (item.Code) cm[item.Code] = item.Value || '' }
    const sharesOutstanding = parseAmNum(cm['KlcpNY'] || cm['KlcpLuuHanh'] || '0')
    const marketCapTy = parseAmNum(cm['VonHoaThiTruong'] || '0')

    return {
      exchange,
      industry: d.Nganh || d.Industry || d.IndustryName || '',
      firstTradingDate: parseDotNetDate(d.NgayGDDauTien || d.FirstTradingDate || ''),
      charterCapital: Number(d.VDL || d.CharterCapital || 0),
      sharesOutstanding,
      marketCapTy,
    }
  } catch { return null }
}

async function getManagement(symbol: string) {
  try {
    const data = await cafefFetch(`ListCeo.ashx?Symbol=${symbol}&PositionGroup=0`)
    if (!data) return []
    // CafeF returns: data.Data = [{Type, GroupName, values: [{CeoCode, Name, Image, Position, old}]}]
    const groups: AnyObj[] = (data.Data && Array.isArray(data.Data)) ? data.Data : []
    const people: AnyObj[] = []
    for (const g of groups) {
      if (g.values && Array.isArray(g.values)) {
        for (const p of g.values) {
          people.push({
            name: p.Name || '',
            yearBorn: 0,
            position: p.Position || '',
            positionGroup: g.GroupName || '',
            photo: '',
            education: (p.CeoSchools && p.CeoSchools.length > 0) ? (p.CeoSchools[0].CeoTitle || '') : '',
          })
        }
      }
    }
    return people.filter(p => p.name)
  } catch { return [] }
}

async function getShareholders(symbol: string) {
  try {
    const data = await cafefFetch(`CoCauSoHuu.ashx?Symbol=${symbol}`)
    if (!data) return { major: [], corporate: [] }
    const inner = data.Data || data.data || data
    // CafeF returns: data.Data.CoDongSoHuu = [{Code, Name, AssetVolume, AssetRate, UpdatedDate}]
    const arr: AnyObj[] = inner.CoDongSoHuu || inner.coDongSoHuu ||
      (Array.isArray(inner) ? inner : [])

    const major = arr.map((sh: AnyObj) => ({
      name: sh.Name || sh.FullName || sh.ShareHolderName || '',
      volume: parseViNumber(sh.AssetVolume || sh.Quantity || '0'),
      pct: parseViNumber(sh.AssetRate || sh.Percentage || '0'),
      type: String(sh.Code || '').startsWith('CEO') ? 'Cá nhân' : 'Tổ chức',
    })).filter((sh: { name: string }) => sh.name)

    return { major, corporate: [] }
  } catch { return { major: [], corporate: [] } }
}

async function getFinancialRatios(symbol: string) {
  try {
    // Fetch both quarterly and yearly ratios in parallel for more data
    const [qData, yData] = await Promise.allSettled([
      cafefFetch(`ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Q&Sort=DESC`),
      cafefFetch(`ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Y&Sort=DESC`),
    ])
    const data = (qData.status === 'fulfilled' ? qData.value : null) || (yData.status === 'fulfilled' ? yData.value : null)
    if (!data) return []
    // CafeF returns: data.Data = [{Code, Value, Text, Number}, ...]
    // Codes: EPScoBan, EPSphaLoang, P/E, GiaTriSoSach (BVPS), Beta (P/B), VonHoaThiTruong, ThoiGian
    // ROA/ROE codes: ROA, ROE, TySuatLoiNhuanTongTaiSan, TySuatLoiNhuanVonCSH
    const arr: AnyObj[] = (data.Data && Array.isArray(data.Data)) ? data.Data : []
    if (arr.length === 0) return []

    // Build code map from both quarterly and yearly data
    const buildCodeMap = (items: AnyObj[]): Record<string, number> => {
      const cm: Record<string, number> = {}
      for (const item of items) {
        if (item.Code && item.Value != null && item.Value !== '') {
          const num = parseFloat(String(item.Value).replace(/,/g, ''))
          if (!isNaN(num)) cm[item.Code] = num
        }
      }
      return cm
    }

    const codeMap = buildCodeMap(arr)
    // Also merge yearly data codes for ROA/ROE if quarterly doesn't have them
    if (yData.status === 'fulfilled' && yData.value?.Data) {
      const yCodeMap = buildCodeMap(yData.value.Data as AnyObj[])
      for (const [k, v] of Object.entries(yCodeMap)) {
        if (!(k in codeMap)) codeMap[k] = v
      }
    }

    const timeEntry = arr.find((it: AnyObj) => it.Code === 'ThoiGian')
    const period = timeEntry?.Value || 'Hiện tại'

    const eps  = codeMap['EPScoBan'] || codeMap['EPSphaLoang'] || 0
    const bvps = codeMap['GiaTriSoSach'] || 0
    // Approximate ROE = EPS / BVPS * 100 (both in same currency unit)
    const approxRoe = bvps > 0 ? Math.round(eps / bvps * 1000) / 10 : 0

    // ROA/ROE: CafeF ChiSoTaiChinh doesn't provide them — try Simplize API
    let roa = codeMap['ROA'] || codeMap['TySuatLoiNhuanTongTaiSan'] || codeMap['Roa'] || 0
    let roe = codeMap['ROE'] || codeMap['TySuatLoiNhuanVonCSH'] || codeMap['Roe'] || approxRoe
    try {
      const simplize = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
        next: { revalidate: 3600 },
      })
      if (simplize.ok) {
        const sd = await simplize.json()
        // Simplize wraps response: {status, message, data: {roa, roe, ...}}
        const sData = sd?.data || sd
        if (sData?.roa) roa = sData.roa
        if (sData?.roe) roe = sData.roe
      }
    } catch { /* ignore — use CafeF approximation */ }

    return [{
      period,
      yearPeriod: new Date().getFullYear(),
      eps,
      bvps,
      pe: codeMap['P/E'] || 0,
      pb: codeMap['Beta'] || 0,  // CafeF uses code "Beta" for P/B
      roe,
      roa,
      ebitda: 0,
    }]
  } catch { return [] }
}

async function getSubsidiaries(symbol: string) {
  try {
    const data = await cafefFetch(`GetDataSubsidiaries.ashx?Symbol=${symbol}`)
    if (!data) return []
    const inner = data.Data || data.data || data
    // CafeF returns: data.Data.Subsidiaries + data.Data.AssociatedCompanies
    const subs: AnyObj[] = inner.Subsidiaries || inner.subsidiaries || []
    const assoc: AnyObj[] = inner.AssociatedCompanies || inner.associatedCompanies || []

    const mapSub = (arr: AnyObj[], type: string) => arr.map((s: AnyObj) => ({
      name: s.Name || s.CompanyName || s.name || '',
      pct: Number(s.OwnershipRate || s.Percentage || 0),
      businessType: s.TradeCenter || s.BusinessType || '',
      type,
    })).filter((s: { name: string }) => s.name)

    return [...mapSub(subs, 'Công ty con'), ...mapSub(assoc, 'Công ty liên kết')]
  } catch { return [] }
}

async function getBusinessPlan(symbol: string) {
  try {
    const data = await cafefFetch(`KeHoachKinhDoanh.ashx?Symbol=${symbol}`)
    if (!data) return []
    const inner = data.Data || data.data || data
    if (!inner) return []

    // CafeF may return: array of years OR single object with Year + Values
    // Normalize to array
    let yearEntries: AnyObj[] = []
    if (Array.isArray(inner)) {
      yearEntries = inner
    } else if (Array.isArray(inner.ListYear)) {
      yearEntries = inner.ListYear
    } else if (inner.Year) {
      yearEntries = [inner]
    } else {
      return []
    }

    const REVENUE_NAMES = [
      'Doanh thu', 'Tổng doanh thu', 'Tổng thu nhập hoạt động',
      'Tổng thu nhập thuần', 'Tổng thu nhập', 'Thu nhập lãi và tương đương',
      'Thu nhập lãi thuần', 'Thu nhập lãi', 'Thu nhập từ hoạt động kinh doanh',
      'Thu nhập từ hoạt động', 'Tổng thu',
    ]
    const PROFIT_NAMES = ['Lợi nhuận trước thuế', 'Lợi nhuận sau thuế', 'LNTT', 'LNST']
    const DIVIDEND_NAMES = ['Cổ tức bằng tiền mặt', 'Cổ tức bằng tiền', 'Cổ tức']

    const findVal = (values: AnyObj[], names: string[]): string => {
      for (const name of names) {
        const item = values.find((v: AnyObj) => v.Name?.includes(name))
        if (item?.Value && item.Value !== 'N/A') return item.Value
      }
      return ''
    }

    const parsed = yearEntries.map((entry: AnyObj) => {
      const year = Number(entry.Year)
      const values: AnyObj[] = entry.Values || []
      const revenueStr = findVal(values, REVENUE_NAMES)
      const profitStr  = findVal(values, PROFIT_NAMES)
      const dividendStr = findVal(values, DIVIDEND_NAMES)
      // Also try to extract growth rates directly from CafeF (sometimes provided as "X%" strings)
      const ttDtStr = findVal(values, ['Tăng trưởng doanh thu', 'TT doanh thu', 'Tăng trưởng DT', 'Tốc độ tăng DT'])
      const ttLnStr = findVal(values, ['Tăng trưởng lợi nhuận', 'TT lợi nhuận', 'Tăng trưởng LN', 'Tốc độ tăng LN'])
      return {
        year,
        revenue: parseViAmount(revenueStr),
        revenueRaw: revenueStr.slice(0, 100),
        profit: parseViAmount(profitStr),
        profitRaw: profitStr.slice(0, 100),
        dividend: dividendStr,
        revenueGrowth: parseFloat(ttDtStr.replace('%', '')) || 0,
        profitGrowth:  parseFloat(ttLnStr.replace('%', '')) || 0,
        // Pass all raw CafeF values for full fidelity display
        values: values.map((v: AnyObj) => ({ name: v.Name || '', value: v.Value || '' })).filter((v: { name: string }) => v.name),
      }
    }).filter((p: { year: number }) => p.year > 2000)

    // Sort descending by year (latest first)
    parsed.sort((a: { year: number }, b: { year: number }) => b.year - a.year)

    // Calculate YoY growth rates for any entries where the API didn't provide them
    for (let i = 0; i < parsed.length; i++) {
      const curr = parsed[i]
      const prev = parsed[i + 1]
      if (!curr.revenueGrowth && prev && prev.revenue > 0 && curr.revenue > 0) {
        curr.revenueGrowth = Math.round(((curr.revenue - prev.revenue) / prev.revenue) * 1000) / 10
      }
      if (!curr.profitGrowth && prev && prev.profit > 0 && curr.profit > 0) {
        curr.profitGrowth = Math.round(((curr.profit - prev.profit) / prev.profit) * 1000) / 10
      }
    }

    return parsed
  } catch { return [] }
}

async function getEvents(symbol: string) {
  try {
    const data = await cafefFetch(`LichSuKien.ashx?Symbol=${symbol}`)
    if (!data) return []
    // CafeF returns: data.Data = [{Time: "/Date(ms)/", type: 1|2, Text: ["..."]}]
    const arr: AnyObj[] = (data.Data && Array.isArray(data.Data)) ? data.Data : []

    const typeLabel = (t: number) => t === 1 ? 'Cổ tức/Quyền' : t === 2 ? 'Phát hành thêm' : 'Sự kiện'

    return arr.map((e: AnyObj) => ({
      date: parseDotNetDate(e.Time || e.EventDate || e.date || ''),
      exDate: '',
      recordDate: '',
      title: Array.isArray(e.Text) ? e.Text.join(' · ') : (e.Text || e.Title || e.title || ''),
      eventType: typeLabel(Number(e.type || 0)),
      detail: '',
    })).filter((e: { title: string }) => e.title)
  } catch { return [] }
}

async function getForeignData(symbol: string) {
  try {
    const data = await cafefFetch(`GetDataNDTNN.ashx?Symbol=${symbol}`)
    if (!data) return null
    const inner = data.Data || data.data || data
    // CafeF returns: {Count, Data: [{TradeDate, BuyVolume, SellVolume, Room, Percent, NetVolume, ...}]}
    const arr: AnyObj[] = inner.Data || (Array.isArray(inner) ? inner : [])
    const latest = arr[0] || null
    // Find most recent entry with valid holding percent
    const withPct = arr.find((d: AnyObj) => Number(d.Percent) > 0) || latest
    return {
      buyVolume:   Number(latest?.BuyVolume  || 0),
      sellVolume:  Number(latest?.SellVolume || 0),
      netVolume:   Number(latest?.NetVolume  || 0),
      holdingPct:  Number(withPct?.Percent   || 0),
      maxRatioPct: Number(withPct?.Percent   || 0) > 0 ? 49 : 0, // Standard HOSE/HNX cap
    }
  } catch { return null }
}

async function getAnalystReports(symbol: string) {
  try {
    const data = await cafefFetch(`BaoCaoPhanTich.ashx?Symbol=${symbol}&PageIndex=1&PageSize=10`)
    if (!data) return []
    // CafeF returns: data.Data = [{Title, DateDeploy: "/Date(ms)/", Body (HTML), ResourceName, LinkDetail, ReportType}]
    const arr: AnyObj[] = (data.Data && Array.isArray(data.Data)) ? data.Data : []

    return arr.map((r: AnyObj) => {
      // Build PDF URL from ImageThumb path when possible
      // ImageThumb: "thumb/180_214/Images/Uploaded/..." → PDF at "https://cafef.vn/Images/Uploaded/.../filename.pdf"
      let pdfUrl = ''
      if (r.ImageThumb && r.ImageThumb.includes('Images/Uploaded/')) {
        const basePath = r.ImageThumb.replace(/^thumb\/[\d_]+\//, '').replace(/\.(png|jpg|jpeg)$/i, '.pdf')
        pdfUrl = `https://cafef.vn/${basePath}`
      } else if (r.FileName) {
        pdfUrl = `https://cafef.vn/Images/Uploaded/DuLieuDownload/PhanTichBaoCao/${r.FileName}`
      }
      return {
        title: r.Title || r.title || '',
        date: parseDotNetDate(r.DateDeploy || r.date || ''),
        source: r.ResourceName || r.Source || r.source || '',
        url: pdfUrl || (r.LinkDetail ? `https://cafef.vn${r.LinkDetail}` : ''),
        recommendation: r.ReportType || r.Recommendation || '',
        targetPrice: Number(r.TargetPrice || r.GiaMucTieu || 0),
        // Use ShortContent (clean web excerpt) — Body contains PDF-extracted text with broken font encoding
        summary: stripHtml(r.ShortContent || r.Summary || '').slice(0, 500),
      }
    }).filter((r: { title: string }) => r.title)
  } catch { return [] }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.toUpperCase()

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })
  }

  const [intro, basicInfo, management, shareholders, financialRatios, subsidiaries, businessPlan, events, foreignData, analystReports] =
    await Promise.allSettled([
      getIntro(symbol),
      getBasicInfo(symbol),
      getManagement(symbol),
      getShareholders(symbol),
      getFinancialRatios(symbol),
      getSubsidiaries(symbol),
      getBusinessPlan(symbol),
      getEvents(symbol),
      getForeignData(symbol),
      getAnalystReports(symbol),
    ])

  const val = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback

  return NextResponse.json({
    symbol,
    intro: val(intro, null),
    basicInfo: val(basicInfo, null),
    management: val(management, []),
    shareholders: val(shareholders, { major: [], corporate: [] }),
    financialRatios: val(financialRatios, []),
    subsidiaries: val(subsidiaries, []),
    businessPlan: val(businessPlan, []),
    events: val(events, []),
    foreignData: val(foreignData, null),
    analystReports: val(analystReports, []),
  })
}
