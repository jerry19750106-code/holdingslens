const LIB = require('../../shared/assetlib.js');
const engine = require('../../shared/engine.js');
const store = require('../../utils/store.js');
const I18N = require('../../utils/i18n.js');

const BUDGET = 500000;

const PRESET_DEF = [
  { id: 'conservative', cn: '保守型', tw: '保守型',
    items: [['bond_cn', 40], ['cn_div', 25], ['gold', 15], ['cash', 20]] },
  { id: 'balanced', cn: '均衡型', tw: '均衡型',
    items: [['cn_broad', 25], ['us', 25], ['bond_cn', 25], ['gold', 15], ['hk', 10]] },
  { id: 'aggressive', cn: '进取型', tw: '進取型',
    items: [['cn_growth', 30], ['us_tech', 30], ['tw', 20], ['hk', 10], ['gold', 10]] },
  { id: 'ai', cn: 'AI 算力链', tw: 'AI 算力鏈', hot: true,
    items: [['us_tech', 35], ['cn_growth', 30], ['tw', 25], ['bond_cn', 10]] }
];

Page({
  data: {
    lang: 'cn',
    T: I18N.cn,
    assets: [],
    holdings: [],
    presets: [],
    totalText: '—',
    canRun: false,
    codeInput: '',
    codeMsg: '',
    codeMsgCls: ''
  },

  onLoad: function () {
    const app = getApp();
    const lang = store.getLang();
    const saved = store.getHoldings();
    this.setData({ lang: lang });
    this.applyLang(lang, saved);
  },

  onShow: function () {
    /* 从报告页返回时，语言可能已变 */
    const lang = store.getLang();
    if (lang !== this.data.lang) {
      this.applyLang(lang, this.data.holdings.map(function (h) {
        return { id: h.id, amount: h.amount };
      }));
    }
  },

  /* ---------- 语言与派生数据 ---------- */
  applyLang: function (lang, rawHoldings) {
    const T = I18N[lang] || I18N.cn;
    const assets = LIB.ASSETS.map(function (a) {
      return {
        id: a.id,
        name: lang === 'tw' ? a.nameTw : a.name,
        meta: (lang === 'tw' ? '波動 ' : '波动 ') + a.vol + '% · ' +
              (lang === 'tw' ? '最深 ' : '最深 ') + a.mdd + '%',
        sel: false
      };
    });

    const holdings = (rawHoldings || []).map(function (h) {
      const a = LIB.ASSETS[LIB.IDX[h.id]];
      return {
        id: h.id,
        name: a ? (lang === 'tw' ? a.nameTw : a.name) : h.id,
        amount: h.amount
      };
    });

    const presets = PRESET_DEF.map(function (p) {
      return { id: p.id, label: lang === 'tw' ? p.tw : p.cn, hot: !!p.hot };
    });

    this.setData({ lang: lang, T: T, assets: assets, holdings: holdings, presets: presets });
    this.syncSel();
    this.refreshTotal();
  },

  toggleLang: function () {
    const next = this.data.lang === 'cn' ? 'tw' : 'cn';
    store.setLang(next);
    getApp().globalData.lang = next;
    this.applyLang(next, this.data.holdings.map(function (h) {
      return { id: h.id, amount: h.amount };
    }));
  },

  /* ---------- 资产选择 ---------- */
  syncSel: function () {
    const ids = this.data.holdings.map(function (h) { return h.id; });
    const assets = this.data.assets.map(function (a) {
      return { id: a.id, name: a.name, meta: a.meta, sel: ids.indexOf(a.id) >= 0 };
    });
    this.setData({ assets: assets });
  },

  indexOfHold: function (id) {
    for (let i = 0; i < this.data.holdings.length; i++) {
      if (this.data.holdings[i].id === id) return i;
    }
    return -1;
  },

  toggleAsset: function (e) {
    const id = e.currentTarget.dataset.id;
    const i = this.indexOfHold(id);
    let holdings = this.data.holdings.slice();

    if (i >= 0) {
      holdings.splice(i, 1);
    } else {
      /* 新增项只决定自己的初始金额，不改动用户已改过的其他项 */
      const a = LIB.ASSETS[LIB.IDX[id]];
      const base = Math.round(BUDGET / Math.max(3, holdings.length + 1) / 1000) * 1000;
      holdings.push({
        id: id,
        name: this.data.lang === 'tw' ? a.nameTw : a.name,
        amount: base
      });
    }

    this.setData({ holdings: holdings });
    this.syncSel();
    this.refreshTotal();
  },

  delHold: function (e) {
    const id = e.currentTarget.dataset.id;
    const i = this.indexOfHold(id);
    if (i < 0) return;
    const holdings = this.data.holdings.slice();
    holdings.splice(i, 1);
    this.setData({ holdings: holdings });
    this.syncSel();
    this.refreshTotal();
  },

  /* input 用非受控写法：只改数据不 setData holdings，避免光标跳动 */
  onAmount: function (e) {
    const id = e.currentTarget.dataset.id;
    const v = Number(e.detail.value);
    const i = this.indexOfHold(id);
    if (i < 0) return;
    this.data.holdings[i].amount = isFinite(v) && v > 0 ? v : 0;
    this.refreshTotal();
  },

  refreshTotal: function () {
    let total = 0;
    for (let i = 0; i < this.data.holdings.length; i++) {
      total += Number(this.data.holdings[i].amount) || 0;
    }
    this.setData({
      totalText: total > 0 ? store.money(total, this.data.lang) : '—',
      canRun: total > 0
    });
  },

  /* ---------- 按代码 / 名称新增（场内 ETF、场外基金、名称关键词） ---------- */
  onCodeInput: function (e) {
    this.setData({ codeInput: e.detail.value });
  },

  addByCode: function () {
    const raw = (this.data.codeInput || '').trim();
    const T = this.data.T;
    if (!raw) {
      this.setData({ codeMsg: T.codeBad, codeMsgCls: 'bad' });
      return;
    }
    const id = engine.resolve(raw);
    if (!id) {
      this.setData({ codeMsg: T.codeBad, codeMsgCls: 'bad' });
      return;
    }
    const a = LIB.ASSETS[LIB.IDX[id]];
    const nm = this.data.lang === 'tw' ? a.nameTw : a.name;
    if (this.indexOfHold(id) >= 0) {
      this.setData({ codeMsg: T.codeDup.replace('{name}', nm), codeMsgCls: 'ok', codeInput: '' });
      return;
    }
    /* 与点击格子一致：新项只决定自己的初始金额，不动其他项 */
    const base = Math.round(BUDGET / Math.max(3, this.data.holdings.length + 1) / 1000) * 1000;
    const holdings = this.data.holdings.slice();
    holdings.push({ id: id, name: nm, amount: base });
    this.setData({
      holdings: holdings,
      codeMsg: T.codeOk.replace('{name}', nm),
      codeMsgCls: 'ok',
      codeInput: ''
    });
    this.syncSel();
    this.refreshTotal();
  },

  /* ---------- 预设 ---------- */
  usePreset: function (e) {
    const id = e.currentTarget.dataset.id;
    let def = null;
    for (let i = 0; i < PRESET_DEF.length; i++) {
      if (PRESET_DEF[i].id === id) { def = PRESET_DEF[i]; break; }
    }
    if (!def) return;

    const lang = this.data.lang;
    const holdings = def.items.map(function (kv) {
      const a = LIB.ASSETS[LIB.IDX[kv[0]]];
      return {
        id: kv[0],
        name: lang === 'tw' ? a.nameTw : a.name,
        amount: Math.round(BUDGET * kv[1] / 100)
      };
    });

    this.setData({ holdings: holdings });
    this.syncSel();
    this.refreshTotal();
    wx.vibrateShort({ type: 'light' });
  },

  /* ---------- 进入报告 ---------- */
  run: function () {
    const clean = this.data.holdings
      .filter(function (h) { return Number(h.amount) > 0; })
      .map(function (h) { return { id: h.id, amount: Number(h.amount) }; });

    if (!clean.length) {
      wx.showToast({ title: '请先输入持仓金额', icon: 'none' });
      return;
    }

    store.setHoldings(clean);
    const app = getApp();
    app.globalData.holdings = clean;
    app.globalData.lang = this.data.lang;

    wx.navigateTo({ url: '/pages/report/report' });
  }
});
