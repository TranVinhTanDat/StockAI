// ─── Stock Board Type ─────────────────────────────────────────────────────────
export interface StockBoard {
  sym: string; name: string; exchange: string
  price: number; ref: number; ceil: number; floor: number
  high: number; low: number; open: number; avgPrice: number
  vol: number; totalVal: number
  change: number; changePct: number
  bid: { p: number; v: number }[]
  ask: { p: number; v: number }[]
  foreignBuy: number; foreignSell: number
  updatedAt: number
}

// ─── Index Stock Lists ─────────────────────────────────────────────────────────
export const VN30 = ['ACB','BCM','BID','BVH','CTG','FPT','GAS','GVR','HDB','HPG','MBB','MSN','MWG','NVL','PDR','PLX','POW','SAB','SSI','STB','TCB','TPB','VCB','VHM','VIB','VIC','VJC','VNM','VPB','VRE']

export const VN100 = [
  ...VN30,
  'EIB','LPB','MSB','OCB',
  'VND','HCM','VCI','MBS',
  'KDH','NLG','DXG','HDG','CII','DIG','KBC','SJS','IDC','LHG','CRE',
  'PNJ','KDC','REE','MCH',
  'IMP','DHG',
  'DGC','DRC','HSG','NKG','PHR','DPR',
  'GEX','BWE','VSC','GMD','HAX','SIP','KSB',
  'PVD','PVS','NT2','DCM','DPM','OIL','BSR',
  'QNS','VHC','MPC','ANV','FMC','PAN','STK',
]

export const VN_MIDCAP = [
  'CEO','DCM','DGW','DNP','EVF','GKM','IDJ','KLF','LAS',
  'NBC','NRC','ORS','PLC','PVB','QTC','SHS','TAR','TIG','TNT',
  'TXM','VCS','VGS','VMD','WIN','HUT','SDC','SGT',
  'ANT','ASM','BAF','DHC','DTD','GEX','HBC','HTI','IBC','ITC',
  'KAC','MCG','PTB','QBS','SNG','TSC','TTP','VRG',
  'BST','CHP','CMG','FTS','BFC',
]

export const VN_SMALLCAP = [
  'AAA','ABR','AGG','AGM','ALT','BAB','BBC','BCE','BMI','BMP',
  'BNG','BPC','BRC','BTP','BVB','BVS','CAV','CDC','CDN',
  'CIG','CLX','CSM','CT3','CTF','CTI','CTS',
  'DAG','DAH','DBC','DBD','DBT','DIH','DLG','DMC','DNH',
  'DOP','DPG','DSC','DSE','DSN','DTP','DVP','FCM','FIT',
  'GEG','HCC','HHV','HLD','HNA','HOT','HPX','HTB',
  'ICF','IJC','KBC','KHG',
]

export const VN_DIAMOND    = ['VCB','VIC','VHM','FPT','TCB','ACB','HPG','MWG','VPB','MSN']
export const VN_FIN_LEAD   = ['VCB','BID','CTG','MBB','TCB','VPB','ACB','STB','HDB','EIB','LPB','MSB','VIB','TPB','OCB']
export const VN_FIN_SELECT = ['VCB','BID','CTG','MBB','TCB','VPB','ACB','STB','HDB','EIB','LPB','MSB','VIB','TPB','OCB','SHB','SSI','VND','HCM','VCI','MBS','SHS','VCS','VGS','BVH','PVI']
export const VN_DIVIDEND   = ['VCB','GAS','SAB','VNM','FPT','REE','PNJ','DHG','IMP','NT2','BWE','VCS','GMD','VSC','DPM','DCM','QNS','VHC','PAN','DRC','PHR','KDH','PLC','ANV','GEX','HAX','STK','FMC','DGC','BFC']
export const VN_MITECH     = ['FPT','CMG','ELC','VGI','SGT','FOX','OTS','TST','VTC','GEG','NET','KPT','TNG','SBT','ITD']

