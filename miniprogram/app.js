const store = require('./utils/store.js');

App({
  globalData: {
    holdings: [],
    lang: 'cn',
    report: null
  },

  onLaunch: function () {
    this.globalData.holdings = store.getHoldings();
    this.globalData.lang = store.getLang();
  },

  /* 统一的语言读取，避免每个页面各写一遍 */
  t: function (key) {
    const I18N = require('./utils/i18n.js');
    const pack = I18N[this.globalData.lang] || I18N.cn;
    return pack[key];
  }
});
