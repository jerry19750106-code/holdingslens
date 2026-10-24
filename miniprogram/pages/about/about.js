const LIB = require('../../shared/assetlib.js');
const store = require('../../utils/store.js');
const I18N = require('../../utils/i18n.js');

Page({
  data: {
    T: I18N.cn,
    methodBlocks: [],
    lib: []
  },

  onLoad: function () {
    const lang = store.getLang();
    this.setData(this.build(lang));
  },

  onShow: function () {
    const lang = store.getLang();
    if (lang !== this.lang) this.setData(this.build(lang));
  },

  build: function (lang) {
    this.lang = lang;
    const T = I18N[lang] || I18N.cn;
    const lib = LIB.ASSETS.map(function (a) {
      return {
        id: a.id,
        name: lang === 'tw' ? a.nameTw : a.name,
        vol: a.vol,
        mdd: a.mdd
      };
    });
    return { T: T, methodBlocks: T.methodBlocks, lib: lib };
  }
});
