/* ============================================================
 * 轻量持久化：持仓 & 语言
 * 只用同步 storage（数据量极小），避免异步竞态
 * ========================================================== */

const HOLD_KEY = 'xray.holdings';
const LANG_KEY = 'xray.lang';

function getHoldings() {
  try {
    const v = wx.getStorageSync(HOLD_KEY);
    if (Array.isArray(v)) {
      return v.filter(function (h) {
        return h && typeof h.id === 'string' && isFinite(h.amount) && h.amount > 0;
      });
    }
  } catch (e) { /* 读取失败视为空 */ }
  return [];
}

function setHoldings(list) {
  try {
    wx.setStorageSync(HOLD_KEY, list || []);
  } catch (e) { /* 写入失败不阻断主流程 */ }
}

function getLang() {
  try {
    const v = wx.getStorageSync(LANG_KEY);
    if (v === 'tw' || v === 'cn') return v;
  } catch (e) {}
  return 'cn';
}

function setLang(lang) {
  try {
    wx.setStorageSync(LANG_KEY, lang === 'tw' ? 'tw' : 'cn');
  } catch (e) {}
}

/* 金额格式化：≥1 万显示「万/萬」，否则显示元 */
function money(v, lang) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 10000).toFixed(1) + (lang === 'tw' ? ' 萬' : ' 万');
  return v.toFixed(0) + ' 元';
}

function moneyShort(v, lang) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 10000).toFixed(1) + (lang === 'tw' ? '萬' : '万');
  return v.toFixed(0);
}

function pct(v, d) {
  return (v * 100).toFixed(d === undefined ? 1 : d) + '%';
}

module.exports = {
  getHoldings: getHoldings,
  setHoldings: setHoldings,
  getLang: getLang,
  setLang: setLang,
  money: money,
  moneyShort: moneyShort,
  pct: pct
};
