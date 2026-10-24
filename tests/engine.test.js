/* ============================================================
 * X-Ray Engine 不变量测试
 * 运行：node tests/engine.test.js
 * 原则：只信断言，不信「看起来对」
 * ========================================================== */
'use strict';

var LIB = require('../shared/assetlib.js');
var E = require('../shared/engine.js');

var pass = 0, fail = 0, fails = [];

function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }

/* ---------- 1. 资产库结构 ---------- */
ok('资产数量 = 17', LIB.N === 17, 'got ' + LIB.N);
ok('上三角长度 = 136', (function () {
  var n = LIB.N; return (n * (n - 1) / 2) === 136;
})());
ok('全部别名指向合法 id', (function () {
  for (var k in LIB.ALIASES) {
    if (LIB.IDX[LIB.ALIASES[k]] === undefined) return false;
  }
  return true;
})());

/* ---------- 2. 相关系数矩阵性质 ---------- */
(function () {
  var symOk = true, diagOk = true, rangeOk = true;
  for (var i = 0; i < LIB.N; i++) {
    if (!near(LIB.CORR[i][i], 1)) diagOk = false;
    for (var j = 0; j < LIB.N; j++) {
      if (!near(LIB.CORR[i][j], LIB.CORR[j][i])) symOk = false;
      if (LIB.CORR[i][j] < -1 || LIB.CORR[i][j] > 1) rangeOk = false;
    }
  }
  ok('相关矩阵对称', symOk);
  ok('相关矩阵对角为 1', diagOk);
  ok('相关系数落在 [-1,1]', rangeOk);
})();

/* ---------- 3. 协方差矩阵半正定（抽样验证 wᵀΣw ≥ 0） ---------- */
(function () {
  var bad = 0;
  for (var t = 0; t < 4000; t++) {
    var w = [], s = 0;
    for (var i = 0; i < LIB.N; i++) { var x = Math.random(); w.push(x); s += x; }
    for (var j = 0; j < LIB.N; j++) w[j] /= s;
    var cov = E.buildCov(false), v = 0;
    for (var a = 0; a < LIB.N; a++) for (var b = 0; b < LIB.N; b++) v += w[a] * cov[a][b] * w[b];
    if (v < -1e-12) bad++;
  }
  ok('协方差矩阵半正定（4000 组随机权重）', bad === 0, bad + ' 组出现负方差');
})();

/* ---------- 4. 核心不变量：Σ rcPct = 1 ---------- */
(function () {
  var ids = ['cn_broad', 'cn_growth', 'hk', 'us_tech', 'gold', 'bond_cn'];
  var worst = 0;
  for (var t = 0; t < 500; t++) {
    var hs = ids.map(function (id) {
      return { id: id, amount: Math.random() * 1e6 + 1 };
    });
    var r = E.analyze(hs);
    var sum = r.positions.reduce(function (s, p) { return s + p.rcPct; }, 0);
    worst = Math.max(worst, Math.abs(sum - 1));
  }
  ok('Σ 风险占比 = 100%（500 组随机持仓）', worst < 1e-9, '最大偏差 ' + worst);
})();

/* ---------- 5. 分散不会放大波动 ---------- */
(function () {
  var ids = ['cn_growth', 'us_tech', 'gold', 'bond_us', 'crypto'];
  var bad = 0;
  for (var t = 0; t < 500; t++) {
    var hs = ids.map(function (id) { return { id: id, amount: Math.random() * 1e5 + 1 }; });
    var r = E.analyze(hs);
    if (r.sigma > r.wAvgVol + 1e-9) bad++;
  }
  ok('σ_p ≤ Σwᵢσᵢ（500 组）', bad === 0, bad + ' 组违反');
})();

/* ---------- 6. 单一资产 ---------- */
(function () {
  var r = E.analyze([{ id: 'cn_growth', amount: 100000 }]);
  ok('单资产 σ_p = 该资产波动率', near(r.sigma, 28, 1e-9), 'got ' + r.sigma);
  ok('单资产 风险占比 = 100%', near(r.positions[0].rcPct, 1, 1e-12));
  ok('单资产 有效持仓数 = 1', near(r.nEff, 1, 1e-12));
  ok('单资产 分散比率 = 0', near(r.divRatio, 0, 1e-12));
  ok('单资产 极端回撤 = 该资产 MDD', near(r.mddWeighted, -70, 1e-9), 'got ' + r.mddWeighted);
})();

