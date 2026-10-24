/* ============================================================
 * X-Ray Asset Library  —  资产风险参数库
 * ------------------------------------------------------------
 * 参数口径：
 *   vol  = 年化波动率 (%)，基于该类资产长期（10年以上）月度收益估算
 *   mdd  = 历史极端最大回撤 (%)，取该资产近 20 年最深一次
 *   corr = 长期相关系数，取主要代表指数的月度收益相关
 *
 * 说明：参数为「类别级」长期统计量，非实时行情。
 *      目的是度量结构性风险，不用于预测短期涨跌。
 * ========================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XRayAssets = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---- 慢变量：波动率 / 最大回撤 / 分类 ---- */
  var ASSETS = [
    { id: 'cn_broad',  name: '中国A股·宽基',   nameTw: '中國A股·寬基',   vol: 20,  mdd: -46,  kind: 'equity',  region: 'CN',    hint: '沪深300 / 中证A500' },
    { id: 'cn_growth', name: '中国A股·成长',   nameTw: '中國A股·成長',   vol: 28,  mdd: -70,  kind: 'equity',  region: 'CN',    hint: '创业板 / 科创50 / 半导体 / 新能源' },
    { id: 'cn_small',  name: '中国A股·中小盘', nameTw: '中國A股·中小盤', vol: 25,  mdd: -62,  kind: 'equity',  region: 'CN',    hint: '中证500 / 中证1000 / 中证2000 / 北证' },
    { id: 'cn_div',    name: '中国A股·红利',   nameTw: '中國A股·紅利',   vol: 16,  mdd: -42,  kind: 'equity',  region: 'CN',    hint: '红利低波 / 银行 / 消费 / 公用事业' },
    { id: 'hk',        name: '港股',           nameTw: '港股',           vol: 24,  mdd: -66,  kind: 'equity',  region: 'HK',    hint: '恒生 / 恒生科技 / 中概互联' },
    { id: 'tw',        name: '台股',           nameTw: '台股',           vol: 22,  mdd: -56,  kind: 'equity',  region: 'TW',    hint: '台湾50 / 高股息 / 半导体相关' },
    { id: 'us',        name: '美股·宽基',      nameTw: '美股·寬基',      vol: 16,  mdd: -55,  kind: 'equity',  region: 'US',    hint: '标普500 / 道琼斯 / 全市场' },
    { id: 'us_tech',   name: '美股·科技',      nameTw: '美股·科技',      vol: 24,  mdd: -52,  kind: 'equity',  region: 'US',    hint: '纳斯达克100 / 费半 / AI 主题' },
    { id: 'jp_eu',     name: '日欧股',         nameTw: '日歐股',         vol: 18,  mdd: -58,  kind: 'equity',  region: 'DM',    hint: '日经225 / 欧洲斯托克' },
    { id: 'em',        name: '新兴市场',       nameTw: '新興市場',       vol: 22,  mdd: -60,  kind: 'equity',  region: 'EM',    hint: '印度 / 越南 / 拉美' },
    { id: 'reits',     name: '不动产REITs',    nameTw: '不動產REITs',    vol: 18,  mdd: -65,  kind: 'reits',   region: 'GL',    hint: '公募REITs / 房地产信托' },
    { id: 'gold',      name: '黄金',           nameTw: '黃金',           vol: 16,  mdd: -45,  kind: 'metal',   region: 'GL',    hint: '黄金ETF / 实物金' },
    { id: 'commod',    name: '大宗商品',       nameTw: '大宗商品',       vol: 22,  mdd: -62,  kind: 'commod',  region: 'GL',    hint: '原油 / 有色 / 农产品' },
    { id: 'bond_cn',   name: '中国债券',       nameTw: '中國債券',       vol: 4,   mdd: -8,   kind: 'bond',    region: 'CN',    hint: '国债 / 政金债 / 信用债 / 转债' },
    { id: 'bond_us',   name: '美债',           nameTw: '美債',           vol: 6,   mdd: -18,  kind: 'bond',    region: 'US',    hint: '美国国债 / 投资级债' },
    { id: 'crypto',    name: '加密资产',       nameTw: '加密資產',       vol: 60,  mdd: -83,  kind: 'crypto',  region: 'GL',    hint: 'BTC / ETH' },
    { id: 'cash',      name: '现金/货币',      nameTw: '現金/貨幣',      vol: 0.5, mdd: -0.5, kind: 'cash',    region: 'GL',    hint: '货币基金 / 存款 / 短债' }
  ];

  /* ---- 相关系数矩阵（只存上三角，按行拼接，共 136 项） ---- */
  var UPPER = [
    /* 0  cn_broad  */  0.88, 0.90, 0.78, 0.72, 0.55, 0.28, 0.30, 0.32, 0.45, 0.35, 0.08, 0.18, -0.05, 0.00, 0.22, 0.00,
    /* 1  cn_growth */  0.86, 0.62, 0.68, 0.58, 0.32, 0.40, 0.34, 0.48, 0.30, 0.05, 0.15, -0.12, -0.05, 0.28, 0.00,
    /* 2  cn_small  */  0.70, 0.70, 0.55, 0.28, 0.33, 0.30, 0.46, 0.32, 0.06, 0.20, -0.08, -0.02, 0.25, 0.00,
    /* 3  cn_div    */  0.72, 0.55, 0.30, 0.28, 0.35, 0.45, 0.45, 0.10, 0.22, 0.02, 0.02, 0.20, 0.00,
    /* 4  hk        */  0.62, 0.45, 0.48, 0.50, 0.60, 0.50, 0.10, 0.20, -0.02, 0.02, 0.30, 0.00,
    /* 5  tw        */  0.60, 0.68, 0.40, 0.55, 0.45, 0.08, 0.20, -0.02, 0.05, 0.35, 0.00,
    /* 6  us        */  0.85, 0.78, 0.65, 0.60, 0.05, 0.20, -0.02, 0.15, 0.40, 0.00,
    /* 7  us_tech   */  0.65, 0.60, 0.50, 0.06, 0.15, -0.05, 0.10, 0.50, 0.00,
    /* 8  jp_eu     */  0.62, 0.52, 0.08, 0.22, -0.02, 0.10, 0.35, 0.00,
    /* 9  em        */  0.45, 0.12, 0.35, 0.00, 0.05, 0.40, 0.00,
    /* 10 reits     */  0.15, 0.20, 0.10, 0.25, 0.30, 0.00,
    /* 11 gold      */  0.45, 0.10, 0.25, 0.20, 0.00,
    /* 12 commod    */  -0.10, -0.05, 0.25, 0.00,
    /* 13 bond_cn   */  0.25, -0.05, 0.10,
    /* 14 bond_us   */  0.05, 0.20,
    /* 15 crypto    */  0.00
  ];

  var N = ASSETS.length;
  var IDX = {};
  for (var i = 0; i < N; i++) IDX[ASSETS[i].id] = i;

  /* 展开成 N×N 对称矩阵 */
  var CORR = [];
  (function () {
    var k = 0, r, c;
    for (r = 0; r < N; r++) {
      CORR[r] = [];
      for (c = 0; c < N; c++) CORR[r][c] = 0;
      CORR[r][r] = 1;
    }
    for (r = 0; r < N; r++) {
      for (c = r + 1; c < N; c++) {
        var v = UPPER[k++];
        CORR[r][c] = v;
        CORR[c][r] = v;
      }
    }
    if (k !== UPPER.length) throw new Error('相关系数矩阵长度不匹配: ' + k + ' vs ' + UPPER.length);
  })();

  /* ---- 常用代码 / 名称别名 → 资产类别 ---- */
  var ALIASES = {
    /* A股宽基 */
    '510300': 'cn_broad', '159919': 'cn_broad', '510310': 'cn_broad', '159352': 'cn_broad',
    '沪深300': 'cn_broad', '中证A500': 'cn_broad', '上证50': 'cn_broad', '510050': 'cn_broad', '宽基': 'cn_broad',
    /* A股成长 */
    '159915': 'cn_growth', '588000': 'cn_growth', '588080': 'cn_growth', '512480': 'cn_growth', '515790': 'cn_growth',
    '512660': 'cn_growth', '516160': 'cn_growth', '512000': 'cn_growth', '159995': 'cn_growth', '159819': 'cn_growth',
    '创业板': 'cn_growth', '科创': 'cn_growth', '半导体': 'cn_growth', '新能源': 'cn_growth', '军工': 'cn_growth',
    /* A股中小盘 */
    '510500': 'cn_small', '512100': 'cn_small', '159922': 'cn_small', '563300': 'cn_small',
    '中证500': 'cn_small', '中证1000': 'cn_small', '中小盘': 'cn_small', '北证': 'cn_small',
    /* A股红利 */
    '510880': 'cn_div', '515180': 'cn_div', '512890': 'cn_div', '159928': 'cn_div', '512690': 'cn_div',
    '512800': 'cn_div', '红利': 'cn_div', '高股息': 'cn_div', '消费': 'cn_div', '银行': 'cn_div',
    /* 港股 */
    '510900': 'hk', '159920': 'hk', '513180': 'hk', '513050': 'hk', '159740': 'hk', '513660': 'hk',
    '恒生': 'hk', '恒生科技': 'hk', '中概': 'hk', '港股': 'hk', 'H股': 'hk',
    /* 台股 */
    '0050': 'tw', '0056': 'tw', '00878': 'tw', '00919': 'tw', '00929': 'tw', '00940': 'tw',
    '006208': 'tw', '00881': 'tw', '00891': 'tw', '00982A': 'tw', '00982': 'tw',
    '台湾50': 'tw', '台股': 'tw', '元大台灣50': 'tw',
    /* 美股宽基 */
    '513500': 'us', 'SPY': 'us', 'VOO': 'us', 'IVV': 'us', 'VTI': 'us',
    '标普500': 'us', '标普': 'us', '美股': 'us',
    /* 美股科技 */
    '513100': 'us_tech', '159941': 'us_tech', '513300': 'us_tech', 'QQQ': 'us_tech', 'SMH': 'us_tech',
    '纳指': 'us_tech', '纳斯达克': 'us_tech', '费半': 'us_tech', '科技': 'us_tech',
    /* 日欧 */
    '513520': 'jp_eu', '513030': 'jp_eu', '513880': 'jp_eu', 'EWJ': 'jp_eu', 'VGK': 'jp_eu',
    '日经': 'jp_eu', '德国': 'jp_eu', '欧洲': 'jp_eu',
    /* 新兴市场 */
    'EEM': 'em', 'VWO': 'em', 'INDA': 'em', '印度': 'em', '越南': 'em', '新兴': 'em',
    /* REITs */
    'REITs': 'reits', 'reits': 'reits', '不动产': 'reits', 'VNQ': 'reits',
    /* 黄金 */
    '518880': 'gold', '159934': 'gold', '159937': 'gold', 'GLD': 'gold', 'IAU': 'gold',
    '黄金': 'gold', '金': 'gold',
    /* 大宗 */
    '162411': 'commod', '159985': 'commod', 'USO': 'commod', 'DBC': 'commod',
    '原油': 'commod', '油': 'commod', '大宗': 'commod', '有色': 'commod',
    /* 中国债券 */
    '511010': 'bond_cn', '511260': 'bond_cn', '511380': 'bond_cn', '511090': 'bond_cn',
    '国债': 'bond_cn', '债': 'bond_cn', '债券': 'bond_cn', '信用债': 'bond_cn', '转债': 'bond_cn',
    /* 美债 */
    'TLT': 'bond_us', 'IEF': 'bond_us', 'SHY': 'bond_us', '美债': 'bond_us',
    /* 加密 */
    'BTC': 'crypto', 'ETH': 'crypto', 'IBIT': 'crypto', '比特币': 'crypto', '加密': 'crypto',
    /* 现金 */
    '511990': 'cash', '511880': 'cash', '现金': 'cash', '货币': 'cash', '存款': 'cash', 'CASH': 'cash',
    /* ---- 场外基金代码（联接/指数基金，6 位，非场内交易）----
     * 来源：用户自有 ETF-Monitor 系统的「场外基金代码 → 名称 → 代理 ETF」对照表
     * （analyze_entry_v2.py / backfill_flow5_v54.py / actual_returns 三处交叉一致）。
     * 代理 ETF 均为已在上面登记的场内代码，故按代理 ETF 的类别归并。
     * 类别判定为「类别级近似」：按基金主题的风险特征归入最接近的资产类别，
     * 与工具整体的类别级口径一致（详见参数表「口径说明」）。 */
    '000216': 'gold',      /* 华安黄金联接         → sh518880 黄金ETF        */
    '004070': 'cn_growth',  /* 券商/证券主题        → sz159842 证券ETF（高 beta，按最接近的风险画像归入成长） */
    '004432': 'commod',     /* 有色金属主题         → sh512400 有色ETF        */
    '005693': 'cn_growth',  /* 军工主题             → sh512680 军工ETF        */
    '006479': 'us_tech',    /* 广发纳指联接         → sz159941 纳指ETF        */
    '007466': 'cn_div',     /* 红利低波主题         → sh512890 红利低波ETF    */
    '008888': 'cn_growth',  /* 华夏芯片联接         → sz159995 芯片ETF        */
    '011613': 'cn_growth',  /* 科创50 联接          → sh588000 科创50ETF      */
    '013180': 'cn_growth',  /* 电池/新能源主题      → sz159755 电池ETF        */
    '016008': 'cn_growth',  /* 消费电子主题         → sz159779 消费电子ETF    */
    '016185': 'cn_div',     /* 电力/公用事业主题    → sz159611 电力ETF        */
    '018135': 'cn_growth',  /* 大数据主题           → sh515400 大数据ETF      */
    '018177': 'cn_growth',  /* 科创增强             → sh588000 科创50ETF      */
    '018345': 'cn_growth',  /* 机器人主题           → sh562500 机器人ETF      */
    '018966': 'us_tech',    /* 纳指 QDII            → sh513100 纳指ETF        */
    '019072': 'cn_growth',  /* 通信设备主题         → sz159695 通信ETF        */
    '019141': 'cn_div',     /* 电信运营商联接       → sh563010 电信ETF（运营商属高股息价值类） */
    '020356': 'cn_growth',  /* 半导体材料设备主题   → sh562590 半导体材料ETF  */
    '025856': 'cn_broad',   /* 电网设备主题         → sz159326 电网设备ETF（按宽基权益风险画像归入） */
    /* 台股代码带交易所后缀的写法（天天基金/复权常见格式） */
    '00919.TW': 'tw', '00929.TW': 'tw', '00982A.TW': 'tw', '0050.TW': 'tw', '006208.TW': 'tw'
  };

  /* ---- 压力测试假设：危机情景下的相关性 ----
   * 依据：历次系统性下跌中风险资产的相关性显著抬升（相关性趋同），
   *      黄金与债券的避险属性不稳定（2022 年出现股债双杀）。
   * 这是「假设」而非「预测」，用于测试组合的脆弱性。
   *
   * 建模铁律：危机情景下相关性只允许上升，不允许下降。
   *   理由：压力测试若允许某些资产对「变得更不相关」，
   *        组合会因分散改善而显得更安全，这与压力测试目的相反。
   *   数学后果：Σ_crisis − Σ_normal 的每个非对角元 ≥ 0，
   *        故对任意正权重 wᵀ(Σ_crisis−Σ_normal)w ≥ 0，
   *        严格保证 σ_crisis ≥ σ_normal。 */
  function crisisRho(i, j, base) {
    var a = ASSETS[i], b = ASSETS[j], r;
    if (a.kind === 'cash' || b.kind === 'cash') {
      /* 现金/货币：危机中不会与其他资产「变得更相关」（本就是避风港），
       * 但建模铁律要求「只升不降」→ 维持原有相关水平。
       * 注意 i === j（对角线）时 base = 1，必须原样返回；
       * 旧版此处直接 return 0，造成两个违反铁律的后果：
       *   ① 现金-债券 ρ 由 0.10 降到 0（相关下降 → 方差变小 → 危机波动反而更低）
       *   ② 现金对角线归零 → 全现金组合危机波动变成 0（0.5% → 0%）
       * 两者都让压力测试「变得更安全」，与压力测试目的相反。 */
      return base;
    }
    if (a.kind === 'metal' || b.kind === 'metal') {
      /* 黄金：危机初期避险，流动性危机时同样被抛售 → 弱相关但会抬升 */
      r = clamp(base * 0.6 + 0.10, -0.10, 0.40);
    } else if (a.kind === 'bond' || b.kind === 'bond') {
      /* 债券：股债跷跷板在通胀型冲击中失效 → 中低正相关 */
      r = clamp(0.10 + base * 0.30, 0.00, 0.35);
    } else {
      /* 风险资产：相关性趋同，下限 0.78 */
      r = clamp(Math.max(base, 0.78), 0, 0.95);
    }
    return Math.max(base, r);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  return {
    ASSETS: ASSETS,
    CORR: CORR,
    IDX: IDX,
    ALIASES: ALIASES,
    N: N,
    crisisRho: crisisRho,
    clamp: clamp,
    byId: function (id) { return ASSETS[IDX[id]]; }
  };
});