export const VN_FIN  = ['VCB','BID','CTG','MBB','TCB','VPB','ACB','STB','HDB','EIB','LPB','MSB','VIB','TPB','OCB','SSI','VND','HCM','VCI','MBS','SHS','SHB','BVH','VRE','PVI']
export const VN_IND  = ['HPG','GEX','BWE','VSC','GMD','HAX','SIP','KSB','VEA','HUT','CTI','PHR','DPR','KBC','IDC','DIG','CII']
export const VN_MAT  = ['HPG','DGC','DRC','HSG','NKG','PHR','DPR','ANV','VHC','KSB','CSV','NHH','HVG']
export const VN_IT   = ['FPT','CMG','ELC','VGI','SGT','FOX','OTS','ITD','TST','NET','KPT','TNG','SBT']
export const VN_REAL = ['VHM','NVL','PDR','VIC','KDH','NLG','DXG','HDG','CII','DIG','KBC','SJS','IDC','LHG','CRE','HDC','AGG','NRC','DXS','QCG']
export const VN_CONS = ['VNM','SAB','MWG','PNJ','KDC','MSN','MCH','BFC','QNS','VHC','MPC','FMC','ANV','DHG','IMP','PLX']
export const VN_ENE  = ['GAS','PLX','POW','PVD','PVS','NT2','OIL','BSR','DCM','DPM','GEG','GVR']
export const VN_HEAL = ['DHG','IMP','OPC','PME','JVC','THP','BMP','DMC','VMD','DBT']

export const HNX30 = ['CEO','DCM','DGW','DNP','DTD','EVF','GKM','IDJ','KLF','LAS','MBS','NBC','NRC','ORS','PLC','PVB','QTC','SHB','SHS','TAR','TIG','TNT','TXM','VCS','VGS','VMD','WIN','HUT','SDC','SGT']

export const HNX_ALL = [
  ...HNX30,
  'AAA','ALT','AMV','ANT','APC','ASM','BAB','BAF','BBC','BCE',
  'BFC','BMI','BMS','BNC','BVB','BVS','CAV','CDC','CDN',
  'CHP','CMG','CMX','CSM','CT3','CTF','CTI','CTS',
  'DAG','DAH','DBC','DBD','DBT','DHC','DIH','DLG',
  'DOP','DPC','DPG','DRH','DSC','DSE','DSN',
]

export const UPCOM_POPULAR = ['ACV','BSR','OIL','MCH','QNS','VGI','FOX','ORG','NTC','MPC','VHC','ANV','VCF','HAX','SIP','KSB','VEA','PAN','FTS','BFC']

export const EXTENDED = ['EIB','HDB','LPB','MSB','OCB','VIB','TPB','KDC','KDH','NLG','DXG','HDG','REE','VCS','ANV','DGC','DRC','HSG','IMP','PNJ','VND','HCM','MBS','VCI','DPM','DHG','GMD','VSC','NKG','HAG','STK','VHC','BWE','GEX','PVD','PVS','NT2','CII','DIG','SJS','IDC','KBC','LHG','PHR','DPR']