/* ---------- 7. 两笔完全相同资产 = 一笔 ---------- */
(function () {
  var r = E.analyze([
    { id: 'us_tech', amount: 50000 },
    { id: 'us_tech', amount: 50000 }
  ]);
  ok('同类持仓自动合并 → count=1', r.count === 1, 'got ' + r.count);
  ok('同类持仓 有效持仓数 = 1', near(r.nEff, 1, 1e-12));
  ok('同类持仓 无分散收益', near(r.divRatio, 0, 1e-12));
})();

/* ---------- 8. 手算校验：黄金 50% + 中国债券 50% ---------- */
(function () {
  var r = E.analyze([
    { id: 'gold', amount: 50000 },
    { id: 'bond_cn', amount: 50000 }
  ]);
  /* σ² = 0.25·0.16² + 0.25·0.04² + 2·0.5·0.5·0.10·0.16·0.04 */
  var expect = Math.sqrt(
    0.25 * Math.pow(0.16, 2) +
    0.25 * Math.pow(0.04, 2) +
    2 * 0.5 * 0.5 * 0.10 * 0.16 * 0.04
  ) * 100;
  ok('手算校验 黄金/中国债 50-50 组合波动率', near(r.sigma, expect, 1e-9),
    'got ' + r.sigma.toFixed(6) + ' expect ' + expect.toFixed(6));
})();

/* ---------- 9. 权重顺序无关 ---------- */
(function () {
  var a = E.analyze([
    { id: 'cn_broad', amount: 30000 },
    { id: 'us', amount: 50000 },
    { id: 'gold', amount: 20000 }
  ]);
  var b = E.analyze([
    { id: 'gold', amount: 20000 },
    { id: 'cn_broad', amount: 30000 },
    { id: 'us', amount: 50000 }
  ]);
  ok('权重顺序无关（波动率）', near(a.sigma, b.sigma, 1e-12));
  ok('权重顺序无关（健康分）', a.health === b.health);
})();

/* ---------- 10. 危机情景单调性 ---------- */
(function () {
  var bad = 0, worstDecay = 0;
  for (var t = 0; t < 300; t++) {
    var ids = ['cn_broad', 'hk', 'us_tech', 'gold', 'bond_cn', 'commod'];
    var hs = ids.map(function (id) { return { id: id, amount: Math.random() * 1e5 + 1 }; });
    var r = E.analyze(hs);
    if (r.sigmaCrisis < r.sigma - 1e-9) bad++;
    if (r.divDecay < -1e-9) worstDecay = Math.min(worstDecay, r.divDecay);
  }
  ok('危机情景波动率 ≥ 正常情景（300 组）', bad === 0, bad + ' 组违反');
  ok('分散衰减非负', worstDecay >= -1e-9, 'got ' + worstDecay);
})();

/* ---------- 11. 风险占比与波动率正相关 ---------- */
(function () {
  var r = E.analyze([
    { id: 'bond_cn', amount: 50000 },
    { id: 'crypto', amount: 50000 }
  ]);
  var crypto = r.positions.filter(function (p) { return p.id === 'crypto'; })[0];
  var bond = r.positions.filter(function (p) { return p.id === 'bond_cn'; })[0];
  ok('等权重下 高波动资产 风险占比更高', crypto.rcPct > bond.rcPct,
    'crypto ' + crypto.rcPct.toFixed(3) + ' vs bond ' + bond.rcPct.toFixed(3));
  ok('等权重下 低波动资产 风险占比 < 资金占比', bond.rcPct < 0.5,
    'bond rcPct=' + bond.rcPct.toFixed(3));
})();

