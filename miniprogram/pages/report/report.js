const engine = require('../../shared/engine.js');
const LIB = require('../../shared/assetlib.js');
const store = require('../../utils/store.js');
const I18N = require('../../utils/i18n.js');

function scoreColor(s) {
  if (s >= 80) return '#23D18B';
  if (s >= 60) return '#0099FF';
  if (s >= 40) return '#FFA53D';
  return '#FF4D6A';
}

Page({
  data: {
    T: I18N.cn,
    score: 0,
    scoreColor: '#0099FF',
    ringDeg: 0,
    verdictT: '',
    verdictS: '',
    metrics: [],
    rows: [],
    crisis: {},
    decayText: '',
    decayNote: '',
    sim: null,
    simLead: '',
    findings: [],
    table: [],
    tableTotal: {},
    methodBlocks: [],
    methodOpen: false,
    shareOpen: false
  },

  onLoad: function () {
    const app = getApp();
    const lang = app.globalData.lang || store.getLang();
    const holdings = (app.globalData.holdings && app.globalData.holdings.length)
      ? app.globalData.holdings
      : store.getHoldings();

    if (!holdings.length) {
      wx.showToast({ title: '没有持仓数据', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }

    const r = engine.analyze(holdings, { lang: lang });
    if (!r) {
      wx.showToast({ title: '持仓数据无法解析', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }

    this.lang = lang;
    this.report = r;
    this.holdingsRaw = holdings;

    const T = I18N[lang] || I18N.cn;
    this.setData(this.buildView(r, T, lang));
  },

  /* ---------- 把引擎结果转成渲染友好的结构 ---------- */
  buildView: function (r, T, lang) {
    const pct = store.pct;
    const out = {};

    /* 分数 */
    out.score = r.health;
    out.scoreColor = scoreColor(r.health);
    out.ringDeg = Math.round(r.health / 100 * 360);
    out.T = T;

    /* 定性 */
    let v = T.verdicts[T.verdicts.length - 1];
    if (r.count <= 1 && T.verdictSingle) {
      v = T.verdictSingle;
    } else {
      for (let i = 0; i < T.verdicts.length; i++) {
        if (r.health >= T.verdicts[i].min) { v = T.verdicts[i]; break; }
      }
    }
    out.verdictT = v.t;
    out.verdictS = v.s;

    /* 指标 */
    const top = r.positions[0];
    const topRc = top ? Math.max(0, top.rcPct) : 0;
    out.metrics = [
      {
        k: T.mSigma, v: r.sigma.toFixed(1) + '%', x: T.mSigmaX,
        c: r.sigma > 25 ? 'c-danger' : (r.sigma > 15 ? 'c-warn' : 'c-good')
      },
      {
        k: T.mNEff, v: r.nEff.toFixed(1),
        x: T.mNEffX + ' ' + r.count + ' · ' + T.mNEffEnb + ' ' + r.enb.toFixed(1),
        c: r.nEff < 2.5 ? 'c-danger' : (r.nEff < 4 ? 'c-warn' : 'c-good')
      },
      {
        k: T.mMax, v: pct(topRc, 0), x: (top ? top.name + ' · ' + pct(top.wPct, 0) : '—'),
        c: topRc > 0.5 ? 'c-danger' : (topRc > 0.35 ? 'c-warn' : 'c-good')
      },
      {
        k: T.mDecay, v: pct(r.divDecay, 0), x: T.mDecayX,
        c: r.divDecay > 0.4 ? 'c-danger' : (r.divDecay > 0.25 ? 'c-warn' : 'c-good')
      },
      {
        k: T.mMDD, v: r.mddStress.toFixed(0) + '%',
        x: store.money(r.mddAmount, lang),
        c: r.mddStress < -40 ? 'c-danger' : (r.mddStress < -25 ? 'c-warn' : 'c-good')
      },
      {
        k: T.mVar, v: r.var95Pct.toFixed(1) + '%', x: T.mVarX + ' · ' + store.money(r.var95, lang),
        c: r.var95Pct > 30 ? 'c-danger' : (r.var95Pct > 18 ? 'c-warn' : 'c-good')
      }
    ];

    /* 双条对比 */
    let maxVal = 0.2;
    for (let i = 0; i < r.positions.length; i++) {
      const p = r.positions[i];
      maxVal = Math.max(maxVal, p.wPct, p.rcPct, 0.01);
    }
    const cap = maxVal * 1.08;

    out.rows = r.positions.map(function (p) {
      const gap = p.rcPct - p.wPct;
      return {
        id: p.id,
        name: p.name,
        gapText: (gap >= 0 ? '+' : '') + (gap * 100).toFixed(1),
        gapColor: gap > 0.05 ? '#FF4D6A' : (gap < -0.05 ? '#00E2C6' : '#5A6E8A'),
        cls: gap > 0.05 ? 'over' : (gap < -0.05 ? 'under' : ''),
        wWidth: (p.wPct / cap * 100).toFixed(2),
        rWidth: (Math.max(0, p.rcPct) / cap * 100).toFixed(2),
        wText: pct(p.wPct),
        rcText: pct(p.rcPct) + (p.rcPct < -0.005 ? T.hedge : '')
      };
    });

    /* 危机 */
    const hMax = Math.max(r.sigma, r.sigmaCrisis, 1) * 1.15;
    out.crisis = {
      s1: r.sigma.toFixed(1),
      s2: r.sigmaCrisis.toFixed(1),
      h1: Math.round(r.sigma / hMax * 180),
      h2: Math.round(r.sigmaCrisis / hMax * 180)
    };
    out.decayText = pct(r.divDecay, 0);
    out.decayNote = (lang === 'tw')
      ? '平靜時期的分散效果有 ' + (r.divRatio * 100).toFixed(0) + '%，危機情境只剩 ' +
        (r.divRatioCrisis * 100).toFixed(0) + '%。相關性趨同的那一刻，「不同資產」會一起跌。'
      : '平静时期的分散效果有 ' + (r.divRatio * 100).toFixed(0) + '%，危机情景只剩 ' +
        (r.divRatioCrisis * 100).toFixed(0) + '%。相关性趋同的那一刻，「不同资产」会一起跌。';

    /* 模拟 */
    const sim = this.buildSim(r, T, lang);
    out.sim = sim.data;
    out.simLead = sim.lead;

    /* 结论 */
    out.findings = r.findings;

    /* 明细表 */
    out.table = r.positions.map(function (p) {
      return {
        name: p.name,
        amt: store.moneyShort(p.amount, lang),
        w: pct(p.wPct),
        rc: pct(p.rcPct),
        neg: p.rcPct < 0
      };
    });
    out.tableTotal = {
      amt: store.moneyShort(r.total, lang)
    };

    out.methodBlocks = T.methodBlocks;
    return out;
  },

  /* ---------- 结构优化模拟 ---------- */
  buildSim: function (r, T, lang) {
    if (r.positions.length < 2) return { data: null, lead: '' };

    /* 与 findings 的「风险错配」判定完全同口径：错配 = 风险占比 − 资金占比，
     * 且必须对组合绝对波动有实质影响才给建议。单位为：gap（小数）× σp（百分数）> 2，
     * 即错配超过 2 个百分点的组合波动。低波动组合（保守型 σ≈5.2%）相对占比差虽大，
     * 绝对影响只有约 1.96pp 达不到门槛 —— 这正是覆盤中修正的误报场景：
     * 旧版会建议保守组合砍红利 20%，而该组合的资金/风险结构并无实质错配。 */
    let worst = null;
    for (let i = 0; i < r.positions.length; i++) {
      const gap = r.positions[i].rcPct - r.positions[i].wPct;
      if (!worst || gap > worst.gap) worst = { p: r.positions[i], gap: gap };
    }
    const worstExcess = worst ? worst.gap * r.sigma : 0;
    if (!worst || worst.gap <= 0.10 || worstExcess <= 2) {
      return { data: null, lead: '' };
    }

    /* from = 错配最严重的持仓；to = 风险贡献最低的其它持仓 */
    const from = worst.p;
    let to = null;
    for (let j = 0; j < r.positions.length; j++) {
      const p = r.positions[j];
      if (p.id === from.id) continue;
      if (!to || p.rcPct < to.rcPct) to = p;
    }
    if (!to) return { data: null, lead: '' };

    const moveAmt = from.amount * 0.20;
    const trial = [];
    for (let i = 0; i < r.positions.length; i++) {
      const p = r.positions[i];
      let amt = p.amount;
      if (p.id === from.id) amt -= moveAmt;
      if (p.id === to.id) amt += moveAmt;
      trial.push({ id: p.id, amount: Math.max(1, amt) });
    }

    const t = engine.analyze(trial, { lang: lang });
    if (!t) return { data: null, lead: '' };

    let tMax = 0;
    for (let j = 0; j < t.positions.length; j++) {
      tMax = Math.max(tMax, t.positions[j].rcPct);
    }
    let rMax = 0;
    for (let k = 0; k < r.positions.length; k++) {
      rMax = Math.max(rMax, r.positions[k].rcPct);
    }

    return {
      lead: T.simLeadPre + ' ' + from.name + ' ' + T.simLeadMid + ' 20% ' +
            T.simLeadPost + ' ' + to.name + T.simLeadEnd,
      data: {
        sigma1: r.sigma.toFixed(1),
        sigma2: t.sigma.toFixed(1),
        max1: (rMax * 100).toFixed(0),
        max2: (tMax * 100).toFixed(0),
        neff1: r.nEff.toFixed(1),
        neff2: t.nEff.toFixed(1)
      }
    };
  },

  toggleMethod: function () {
    this.setData({ methodOpen: !this.data.methodOpen });
  },

  goAbout: function () {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  noop: function () {},

  /* ---------- 分享卡 ---------- */
  openShare: function () {
    const that = this;
    this.setData({ shareOpen: true }, function () {
      setTimeout(function () { that.drawCard(); }, 120);
    });
  },

  closeShare: function () {
    this.setData({ shareOpen: false });
  },

  drawCard: function () {
    const that = this;
    const r = this.report;
    if (!r) return;

    wx.createSelectorQuery()
      .select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        let dpr = 2;
        try {
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          dpr = info.pixelRatio || 2;
        } catch (e) {}

        const W = 600, H = 800;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        that.canvasNode = canvas;

        const T = I18N[that.lang] || I18N.cn;

        /* 背景 */
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0A1B30');
        bg.addColorStop(0.55, '#071322');
        bg.addColorStop(1, '#0C2038');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* 网格 */
        ctx.strokeStyle = 'rgba(122,168,222,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        /* 品牌 */
        ctx.fillStyle = '#00E2C6';
        ctx.beginPath(); ctx.arc(48, 52, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#E7F0FB';
        ctx.font = 'bold 22px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(T.brand, 64, 53);

        ctx.fillStyle = '#7C93B2';
        ctx.font = '14px sans-serif';
        ctx.fillText(T.kicker, 48, 88);

        /* 分数环 */
        const cx = W / 2, cy = 230, rad = 78;
        ctx.strokeStyle = 'rgba(122,168,222,0.14)';
        ctx.lineWidth = 13;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();

        ctx.strokeStyle = scoreColor(r.health);
        ctx.lineWidth = 13;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (r.health / 100));
        ctx.stroke();

        ctx.fillStyle = scoreColor(r.health);
        ctx.font = 'bold 54px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(r.health), cx, cy - 4);
        ctx.fillStyle = '#7C93B2';
        ctx.font = '14px sans-serif';
        ctx.fillText(T.scoreLabel, cx, cy + 40);

        /* 定性 */
        let v = T.verdicts[T.verdicts.length - 1];
        if (r.count <= 1 && T.verdictSingle) {
          v = T.verdictSingle;
        } else {
          for (let i = 0; i < T.verdicts.length; i++) {
            if (r.health >= T.verdicts[i].min) { v = T.verdicts[i]; break; }
          }
        }
        ctx.fillStyle = '#E7F0FB';
        ctx.font = 'bold 25px sans-serif';
        ctx.fillText(v.t, cx, 350);

        /* 分隔线 */
        ctx.strokeStyle = 'rgba(122,168,222,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(48, 384); ctx.lineTo(W - 48, 384); ctx.stroke();

        /* 四个数字 */
        const stats = [
          [r.sigma.toFixed(1) + '%', T.mSigma],
          [r.nEff.toFixed(1), T.mNEff],
          [(r.divDecay * 100).toFixed(0) + '%', T.mDecay],
          [r.mddStress.toFixed(0) + '%', T.mMDD]
        ];
        const colW = (W - 96) / 2;
        for (let s = 0; s < stats.length; s++) {
          const px = 48 + (s % 2) * colW;
          const py = 424 + Math.floor(s / 2) * 66;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#E7F0FB';
          ctx.font = 'bold 26px sans-serif';
          ctx.fillText(stats[s][0], px, py);
          ctx.fillStyle = '#7C93B2';
          ctx.font = '13px sans-serif';
          ctx.fillText(stats[s][1], px, py + 24);
        }

        /* 主要风险来源 */
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5A6E8A';
        ctx.font = '13px sans-serif';
        ctx.fillText(T.mMax, 48, 588);

        const tops = r.positions.slice(0, 3);
        let maxPct = 0.01;
        for (let k = 0; k < tops.length; k++) maxPct = Math.max(maxPct, tops[k].rcPct);

        for (let m = 0; m < tops.length; m++) {
          const p = tops[m];
          const ty = 618 + m * 40;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#C9DCF0';
          ctx.font = '15px sans-serif';
          ctx.fillText(p.name, 48, ty);

          const bx = 240, bw = W - 48 - bx - 66;
          ctx.fillStyle = 'rgba(122,168,222,0.12)';
          ctx.fillRect(bx, ty - 6, bw, 8);
          const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
          grd.addColorStop(0, '#0099FF');
          grd.addColorStop(1, '#00E2C6');
          ctx.fillStyle = grd;
          ctx.fillRect(bx, ty - 6, bw * Math.max(0, p.rcPct) / maxPct, 8);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#E7F0FB';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText((p.rcPct * 100).toFixed(0) + '%', W - 48, ty);
        }

        /* 页脚 */
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5A6E8A';
        ctx.font = '13px sans-serif';
        const d = new Date();
        const ds = d.getFullYear() + '.' +
          String(d.getMonth() + 1).padStart(2, '0') + '.' +
          String(d.getDate()).padStart(2, '0');
        ctx.fillText(T.brand + ' · ' + ds, cx, H - 52);
        ctx.fillStyle = 'rgba(122,168,222,0.4)';
        ctx.font = '12px sans-serif';
        ctx.fillText((that.lang === 'tw' ? '不預測漲跌，只度量風險結構' : '不预测涨跌，只度量风险结构'), cx, H - 30);
      });
  },

  saveCard: function () {
    const that = this;
    if (!this.canvasNode) {
      wx.showToast({ title: '图片未就绪', icon: 'none' });
      return;
    }
    wx.canvasToTempFilePath({
      canvas: this.canvasNode,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            wx.showToast({ title: that.lang === 'tw' ? '已儲存' : '已保存', icon: 'success' });
          },
          fail: function () {
            wx.showModal({
              title: that.lang === 'tw' ? '需要相簿權限' : '需要相册权限',
              content: that.lang === 'tw'
                ? '請在右上角「…」→ 設定中允許儲存到相簿'
                : '请在右上角「…」→ 设置中允许保存到相册',
              showCancel: false
            });
          }
        });
      },
      fail: function () {
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  }
});
