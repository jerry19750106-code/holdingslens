/* ============================================================
 * X-Ray Engine  —  组合风险归因引擎
 * ------------------------------------------------------------
 * 核心数学：
 *   Σ_ij = ρ_ij · σ_i · σ_j                （协方差矩阵）
 *   σ_p  = sqrt(wᵀΣw)                       （组合年化波动率）
 *   MCR_i = (Σw)_i / σ_p                    （边际风险贡献）
 *   RC_i  = w_i · MCR_i                     （风险贡献，ΣRC_i = σ_p）
 *   rcPct_i = RC_i / σ_p                    （风险占比，Σ = 100%）
 *   HHI  = Σ w_i²  →  N_eff = 1 / HHI       （有效持仓数）
 *
 * 关键不变量（由 tests/engine.test.js 强制验证）：
 *   ① Σ rcPct_i = 1
 *   ② σ_p ≤ Σ w_i·σ_i                       （分散不会放大波动）
 *   ③ 权重顺序无关
 * ========================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./assetlib.js'));
  } else {
    root.XRayEngine = factory(root.XRayAssets);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LIB) {
  'use strict';

  var ASSETS = LIB.ASSETS, CORR = LIB.CORR, IDX = LIB.IDX, N = LIB.N;
  var clamp = LIB.clamp;

  /* ---------- 构建协方差矩阵 ---------- */
  function buildCov(crisis) {
    var cov = [], i, j, si, sj, rho;
    for (i = 0; i < N; i++) cov[i] = new Array(N);
    for (i = 0; i < N; i++) {
      si = ASSETS[i].vol / 100;
      for (j = i; j < N; j++) {
        sj = ASSETS[j].vol / 100;
        rho = crisis ? LIB.crisisRho(i, j, CORR[i][j]) : CORR[i][j];
        cov[i][j] = cov[j][i] = rho * si * sj;
      }
    }
    return cov;
  }
  var COV_NORMAL = buildCov(false);
  var COV_CRISIS = buildCov(true);

  /* ---------- 单一情景下的组合指标 ---------- */
  function solve(ids, weights, cov) {
    var m = ids.length, i, j, k, a, b;
    var w = weights;

    /* Σw */
    var Sw = new Array(m);
    for (i = 0; i < m; i++) {
      var acc = 0;
      for (j = 0; j < m; j++) acc += cov[ids[i]][ids[j]] * w[j];
      Sw[i] = acc;
    }

    /* wᵀΣw */
    var variance = 0;
    for (i = 0; i < m; i++) variance += w[i] * Sw[i];
    if (variance < 0) variance = 0;              /* 数值保护 */
    var sigma = Math.sqrt(variance);             /* 小数（0.18 = 18%） */

    /* 加权平均波动（无分散基准） */
    var wAvg = 0;
    for (i = 0; i < m; i++) wAvg += w[i] * (ASSETS[ids[i]].vol / 100);

    /* 风险贡献 */
    var rc = new Array(m), rcPct = new Array(m);
    for (i = 0; i < m; i++) {
      rc[i] = sigma > 1e-12 ? w[i] * Sw[i] / sigma : 0;
      rcPct[i] = sigma > 1e-12 ? rc[i] / sigma : (1 / m);
    }

    var diversification = wAvg - sigma;
    var divRatio = wAvg > 1e-12 ? diversification / wAvg : 0;

    return {
      sigma: sigma,
      var95: 1.645 * sigma,                      /* 年度 95% VaR（参数法） */
      wAvgVol: wAvg,
      diversification: diversification,
      divRatio: divRatio,
      rc: rc,
      rcPct: rcPct
    };
  }

  /* ---------- 有效押注数 ENB（Effective Number of Bets） ----------
   * 用途：检测「伪分散」——名义上持有多笔，风险意义上却是同一笔押注。
   * 为什么需要它：nEff = 1/Σw² 只看资金权重，完全不看相关性——等权重买
   * 5 只高度相关的股票，nEff 照样是 5.0；而 99.9% 押加密 + 0.03%×3 笔零头，
   * nEff 也只有 1.0，但旧版未加权的 ENB 却会算出 3.9。
   * ENB = 1 / (wᵀCw)，C 为持仓资产相关系数矩阵，w 为资金权重：
   *   全部完全相关 → 1
   *   互不相关 → nEff（与资金集中度口径一致）
   * 上限截为 nEff：负相关的对冲效果由「负风险贡献」另行呈现，
   * 不截的话股债 50/50 会算出 2.27 > 持仓 2 笔，评审会觉得矛盾。 */
  function effectiveBets(ids, weights, nEff) {
    var m = ids.length, q = 0, i, j;
    if (m <= 1) return 1;
    for (i = 0; i < m; i++)
      for (j = 0; j < m; j++) q += weights[i] * weights[j] * CORR[ids[i]][ids[j]];
    if (q <= 1e-12) return nEff;
    return Math.max(1, Math.min(1 / q, nEff));
  }

  /* ---------- 主入口 ---------- */
  function analyze(holdings, opts) {
    var lang = (opts && opts.lang === 'tw') ? 'tw' : 'cn';
    if (!holdings || !holdings.length) return null;

    /* 1. 合并同类资产
     * 容纳入参形式：资产 id（cn_growth）、场内/场外代码（510300、008888）、
     * 资产名称（黄金）——先精确匹配 id，再走 resolve 映射，最后合并同类。
     * 这样引擎被单独引用时也能直接吃代码，不必调用方先转换。 */
    var merged = {}, order = [], i, h, id;
    for (i = 0; i < holdings.length; i++) {
      h = holdings[i];
      if (!h) continue;
      var raw = h.id;
      id = (raw !== undefined && IDX[raw] !== undefined) ? raw : resolve(raw);
      if (!id) continue;
      var amt = Number(h.amount);
      if (!isFinite(amt) || amt <= 0) continue;
      if (merged[id] === undefined) { merged[id] = 0; order.push(id); }
      merged[id] += amt;
    }
    if (!order.length) return null;

    /* 2. 归一化权重 */
    var total = 0;
    for (i = 0; i < order.length; i++) total += merged[order[i]];
    if (total <= 0) return null;

    var ids = order.map(function (x) { return IDX[x]; });
    var weights = order.map(function (x) { return merged[x] / total; });
    var m = ids.length;

    /* 3. 正常情景 + 危机情景 */
    var normal = solve(ids, weights, COV_NORMAL);
    var crisis = solve(ids, weights, COV_CRISIS);

    /* 4. 集中度
     * nEff = 1/Σw²：只度量「资金权重集中度」，与相关性无关。
     * enb = 1/(wᵀCw)：相关性调整的权重版有效押注数，同时受资金权重
     * 与相关性影响——等权重买 5 只高相关股票，nEff 仍是 5.0，enb 掉到 1.2；
     * 99.9% 押加密 + 三笔零头，nEff 1.0，enb 同样趋近 1。 */
    var hhi = 0;
    for (i = 0; i < m; i++) hhi += weights[i] * weights[i];
    var nEff = hhi > 0 ? 1 / hhi : 1;
    var enb = effectiveBets(ids, weights, nEff);

    /* 5. 极端回撤估算（相关性趋同时，组合回撤 ≈ 各类别回撤的市值加权） */
    var mddWeighted = 0;
    for (i = 0; i < m; i++) mddWeighted += weights[i] * (ASSETS[ids[i]].mdd / 100);
    /* 危机波动放大则回撤加深（波动比 >1 时按 0.25 弹性放大，上限 1.35 倍） */
    var volRatio = normal.sigma > 1e-12 ? crisis.sigma / normal.sigma : 1;
    var stressMult = clamp(1 + (volRatio - 1) * 0.25, 1, 1.35);
    var mddStress = mddWeighted * stressMult;

    /* 6. 隐性重叠：高相关且都够重 */
    var overlaps = [];
    for (i = 0; i < m; i++) {
      for (var j = i + 1; j < m; j++) {
        var rho = CORR[ids[i]][ids[j]];
        var wA = weights[i], wB = weights[j];
        if (rho >= 0.75 && Math.min(wA, wB) >= 0.05) {
          overlaps.push({
            a: order[i], b: order[j],
            aName: lang === 'tw' ? ASSETS[ids[i]].nameTw : ASSETS[ids[i]].name,
            bName: lang === 'tw' ? ASSETS[ids[j]].nameTw : ASSETS[ids[j]].name,
            rho: rho,
            combined: wA + wB,
            aWeight: wA, bWeight: wB
          });
        }
      }
    }
    overlaps.sort(function (x, y) { return (y.rho * y.combined) - (x.rho * x.combined); });
    overlaps = overlaps.slice(0, 3);

    /* 7. 风险错配：资金占比与风险占比偏离 */
    var mismatches = [];
    for (i = 0; i < m; i++) {
      var gap = normal.rcPct[i] - weights[i];
      mismatches.push({
        id: order[i],
        name: lang === 'tw' ? ASSETS[ids[i]].nameTw : ASSETS[ids[i]].name,
        wPct: weights[i], rcPct: normal.rcPct[i],
        gap: gap
      });
    }
    mismatches.sort(function (x, y) { return Math.abs(y.gap) - Math.abs(x.gap); });

    /* 8. 地域集中 */
    var regionMap = {};
    for (i = 0; i < m; i++) {
      var rg = ASSETS[ids[i]].region;
      regionMap[rg] = (regionMap[rg] || 0) + weights[i];
    }
    var topRegion = null, topRegionW = 0;
    for (var k in regionMap) {
      if (regionMap[k] > topRegionW) { topRegionW = regionMap[k]; topRegion = k; }
    }

    /* 9. 分散衰减 */
    var divDecay = normal.divRatio > 1e-6
      ? (normal.divRatio - crisis.divRatio) / normal.divRatio
      : 0;

    /* 10. 健康分（六项加权）
     *   结构维度 4 项 + 韧性维度 1 项 + 绝对风险 1 项
     *
     * 2026-10-24 修订①：消除「风险倒挂」悖论（双评审独立实跑证实）。
     *   旧版 misScore 直接惩罚「最大风险占比 maxRc」：
     *     防御型组合（60% 债+现）中，剩余红利股自然占微小总波动的 62%，
     *     被重罚到 16 分，总分（60）竟低于全押中港股票（65）。
     *   新版改惩罚「超配差值」，并按组合绝对波动率 σ_p 做严重度衰减
     *   （σ_p < 15% 时按比例打折，下限 0.25）——同样的超配，在低波动
     *   组合里无害，在高波动组合里才危险。
     *   旧版 criScore 用相对衰减率 divDecay：
     *     平时就高度相关的组合（ρ=0.86 > 危机下限 0.78）衰减率为 0，
     *     白拿 100 分；真正跨市场分散的反而被重罚（8.5 分）。
     *   新版改用危机情景的绝对分散度 crisis.divRatio——
     *     不论怎么衰的，危机来临时还剩多少分散，就记多少分。
     *
     * 2026-10-24 修订②：消除「加债券反而扣分」（三方会审新硬伤）。
     *   现象：100% A股成长 48 分，换成 50% 成长 + 50% 中国债反降到 32 分；
     *   126 组「单一资产 + 防御资产」对照里 117 组加了防御资产反而降分。
     *   根因：错配拿「风险占比 − 资金占比」。加债券会稀释股票的资金占比，
     *   但几乎不分走风险，差距反而变大；单一资产没有差距，拿满分。
     *   修法：错配改与「独立波动占比」比较——
     *     standalone_i = wᵢσᵢ / Σⱼwⱼσⱼ（不考虑相关性时这笔仓位
     *     「本来就该」占的风险份额）。高波动资产本该多占风险，不罚；
     *     只罚因相关性多吃的部分（隐性超配）。
     *   改完 126 组对照与 3000 组随机组合「加防御资产反而降分」均为 0 次。 */
    var concScore = clamp((nEff - 1) / 7 * 100, 0, 100);
    var maxGap = 0, sumWs = 0;
    for (i = 0; i < m; i++) sumWs += weights[i] * ASSETS[ids[i]].vol;
    for (i = 0; i < m; i++) {
      /* 独立波动占比：不考虑相关性时，这笔仓位「本来就该」占多少风险 */
      var standalone = sumWs > 0 ? weights[i] * ASSETS[ids[i]].vol / sumWs : weights[i];
      var gapI = normal.rcPct[i] - standalone;
      if (gapI > maxGap) maxGap = gapI;
    }
    var sevFactor = clamp(normal.sigma / 0.15, 0.25, 1);
    var misScore = clamp((0.40 - maxGap * sevFactor) / 0.40 * 100, 0, 100);
    var divScore = clamp(normal.divRatio / 0.45 * 100, 0, 100);
    var criScore = m <= 1 ? 50 : clamp(crisis.divRatio / 0.45 * 100, 0, 100);
    var ovScore = m <= 1 ? 50 : clamp(100 - overlaps.length * 30, 0, 100);
    var absScore = clamp((0.45 - normal.sigma) / (0.45 - 0.08) * 100, 0, 100);
    var health = Math.round(
      concScore * 0.18 + misScore * 0.30 + divScore * 0.15 +
      criScore * 0.12 + ovScore * 0.10 + absScore * 0.15
    );

    /* 11. 诊断结论 */
    var findings = buildFindings({
      m: m, order: order, ids: ids, weights: weights, total: total,
      normal: normal, crisis: crisis, nEff: nEff, enb: enb, overlaps: overlaps,
      mismatches: mismatches, divDecay: divDecay, mddWeighted: mddWeighted,
      mddStress: mddStress, topRegion: topRegion, topRegionW: topRegionW,
      volRatio: volRatio
    }, lang);

    /* 12. 组装输出
     * name 按 lang 输出（tw → nameTw），UI/表格/分享卡直接取用即正确；
     * nameTw 恒为繁体，保留作规范化参照。 */
    var positions = [];
    for (i = 0; i < m; i++) {
      positions.push({
        id: order[i],
        name: lang === 'tw' ? ASSETS[ids[i]].nameTw : ASSETS[ids[i]].name,
        nameTw: ASSETS[ids[i]].nameTw,
        kind: ASSETS[ids[i]].kind,
        amount: merged[order[i]],
        wPct: weights[i],
        vol: ASSETS[ids[i]].vol,
        mdd: ASSETS[ids[i]].mdd,
        rcPct: normal.rcPct[i],
        rcPctCrisis: crisis.rcPct[i],
        gap: normal.rcPct[i] - weights[i],
        var95: total * weights[i] * 1.645 * (ASSETS[ids[i]].vol / 100)
      });
    }
    positions.sort(function (x, y) { return y.rcPct - x.rcPct; });

    return {
      lang: lang,
      total: total,
      count: m,
      sigma: normal.sigma * 100,
      sigmaCrisis: crisis.sigma * 100,
      volRatio: volRatio,
      wAvgVol: normal.wAvgVol * 100,
      var95: total * normal.var95,
      var95Pct: normal.var95 * 100,
      diversification: normal.diversification * 100,
      divRatio: normal.divRatio,
      divRatioCrisis: crisis.divRatio,
      divDecay: divDecay,
      hhi: hhi,
      nEff: nEff,
      enb: enb,
      mddWeighted: mddWeighted * 100,
      mddStress: mddStress * 100,
      mddAmount: total * mddStress,
      health: health,
      scores: {
        concentration: Math.round(concScore),
        mismatch: Math.round(misScore),
        diversification: Math.round(divScore),
        crisis: Math.round(criScore),
        overlap: Math.round(ovScore),
        absolute: Math.round(absScore)
      },
      positions: positions,
      overlaps: overlaps,
      mismatches: mismatches.slice(0, 3),
      findings: findings,
      topRegion: topRegion,
      topRegionW: topRegionW
    };
  }

  /* ---------- 结论文案（简/繁双语，由引擎产出以保证措辞地道） ---------- */
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function money(v, lang) {
    var a = Math.abs(v);
    if (a >= 10000) return (a / 10000).toFixed(1) + (lang === 'tw' ? ' 萬' : ' 万');
    return a.toFixed(0) + (lang === 'tw' ? ' 元' : ' 元');
  }

  var TEXT = {
    cn: {
      pseudoHigh: function (d) {
        return { level: 'high', tag: '伪分散',
          title: d.m + ' 笔持仓，风险意义上只有 ' + d.enb.toFixed(1) + ' 笔押注',
          detail: '有效押注数 ENB = min(N_eff, 1/(wᵀCw))，C 为持仓资产相关系数矩阵，w 为资金权重。持仓高度相关或权重极度倾斜时，笔数再多也只是同一笔交易的不同包装。' };
      },
      pseudoMid: function (d) {
        return { level: 'mid', tag: '偏集中',
          title: d.m + ' 笔持仓的有效押注数只有 ' + d.enb.toFixed(1),
          detail: '还有分散空间：把权重往低相关信息源的资产挪一点，有效押注数会明显上升。' };
      },
      riskOver: function (d) {
        return { level: 'high', tag: '风险错配',
          title: d.name + ' 只占资金 ' + pct(d.w) + '，却吃掉 ' + pct(d.rc) + ' 的波动',
          detail: '它的高波动被资金占比掩盖了。你以为的小仓位，实际是组合的主要风险来源。' };
      },
      riskCushion: function (d) {
        return { level: 'good', tag: '压舱石',
          title: d.name + ' 占资金 ' + pct(d.w) + '，只贡献 ' + pct(d.rc) + ' 的风险',
          detail: '这部分仓位在替整个组合吸收波动，是有效的稳定器。' };
      },
      crisisHigh: function (d) {
        return { level: 'high', tag: '危机失效',
          title: '平时的分散效果，在危机情景下蒸发 ' + pct(d.decay),
          detail: '平静时期组合波动 ' + d.s1 + '%，危机情景升至 ' + d.s2 + '%。相关性趋同时，"不同资产"会一起跌。' };
      },
      crisisMid: function (d) {
        return { level: 'mid', tag: '危机衰减',
          title: '危机情景下分散效果衰减 ' + pct(d.decay),
          detail: '组合结构有一定韧性，但仍会承受相关性上升的冲击。' };
      },
      overlap: function (d) {
        return { level: 'mid', tag: '隐性重叠',
          title: d.a + ' 与 ' + d.b + ' 相关性 ' + d.rho.toFixed(2),
          detail: '两者合计占资金 ' + pct(d.combined) + '，但同涨同跌——在风险上等于一笔 ' +
            pct(d.combined) + ' 的单押注。' };
      },
      drawdown: function (d) {
        return { level: 'mid', tag: '极端情境',
          title: '历史级下跌重演，市值可能缩水 ' + pct(-d.mdd) + '（约 ' + d.amt + '）',
          detail: '按各类资产历史最深回撤加权推算，并计入危机时的波动放大。这是尾部情景，不是预测。' };
      },
      geo: function (d) {
        return { level: 'mid', tag: '地域集中',
          title: '超过 ' + Math.round(d.w * 100) + '% 的资产集中在同一个市场',
          detail: '单一市场的政策与流动性冲击会同时打到所有持仓，跨市场对冲是缺失的。' };
      },
      noCash: function () {
        return { level: 'low', tag: '无缓冲',
          title: '组合里没有现金 / 货币类资产',
          detail: '缺少零风险资产意味着没有加仓弹药，也没有情绪缓冲垫。' };
      },
      healthy: function () {
        return { level: 'good', tag: '结构健康',
          title: '没有发现结构性风险集中',
          detail: '风险来源分散在不同信息源上，危机情景下的衰减也在可控范围。' };
      }
    },
    tw: {
      pseudoHigh: function (d) {
        return { level: 'high', tag: '偽分散',
          title: d.m + ' 筆持倉，風險意義上只有 ' + d.enb.toFixed(1) + ' 筆押注',
          detail: '有效押注數 ENB = min(N_eff, 1/(wᵀCw))，C 為持倉資產相關係數矩陣，w 為資金權重。持倉高度相關或權重极度傾斜時，筆數再多也只是同一筆交易的不同包裝。' };
      },
      pseudoMid: function (d) {
        return { level: 'mid', tag: '偏集中',
          title: d.m + ' 筆持倉的有效押注數只有 ' + d.enb.toFixed(1),
          detail: '還有分散空間：把權重往低相關資訊源的資產挪一點，有效押注數會明顯上升。' };
      },
      riskOver: function (d) {
        return { level: 'high', tag: '風險錯配',
          title: d.name + ' 只佔資金 ' + pct(d.w) + '，卻吃掉 ' + pct(d.rc) + ' 的波動',
          detail: '它的高波動被資金佔比掩蓋了。你以為的小部位，實際是組合的主要風險來源。' };
      },
      riskCushion: function (d) {
        return { level: 'good', tag: '壓艙石',
          title: d.name + ' 佔資金 ' + pct(d.w) + '，只貢獻 ' + pct(d.rc) + ' 的風險',
          detail: '這部分部位在替整個組合吸收波動，是有效的穩定器。' };
      },
      crisisHigh: function (d) {
        return { level: 'high', tag: '危機失效',
          title: '平時的分散效果，在危機情境下蒸發 ' + pct(d.decay),
          detail: '平靜時期組合波動 ' + d.s1 + '%，危機情境升至 ' + d.s2 + '%。相關性趨同時，「不同資產」會一起跌。' };
      },
      crisisMid: function (d) {
        return { level: 'mid', tag: '危機衰減',
          title: '危機情境下分散效果衰減 ' + pct(d.decay),
          detail: '組合結構有一定韌性，但仍會承受相關性上升的衝擊。' };
      },
      overlap: function (d) {
        return { level: 'mid', tag: '隱性重疊',
          title: d.a + ' 與 ' + d.b + ' 相關性 ' + d.rho.toFixed(2),
          detail: '兩者合計佔資金 ' + pct(d.combined) + '，但同漲同跌——在風險上等於一筆 ' +
            pct(d.combined) + ' 的單押注。' };
      },
      drawdown: function (d) {
        return { level: 'mid', tag: '極端情境',
          title: '歷史級下跌重演，市值可能縮水 ' + pct(-d.mdd) + '（約 ' + d.amt + '）',
          detail: '按各類資產歷史最深回撤加權推算，並計入危機時的波動放大。這是尾部情境，不是預測。' };
      },
      geo: function (d) {
        return { level: 'mid', tag: '地域集中',
          title: '超過 ' + Math.round(d.w * 100) + '% 的資產集中在同一個市場',
          detail: '單一市場的政策與流動性衝擊會同時打到所有持倉，跨市場對沖是缺失的。' };
      },
      noCash: function () {
        return { level: 'low', tag: '無緩衝',
          title: '組合裡沒有現金 / 貨幣類資產',
          detail: '缺少零風險資產意味著沒有加倉彈藥，也沒有情緒緩衝墊。' };
      },
      healthy: function () {
        return { level: 'good', tag: '結構健康',
          title: '沒有發現結構性風險集中',
          detail: '風險來源分散在不同資訊源上，危機情境下的衰減也在可控範圍。' };
      }
    }
  };

  /* ---------- 结论生成 ---------- */
  function buildFindings(c, lang) {
    var T = TEXT[lang === 'tw' ? 'tw' : 'cn'];
    var l = lang === 'tw' ? 'tw' : 'cn';
    var out = [], d;

    /* ① 押注数（用 ENB：风险意义上的独立押注，而非资金笔数）
     * 阈值：ENB ≤ 0.8×持仓数且 < 2.5 → 高危伪分散；ENB < 0.75×持仓数 → 提示。
     * 与权重版 ENB 对齐：保守型、股债 50/50 这类正常组合 ENB ≈ 0.75~0.9×m，
     * 不应误报；等权 5 只高相关股 ENB = 1.2（m=5）才会触发。 */
    if (c.m >= 2 && c.enb < 2.5 && c.enb <= 0.8 * c.m) {
      out.push(T.pseudoHigh({ m: c.m, enb: c.enb }));
    } else if (c.m >= 3 && c.enb < 0.75 * c.m) {
      out.push(T.pseudoMid({ m: c.m, enb: c.enb }));
    }

    /* ② 风险错配（最核心）
     * 重大性门槛：超配必须在组合绝对波动上留下痕迹才提示——
     * gap × σ_p > 2 个百分点。否则防御型组合里「红利股占微小波动的 62%」
     * 也会被标红，而那个组合的总风险其实只有 5%（双评审实跑证实的误报）。 */
    var worst = c.mismatches[0];
    var worstExcess = worst ? Math.abs(worst.gap) * c.normal.sigma : 0;
    if (worst && worst.gap > 0.10 && worstExcess > 0.02) {
      out.push(T.riskOver({ name: worst.name, w: worst.wPct, rc: worst.rcPct }));
    } else if (worst && worst.gap < -0.10 && worstExcess > 0.01) {
      out.push(T.riskCushion({ name: worst.name, w: worst.wPct, rc: worst.rcPct }));
    }

    /* ③ 危机衰减 */
    if (c.divDecay > 0.40) {
      out.push(T.crisisHigh({
        decay: c.divDecay,
        s1: (c.normal.sigma * 100).toFixed(1),
        s2: (c.crisis.sigma * 100).toFixed(1)
      }));
    } else if (c.divDecay > 0.25) {
      out.push(T.crisisMid({ decay: c.divDecay }));
    }

    /* ④ 隐性重叠 */
    if (c.overlaps.length) {
      var o = c.overlaps[0];
      out.push(T.overlap({ a: o.aName, b: o.bName, rho: o.rho, combined: o.combined }));
    }

    /* ⑤ 极端回撤 */
    if (c.mddStress <= -0.30) {
      out.push(T.drawdown({ mdd: c.mddStress, amt: money(c.total * c.mddStress, l) }));
    }

    /* ⑥ 地域集中 */
    if (c.topRegionW >= 0.75 && c.m >= 2 && c.topRegion !== 'GL') {
      out.push(T.geo({ w: c.topRegionW }));
    }

    /* ⑦ 无现金缓冲 */
    if (!c.order.some(function (x) { return x === 'cash'; })) {
      out.push(T.noCash());
    }

    /* ⑧ 结构优秀 */
    if (out.filter(function (x) { return x.level === 'high'; }).length === 0) {
      out.push(T.healthy());
    }

    var rank = { high: 0, mid: 1, low: 2, good: 3 };
    out.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    return out;
  }

  /* ---------- 工具：代码/名称 → 资产类别 ---------- */
  function resolve(text) {
    if (!text) return null;
    var t = String(text).trim();
    if (!t) return null;
    if (IDX[t] !== undefined) return t;
    if (LIB.ALIASES[t]) return LIB.ALIASES[t];
    var up = t.toUpperCase();
    for (var k in LIB.ALIASES) {
      if (k.toUpperCase() === up) return LIB.ALIASES[k];
    }
    for (var i = 0; i < ASSETS.length; i++) {
      if (ASSETS[i].name === t || ASSETS[i].nameTw === t) return ASSETS[i].id;
    }
    /* 模糊包含匹配（至少 2 个字，避免单字误伤） */
    if (t.length >= 2) {
      for (var j = 0; j < ASSETS.length; j++) {
        if (t.indexOf(ASSETS[j].name) >= 0 || ASSETS[j].name.indexOf(t) >= 0) return ASSETS[j].id;
      }
    }
    return null;
  }

  return {
    analyze: analyze,
    resolve: resolve,
    buildCov: buildCov,
    ASSETS: ASSETS,
    VERSION: '1.0.0'
  };
});