/* ---------- 12. 健康分边界 ---------- */
(function () {
  var tests = [
    [{ id: 'crypto', amount: 100000 }],
    [{ id: 'cash', amount: 100000 }],
    [{ id: 'cn_broad', amount: 1 }, { id: 'gold', amount: 1 }, { id: 'bond_cn', amount: 1 },
     { id: 'us', amount: 1 }, { id: 'cash', amount: 1 }, { id: 'hk', amount: 1 }]
  ];
  var okRange = tests.every(function (hs) {
    var r = E.analyze(hs);
    return r.health >= 0 && r.health <= 100 && isFinite(r.health);
  });
  ok('健康分落在 [0,100] 且有限', okRange);

  var risky = E.analyze([{ id: 'crypto', amount: 100000 }]);
  var safe = E.analyze([{ id: 'bond_cn', amount: 100000 }]);
  ok('单押加密资产 健康分 < 分散低波组合', risky.health < safe.health,
    risky.health + ' vs ' + safe.health);
})();

/* ---------- 13. 隐性重叠检测 ---------- */
(function () {
  var r = E.analyze([
    { id: 'us', amount: 40000 },
    { id: 'us_tech', amount: 40000 },
    { id: 'gold', amount: 20000 }
  ]);
  ok('检测到 美股/纳指 隐性重叠', r.overlaps.length > 0);
  ok('重叠对相关性 = 0.85', r.overlaps.length > 0 && near(r.overlaps[0].rho, 0.85, 1e-12));
  ok('隐性重叠 有效持仓数 < 持仓笔数', r.nEff < r.count, 'nEff=' + r.nEff.toFixed(2) + ' count=' + r.count);
})();

/* ---------- 14. 异常输入 ---------- */
(function () {
  ok('空数组返回 null', E.analyze([]) === null);
  ok('null 返回 null', E.analyze(null) === null);
  ok('全部非法 id 返回 null', E.analyze([{ id: 'nope', amount: 100 }]) === null);
  ok('金额为 0 被忽略', E.analyze([{ id: 'gold', amount: 0 }]) === null);
  ok('负金额被忽略', E.analyze([{ id: 'gold', amount: -500 }]) === null);
  var mixed = E.analyze([
    { id: 'gold', amount: 1000 },
    { id: 'bogus', amount: 9999 },
    { id: 'us', amount: NaN }
  ]);
  ok('非法项被过滤，剩余有效项正常计算', mixed && mixed.count === 1);
})();

/* ---------- 15. 代码/名称解析 ---------- */
(function () {
  ok('解析 510300 → cn_broad', E.resolve('510300') === 'cn_broad');
  ok('解析 588000 → cn_growth', E.resolve('588000') === 'cn_growth');
  ok('解析 黄金 → gold', E.resolve('黄金') === 'gold');
  ok('解析 BTC → crypto', E.resolve('BTC') === 'crypto');
  ok('解析 0050 → tw', E.resolve('0050') === 'tw');
  ok('解析 00919 → tw', E.resolve('00919') === 'tw');
  ok('解析 不存在代码 → null', E.resolve('zzzz9999') === null);
})();

/* ---------- 15b. 场外基金代码解析（2026-10-24 评审意见 #3 补入）----------
 * 背景：场内 ETF 代码早已支持，但场外基金代码（支付宝/天天基金常见 6 位码）
 * 全部返回 null，导致中国散户输入自己的持仓毫无反应。
 * 映射来源：用户自有 ETF-Monitor 系统的「场外基金代码 → 名称 → 代理 ETF」
 * 三处交叉一致（analyze_entry_v2.py / backfill_flow5_v54.py / actual_returns）。 */