export const COMPANY_NAMES: Record<string, string> = {
  ACB:'NH TMCP Á Châu', BCM:'TCT Becamex IDC', BID:'NH TMCP Đầu tư & PT VN',
  BVH:'TCT Bảo Việt', CTG:'NH TMCP Công Thương VN', FPT:'CTCP Tập đoàn FPT',
  GAS:'TCT Khí VN', GVR:'TCT Cao su VN', HDB:'NH TMCP PT TP.HCM',
  HPG:'CTCP Tập đoàn Hòa Phát', MBB:'NH TMCP Quân Đội', MSN:'CTCP Tập đoàn Masan',
  MWG:'CTCP ĐT Thế Giới Di Động', NVL:'CTCP Tập đoàn Novaland',
  PDR:'CTCP PT BĐS Phát Đạt', PLX:'TCT Xăng dầu VN', POW:'TCT Điện lực Dầu khí VN',
  SAB:'TCT CP Bia-Rượu-NGK Sài Gòn', SSI:'CTCP Chứng khoán SSI',
  STB:'NH TMCP Sài Gòn Thương Tín', TCB:'NH TMCP Kỹ Thương VN',
  TPB:'NH TMCP Tiên Phong', VCB:'NH TMCP Ngoại Thương VN', VHM:'CTCP Vinhomes',
  VIB:'NH TMCP Quốc Tế VN', VIC:'TCT CP Vingroup', VJC:'CTCP Hàng không VietJet',
  VNM:'CTCP Sữa VN', VPB:'NH TMCP Việt Nam Thịnh Vượng', VRE:'CTCP Vincom Retail',
  SHB:'NH TMCP Sài Gòn Hà Nội', EIB:'NH TMCP Xuất Nhập Khẩu VN',
  LPB:'NH TMCP Bưu điện Liên Việt', MSB:'NH TMCP Hàng Hải VN',
  OCB:'NH TMCP Phương Đông', PVB:'NH TMCP Đại Chúng VN',
  MBS:'CTCP CK MB', SHS:'CTCP CK Sài Gòn Hà Nội', VCS:'CTCP Vicostone',
  VGS:'CTCP ÔNG THÉP VIỆT ĐỨC', DGW:'CTCP Thế Giới Số', PLC:'CTCP Hóa dầu Petrolimex',
  CEO:'CTCP Tập đoàn C.E.O', VND:'CTCP CK VNDirect', HCM:'CTCP CK TP.HCM',
  VCI:'CTCP CK Bản Việt', BVS:'CTCP CK Bảo Việt', BSI:'CTCP CK BIDV',
  KDH:'CTCP ĐT KDH', NLG:'CTCP Nam Long', DXG:'CTCP Tập đoàn Đất Xanh',
  HDG:'CTCP Tập đoàn Hà Đô', CII:'CTCP ĐT Hạ tầng Kỹ thuật TP.HCM',
  DIG:'TCT CP Đầu tư PT Xây dựng', SJS:'CTCP ĐT PT Đô thị & KCN Sông Đà',
  IDC:'TCT IDICO', KBC:'TCT PT Đô thị Kinh Bắc', LHG:'CTCP Long Hậu',
  CRE:'CTCP BĐS Thế Kỷ', HDC:'CTCP PT Nhà Bà Rịa-Vũng Tàu',
  AGG:'CTCP ĐT và PT BĐS An Gia', DXS:'CTCP DXS', QCG:'CTCP Quốc Cường Gia Lai',
  NRC:'CTCP Nam Mê Kông', REE:'CTCP Cơ điện lạnh',
  PNJ:'CTCP Vàng bạc Đá quý Phú Nhuận', KDC:'CTCP Tập đoàn KIDO',
  MCH:'CTCP Hàng tiêu dùng Masan',
  IMP:'CTCP Dược phẩm Imexpharm', DHG:'CTCP Dược Hậu Giang',
  OPC:'CTCP Dược phẩm OPC', PME:'CTCP Pymepharco',
  JVC:'CTCP Thiết bị Y tế Việt Nhật', THP:'CTCP Bia Sài Gòn Miền Tây',
  BMP:'CTCP Nhựa Bình Minh', DMC:'CTCP XNK Y tế Domesco',
  VMD:'CTCP Y Dược - Dụng cụ Y tế VN', DBT:'CTCP Dược phẩm Bến Tre',
  ANV:'CTCP Nam Việt', DGC:'CTCP Tập đoàn Hóa chất ĐG',
  DRC:'CTCP Cao su Đà Nẵng', HSG:'CTCP Tập đoàn Hoa Sen',
  NKG:'CTCP Thép Nam Kim', PHR:'CTCP Cao su Phước Hòa',
  DPR:'CTCP Cao su Đồng Phú', CSV:'CTCP Hóa chất Cơ bản Miền Nam',
  NHH:'CTCP Nhựa Hà Nội', HVG:'CTCP Hùng Vương', KSB:'CTCP Khoáng sản & XD BĐ',
  GEX:'CTCP Tập đoàn GELEX', BWE:'CTCP Cấp Thoát nước Bình Dương',
  VSC:'CTCP Container VN', GMD:'CTCP Gemadept', HAX:'CTCP DV Ô tô Hàng Xanh',
  SIP:'CTCP Sài Gòn VRG', VEA:'TCT Máy động lực & Máy NN VN',
  HUT:'CTCP Tasco', SDC:'CTCP Sông Đà Capital', SGT:'CTCP CMC Telecom',
  CTI:'CTCP ĐT PT Cường Thuận IDICO',
  ACV:'TCT Cảng hàng không VN', BSR:'CTCP Lọc hóa dầu Bình Sơn',
  OIL:'CTCP Dầu khí Quốc gia VN', PVD:'CTCP Khoan và DV Khoan dầu khí',
  PVS:'TCT CP DV Kỹ thuật DK', NT2:'CTCP Điện lực Dầu khí Nhơn Trạch 2',
  DCM:'CTCP Phân bón Dầu khí Cà Mau', DPM:'TCT Phân bón & Hóa chất Dầu khí',
  GEG:'CTCP Điện Gia Lai',
  QNS:'CTCP Đường Quảng Ngãi', VHC:'CTCP Vĩnh Hoàn',
  MPC:'CTCP TS Minh Phú', STK:'CTCP Sợi Thế Kỷ',
  PAN:'CTCP PAN', FTS:'CTCP CK FPT', BFC:'CTCP Phân bón Bình Điền',
  FMC:'CTCP Thực phẩm Sao Ta',
  CMG:'CTCP Tập đoàn Công nghệ CMC', ELC:'CTCP Điện tử Elcom',
  VGI:'CTCP Viettel Global', FOX:'CTCP Viễn thông FPT',
  OTS:'CTCP Cảng Đoạn Xá', ITD:'CTCP Công nghệ & TM',
  TST:'CTCP Du lịch & TM TH', VTC:'TCT Truyền thông VN',
  NET:'CTCP Bột giặt Net', KPT:'CTCP Cảng Cam Ranh',
  TNG:'CTCP ĐT & TM TNG', SBT:'CTCP TH Công - Biên Hòa',
  DNP:'CTCP Nhựa DNP', EVF:'CTCP Tài chính APEC',
  GKM:'CTCP Gang thép Cao Bằng', IDJ:'CTCP ĐT IDJ VN',
  KLF:'CTCP ĐT TM & XNK CKL', LAS:'CTCP Supe Phốt phát Lâm Thao',
  NBC:'CTCP Than Núi Béo', ORS:'CTCP CK Tiên Phong',
  TAR:'CTCP NN CNC Trung An', TIG:'CTCP Tập đoàn ĐT VN',
  TNT:'CTCP Tập đoàn TNT', TXM:'CTCP Vimeco', QTC:'CTCP CTGT Quảng Ngãi',
  WIN:'CTCP Định Lượng',
  VCF:'CTCP Vinacafé Biên Hòa', ORG:'CTCP TH True Milk', NTC:'CTCP Nam Tân Cảng',
  HAG:'CTCP Hoàng Anh Gia Lai', MCG:'CTCP Cơ điện & XD VN',
  PTB:'CTCP Phú Tài', ANT:'CTCP Kỹ thuật Khoáng sản', ASM:'CTCP ĐT ASM',
  BAF:'CTCP NN BAF VN', DHC:'CTCP Đông Hải Bến Tre',
  DTD:'CTCP ĐT PT TDT', HBC:'CTCP XD & KD ĐT Hoà Bình',
  HTI:'CTCP ĐT & PT Hạ tầng TH', IBC:'CTCP ĐT APEC',
  ITC:'CTCP ĐT & CN BĐS ITC', KAC:'CTCP ĐT Địa ốc Khang An',
  QBS:'CTCP XNK Quảng Bình', SNG:'CTCP Sông Đà 9',
  TSC:'CTCP VT Kỹ thuật NN Cần Thơ', TTP:'CTCP Bao bì Nhựa TT',
  VRG:'CTCP ĐT VRG', BST:'CTCP Sông Đà 6', CHP:'CTCP TĐ Cửa Đạt',
  PVI:'CTCP Bảo hiểm PVI', PVT:'TCT CP VT Dầu khí',
  DAG:'CTCP Nhựa Đông Á', CSM:'CTCP CN Cao su Miền Nam',
  CMX:'CTCP Camimex Group', DIH:'CTCP ĐT & PT CN Hà Nội',
  DLG:'CTCP Đức Long Gia Lai', DOP:'CTCP Dầu TV Phú Long',
  DPG:'CTCP ĐT PT Nhà & ĐT DPG', DRH:'CTCP DRH Holdings',
  FCM:'CTCP Khai khoáng Miền Trung', HCC:'CTCP Bê tông Hòa Cầm',
  HHV:'CTCP ĐT Hạ tầng GT Đèo Cả',
}