(function () {
  var cases = {
    '008888': 'cn_growth',  /* 华夏芯片联接     → sz159995 芯片ETF   */
    '019141': 'cn_div',     /* 易方达电信联接   → sh563010 电信ETF   */
    '000216': 'gold',       /* 华安黄金联接     → sh518880 黄金ETF   */
    '004432': 'commod',     /* 有色金属联接     → sh512400 有色ETF   */
    '019072': 'cn_growth',  /* 通信设备联接     → sz159695 通信ETF   */
    '011613': 'cn_growth',  /* 科创50 联接      → sh588000 科创50ETF */
    '006479': 'us_tech',    /* 广发纳指联接     → sz159941 纳指ETF   */
    '018966': 'us_tech',    /* 纳指 QDII        → sh513100 纳指ETF   */
    '007466': 'cn_div',     /* 红利低波联接     → sh512890 红利ETF   */
    '016185': 'cn_div',     /* 电力/公用事业    → sz159611 电力ETF   */
    '020356': 'cn_growth',  /* 半导体材料联接   → sh562590 半导体ETF */
    '00919.TW': 'tw',       /* 带交易所后缀的台股代码 */
    '00982A.TW': 'tw'
  };
  var bad = [];
  for (var k in cases) {
    if (E.resolve(k) !== cases[k]) bad.push(k + '→' + E.resolve(k));
  }
  ok('场外基金/带后缀台股代码解析（' + Object.keys(cases).length + ' 个）', bad.length === 0, bad.join(', '));

  /* 场外代码必须能直接参与分析，而不只是 resolve 得动 */
  var r = E.analyze([{ id: '008888', amount: 100000 }, { id: '019141', amount: 50000 }]);
  ok('场外代码可直接参与分析', !!r && r.count === 2 && r.positions.length === 2);

  /* 场外 + 场内混合：008888（芯片）与 588000（科创50）同属 cn_growth，
   * 按类别级口径合并为 1 笔——这正是工具的设计意图（同类持仓合并计算） */
  var r2 = E.analyze([
    { id: '008888', amount: 100000 },
    { id: '588000', amount: 80000 },
    { id: '019141', amount: 60000 }
  ]);
  ok('场外+场内混合：同类自动合并为 2 类', !!r2 && r2.count === 2, 'count=' + (r2 && r2.count));
  ok('场外+场内混合：金额合计 = 24 万', !!r2 && near(r2.total, 240000, 1e-9));
  ok('场外+场内混合：成长类资金 = 18 万', !!r2 && near(r2.positions.filter(function (p) { return p.id === 'cn_growth'; })[0].amount, 180000, 1e-9));
})();

/* ---------- 17. 危机铁律：相关性只升不降（2026-10-24 评审意见 #2 补入）----------
 * 旧版缺陷：crisisRho 遇现金直接 return 0，
 *   ① 现金-债券 ρ 由 0.10 降到 0（相关性下降 → 方差变小）
 *   ② 对角线 crisisRho(i,i,1) 对现金返回 0 → 全现金组合危机波动变成 0
 * 实测旧版：全现金 0.5%→0%、债券+现金 2.04%→2.00%，铁律双重失效，
 * 而原测试套件没有覆盖现金，所以 55/55 全过也没抓到。 */
(function () {
  /* ① 逐对检查（含对角线 i=j），危机相关 ≥ 正常相关 */
  var badPairs = [];
  for (var i = 0; i < LIB.N; i++) {
    for (var j = i; j < LIB.N; j++) {
      var base = LIB.CORR[i][j];
      var cr = LIB.crisisRho(i, j, base);
      if (cr < base - 1e-12) {
        badPairs.push(LIB.ASSETS[i].id + '/' + LIB.ASSETS[j].id + ': ' + base + '→' + cr);
      }
    }
  }
  ok('危机相关性只升不降（全部 ' + (LIB.N * (LIB.N + 1) / 2) + ' 对，含对角线）',
    badPairs.length === 0, badPairs.slice(0, 3).join('; '));

  /* ② 危机协方差对角线必须等于各资产波动²（现金不再归零） */
  var covC = E.buildCov(true);
  var diagBad = [];
  for (var d = 0; d < LIB.N; d++) {
    var expect = Math.pow(LIB.ASSETS[d].vol / 100, 2);
    if (!near(covC[d][d], expect, 1e-12)) diagBad.push(LIB.ASSETS[d].id);
  }
  ok('危机协方差对角线 = 各资产波动²', diagBad.length === 0, diagBad.join(','));

  /* ③ 全现金组合：危机波动 = 正常波动（0.5%），不得归零 */
  var allCash = E.analyze([{ id: 'cash', amount: 100000 }]);
  ok('全现金组合 σ_crisis ≥ σ_normal', allCash.sigmaCrisis >= allCash.sigma - 1e-9,
    allCash.sigma + '→' + allCash.sigmaCrisis);
  ok('全现金组合危机波动不归零', near(allCash.sigmaCrisis, 0.5, 1e-9),
    'got ' + allCash.sigmaCrisis);

  /* ④ 债券+现金：危机波动 ≥ 正常波动 */
  var bondCash = E.analyze([{ id: 'bond_cn', amount: 90000 }, { id: 'cash', amount: 10000 }]);
  ok('债券+现金 σ_crisis ≥ σ_normal', bondCash.sigmaCrisis >= bondCash.sigma - 1e-9,
    bondCash.sigma.toFixed(3) + '→' + bondCash.sigmaCrisis.toFixed(3));

  /* ⑤ 随机组合性质测试：覆盖全部 17 类资产（含现金），5000 组随机组合
   *    这是「数学保证」的真正守卫——任何让 σ_crisis < σ_normal 的改动都会在这里炸 */
  var allIds = LIB.ASSETS.map(function (a) { return a.id; });
  var bad = [], worstGap = 0;
  var seed = 20261024;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  for (var t = 0; t < 5000; t++) {
    var k = 1 + Math.floor(rnd() * allIds.length);
    var pool = allIds.slice();
    var pick = [];
    for (var s = 0; s < k; s++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    var hs = pick.map(function (id) { return { id: id, amount: rnd() * 1e6 + 1 }; });
    var r = E.analyze(hs);
    if (!r) continue;
    var gap = r.sigma - r.sigmaCrisis;
    if (gap > worstGap) worstGap = gap;
    if (r.sigmaCrisis < r.sigma - 1e-9) bad.push(pick.join('+'));
  }
  ok('σ_crisis ≥ σ_normal（5000 组随机组合，含现金）', bad.length === 0,
    bad.length + ' 组违例，最大差 ' + worstGap.toFixed(6) + ' 个百分点');

  /* ⑥ 分散力衰退不得为负（危机分散效果不应「变好」） */
  var decBad = [];
  for (var u = 0; u < 300; u++) {
    var pool2 = allIds.slice();
    var pick2 = [];
    var k2 = 2 + Math.floor(rnd() * 6);
    for (var s2 = 0; s2 < k2; s2++) pick2.push(pool2.splice(Math.floor(rnd() * pool2.length), 1)[0]);
    var rr = E.analyze(pick2.map(function (id) { return { id: id, amount: rnd() * 1e6 + 1 }; }));
    if (rr && rr.divDecay < -1e-9) decBad.push(rr.divDecay.toFixed(4));
  }
  ok('危机分散力衰退 ≥ 0（300 组随机组合）', decBad.length === 0, decBad.slice(0, 3).join(','));
})();

/* ---------- 16. VaR 与金额一致性 ---------- */
(function () {
  var r = E.analyze([
    { id: 'cn_broad', amount: 60000 },
    { id: 'bond_cn', amount: 40000 }
  ]);
  ok('VaR 金额 = 总额 × VaR%', near(r.var95, r.total * r.var95Pct / 100, 1e-6));
  var sumPos = r.positions.reduce(function (s, p) { return s + p.amount; }, 0);
  ok('持仓金额之和 = 总市值', near(sumPos, r.total, 1e-9));
  var sumW = r.positions.reduce(function (s, p) { return s + p.wPct; }, 0);
  ok('Σ 资金占比 = 100%', near(sumW, 1, 1e-12));
})();

/* ---------- 17. 双语输出 ---------- */
(function () {
  var hs = [
    { id: 'cn_growth', amount: 60000 },
    { id: 'us_tech', amount: 30000 },
    { id: 'gold', amount: 10000 }
  ];
  var cn = E.analyze(hs, { lang: 'cn' });
  var tw = E.analyze(hs, { lang: 'tw' });
  ok('cn/tw 都能产出结论', cn.findings.length > 0 && tw.findings.length > 0);
  ok('cn/tw 结论数量一致', cn.findings.length === tw.findings.length);
  ok('tw 结论不含简体「风险」', !/风险/.test(tw.findings.map(function (f) { return f.title + f.detail; }).join('')));
  ok('cn 结论含简体「风险」', /风险/.test(cn.findings.map(function (f) { return f.title + f.detail; }).join('')));
  var noUndef = tw.findings.every(function (f) {
    return f.title.indexOf('undefined') < 0 && f.detail.indexOf('undefined') < 0 &&
           f.title.indexOf('NaN') < 0 && f.detail.indexOf('NaN') < 0;
  });
  ok('tw 结论无 undefined / NaN', noUndef);
  ok('lang 透传正确', cn.lang === 'cn' && tw.lang === 'tw');
})();

/* ---------- 18. 模糊名称解析 ---------- */
(function () {
  ok('模糊解析「标普500」→ us', E.resolve('标普500') === 'us');
  ok('模糊解析「纳指」→ us_tech', E.resolve('纳指') === 'us_tech');
  ok('模糊解析「恒生科技」→ hk', E.resolve('恒生科技') === 'hk');
  ok('单字不触发模糊误配', E.resolve('金') === 'gold');
})();

/* ---------- 19. ENB 权重版回归（最终修改指令单） ---------- */
(function () {
  var B = 500000;
  function mk(list) {
    return list.map(function (kv) { return { id: kv[0], amount: Math.round(B * kv[1] / 100) }; });
  }
  /* 19a. 99.9% 单押 + 3 笔零头 → ENB = 1.0，且触发伪分散高危提示
   * （旧版未加权 ENB 会算出 3.9，结论还写「没有发现结构性风险集中」） */
  var extreme = E.analyze([
    { id: 'crypto', amount: 499500 },
    { id: 'bond_cn', amount: 150 },
    { id: 'cash', amount: 150 },
    { id: 'gold', amount: 150 }
  ], { lang: 'cn' });
  ok('99.9% 单押 ENB = 1.0', near(extreme.enb, 1.0, 0.05), 'got ' + extreme.enb.toFixed(2));
  ok('99.9% 单押触发伪分散高危', extreme.findings.some(function (f) { return f.tag === '伪分散'; }));
  ok('99.9% 单押 nEff 同步趋近 1', extreme.nEff < 1.1, 'got ' + extreme.nEff.toFixed(2));

  /* 19b. 任意组合 ENB ≤ nEff（随机 2000 组，可复现 seed） */
  var seed = 20261024;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  var viol = 0;
  for (var t = 0; t < 2000; t++) {
    var m = 2 + Math.floor(rnd() * 5), w = [], s = 0, i;
    for (i = 0; i < m; i++) { w.push(rnd()); s += w[i]; }
    for (i = 0; i < m; i++) w[i] /= s;
    /* 随机抽 m 个不重复资产 */
    var pool = [], used = {};
    for (i = 0; i < LIB.N; i++) pool.push(i);
    for (i = pool.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var ids = [], ws = [];
    for (i = 0; i < m; i++) { ids.push(pool[i]); ws.push(w[i]); }
    var r = E.analyze(ids.map(function (id, k) { return { id: LIB.ASSETS[id].id, amount: Math.round(ws[k] * 1000000) }; }), { lang: 'cn' });
    if (r && r.enb > r.nEff + 1e-9) viol++;
  }
  ok('随机 2000 组 ENB ≤ nEff', viol === 0, viol + ' 组越界');

  /* 19c. 全部同一资产类别（同 id / 同类别代码）→ 合并为 1 笔 → ENB = 1 */
  var same = E.analyze([{ id: '008888', amount: 180000 }, { id: '588000', amount: 120000 }, { id: 'cn_growth', amount: 60000 }], { lang: 'cn' });
  ok('同类合并后 count = 1', same.count === 1, 'got ' + same.count);
  ok('同类合并后 ENB = 1', near(same.enb, 1.0, 1e-9), 'got ' + same.enb.toFixed(2));

  /* 19d. 保守型、股债 50/50、债70/现金30 → 不出现伪分散提示（权重版阈值不应误报） */
  var cons = E.analyze(mk([['bond_cn', 40], ['cn_div', 25], ['gold', 15], ['cash', 20]]), { lang: 'cn' });
  ok('保守型无伪分散提示', !cons.findings.some(function (f) { return f.tag === '伪分散' || f.tag === '偏集中'; }));
  var sb = E.analyze(mk([['bond_cn', 50], ['us', 50]]), { lang: 'cn' });
  ok('股债 50/50 无伪分散提示', !sb.findings.some(function (f) { return f.tag === '伪分散' || f.tag === '偏集中'; }));
  ok('股债 50/50 ENB ≤ nEff', sb.enb <= sb.nEff + 1e-9, 'enb=' + sb.enb.toFixed(2) + ' nEff=' + sb.nEff.toFixed(2));
  var bc = E.analyze(mk([['bond_cn', 70], ['cash', 30]]), { lang: 'cn' });
  ok('债70/现金30 无伪分散提示（纯防御组合不误报）', !bc.findings.some(function (f) { return f.tag === '伪分散' || f.tag === '偏集中'; }),
    'ENB=' + bc.enb.toFixed(2) + ' m=' + bc.m);

  /* 19e. 权威数字表九情境（指令单 v2 第四节，文档与简报照抄） */
  var table = [
    ['Demo 成长18/美科15/金6/债4', [['cn_growth', 18], ['us_tech', 15], ['gold', 6], ['bond_cn', 4]], 17.2, 3.1, 2.3, 62, '伪分散'],
    ['保守型 债40/红利25/金15/现金20', [['bond_cn', 40], ['cn_div', 25], ['gold', 15], ['cash', 20]], 5.2, 3.5, 3.1, 78, ''],
    ['均衡型 宽基25/美股25/债25/金15/港股10', [['cn_broad', 25], ['us', 25], ['bond_cn', 25], ['gold', 15], ['hk', 10]], 9.7, 4.5, 3.1, 77, '偏集中'],
    ['股债平衡 宽基60/中债40', [['cn_broad', 60], ['bond_cn', 40]], 12.0, 1.9, 1.9, 56, ''],
    ['跨国双股 成长50/美科技50', [['cn_growth', 50], ['us_tech', 50]], 21.8, 2.0, 1.4, 58, '伪分散'],
    ['全押中港5类等权', [['cn_growth', 20], ['cn_small', 20], ['cn_broad', 20], ['cn_div', 20], ['hk', 20]], 20.3, 5.0, 1.2, 56, '伪分散'],
    ['单押A股 成长50/中小50', [['cn_growth', 50], ['cn_small', 50]], 25.6, 2.0, 1.1, 49, '伪分散'],
    ['100% A股宽基', [['cn_broad', 100]], 20.0, 1.0, 1.0, 51, ''],
    ['99.9%加密+3零头', [['crypto', 99.91], ['gold', 0.03], ['bond_cn', 0.03], ['cash', 0.03]], 59.9, 1.0, 1.0, 40, '伪分散']
  ];
  table.forEach(function (row) {
    var r = E.analyze(mk(row[1]), { lang: 'cn' });
    ok(row[0] + ' σ=' + row[2] + '%', near(r.sigma, row[2], 0.06), 'got ' + r.sigma.toFixed(2));
    ok(row[0] + ' nEff=' + row[3], near(r.nEff, row[3], 0.06), 'got ' + r.nEff.toFixed(2));
    ok(row[0] + ' ENB=' + row[4], near(r.enb, row[4], 0.06), 'got ' + r.enb.toFixed(2));
    ok(row[0] + ' 健康分=' + row[5], r.health === row[5], 'got ' + r.health);
    var pseudo = r.findings.filter(function (f) { return f.tag === '伪分散' || f.tag === '偏集中'; })
      .map(function (f) { return f.tag; }).join('');
    ok(row[0] + ' 押注提示=' + (row[6] || '无'), pseudo === row[6], 'got ' + (pseudo || '无'));
  });

  /* 19f. 防御资产单调性（指令单 v2 新硬伤守卫）：
   *   任一单一风险资产加入 20/40/60% 的债券或现金，健康分不得下降。
   *   修复前 68/84 组降分（100% 成长 48 分 → 股债 50/50 仅 32 分）。 */
  var riskIds = LIB.ASSETS.filter(function (a) { return a.kind !== 'bond' && a.kind !== 'cash'; })
    .map(function (a) { return a.id; });
  var monoBad = [], monoTotal = 0;
  riskIds.forEach(function (id) {
    [20, 40, 60].forEach(function (pct) {
      ['bond_cn', 'cash'].forEach(function (def) {
        var base = E.analyze([{ id: id, amount: 1000000 }], { lang: 'cn' }).health;
        var mixed = E.analyze([
          { id: id, amount: 1000000 * pct / 100 },
          { id: def, amount: 1000000 * (100 - pct) / 100 }
        ], { lang: 'cn' }).health;
        monoTotal++;
        if (mixed < base) monoBad.push(id + '+' + pct + '%' + def + ': ' + base + '→' + mixed);
      });
    });
  });
  ok('防御资产单调性：' + monoTotal + ' 组对照健康分不降', monoBad.length === 0,
    monoBad.length + ' 组违例，如 ' + monoBad.slice(0, 2).join('; '));

  /* 19g. 随机版单调性：随机组合把 30% 市值挪到中国债，健康分不得下降（2000 组） */
  var seed2 = 20261024;
  function rnd2() { seed2 = (seed2 * 1103515245 + 12345) % 2147483648; return seed2 / 2147483648; }
  var randBad = 0, randTotal = 0;
  for (var t2 = 0; t2 < 2000; t2++) {
    var k2 = 2 + Math.floor(rnd2() * 4);
    var pool2 = LIB.ASSETS.map(function (a) { return a.id; }).filter(function (x) { return x !== 'bond_cn'; });
    var pick2 = [];
    for (var s2 = 0; s2 < k2; s2++) pick2.push(pool2.splice(Math.floor(rnd2() * pool2.length), 1)[0]);
    var before = pick2.map(function (id) { return { id: id, amount: rnd2() * 1e6 + 1 }; });
    var sum2 = before.reduce(function (a, b2) { return a + b2.amount; }, 0);
    var after = before.map(function (x) { return { id: x.id, amount: x.amount * 0.7 }; });
    after.push({ id: 'bond_cn', amount: sum2 * 0.3 });
    var r1 = E.analyze(before, { lang: 'cn' });
    var r2 = E.analyze(after, { lang: 'cn' });
    if (r1 && r2) { randTotal++; if (r2.health < r1.health) randBad++; }
  }
  ok('随机单调性：2000 组「+30% 中国债」健康分不降', randBad === 0,
    randBad + ' / ' + randTotal + ' 组降分');

  /* 19h. Demo 诊断结论不受影响：资金 vs 风险错配照旧呈现 */
  var demoR = E.analyze(mk([['cn_growth', 18], ['us_tech', 15], ['gold', 6], ['bond_cn', 4]]), { lang: 'cn' });
  ok('Demo 仍提示「占资金 41.9% 吃 60.2% 波动」',
    demoR.findings.some(function (f) { return f.tag === '风险错配' && /60\.2/.test(f.title); }));
  ok('Demo 健康分 62（基本稳健·有偏科）', demoR.health === 62, 'got ' + demoR.health);
})();

/* ---------- 输出 ---------- */
console.log('');
console.log('════════════════════════════════════════');
console.log('  X-Ray Engine 不变量测试');
console.log('════════════════════════════════════════');
console.log('  通过: ' + pass);
console.log('  失败: ' + fail);
if (fail) {
  console.log('────────────────────────────────────────');
  fails.forEach(function (f, i) { console.log('  ✗ ' + (i + 1) + '. ' + f); });
}
console.log('════════════════════════════════════════');

/* 附带输出一份示例报告，人工核对可读性（与权威数字表 Demo 完全一致） */
var demo = E.analyze([
  { id: 'cn_growth', amount: 180000 },
  { id: 'us_tech', amount: 150000 },
  { id: 'gold', amount: 60000 },
  { id: 'bond_cn', amount: 40000 }
]);
if (demo) {
  console.log('');
  console.log('【示例】总市值 ' + (demo.total / 10000).toFixed(1) + ' 万 · 健康分 ' + demo.health);
  console.log('  年化波动 ' + demo.sigma.toFixed(2) + '%  |  危机情景 ' + demo.sigmaCrisis.toFixed(2) +
    '%  |  有效持仓 ' + demo.nEff.toFixed(2) + ' / ' + demo.count + '  |  有效押注 ' + demo.enb.toFixed(2));
  console.log('  ' + '资产'.padEnd(16) + '资金'.padEnd(9) + '风险');
  demo.positions.forEach(function (p) {
    console.log('  ' + p.name.padEnd(14) + (p.wPct * 100).toFixed(1).padStart(6) + '%  ' +
      (p.rcPct * 100).toFixed(1).padStart(6) + '%');
  });
  console.log('');
  demo.findings.forEach(function (f) {
    console.log('  [' + f.level.toUpperCase() + '] ' + f.title);
  });
  console.log('');
}

process.exit(fail ? 1 : 0);
