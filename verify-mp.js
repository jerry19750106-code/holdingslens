/* 小程序静态自检
 * 抓四类真实会白屏/报错的问题：
 *   ① JSON 非法          ② JS 语法错误
 *   ③ 页面文件缺件        ④ WXML 引用了 JS 里不存在的方法 / data 字段
 * 运行：node verify-mp.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = path.join(__dirname, 'miniprogram');
var pass = 0, fail = 0, fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? ' → ' + e : '')); } }

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    var p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

var files = walk(root);
var rel = function (p) { return path.relative(root, p).replace(/\\/g, '/'); };

/* ---------- ① JSON ---------- */
var jsonFiles = files.filter(function (f) { return f.endsWith('.json'); });
var badJson = [];
jsonFiles.forEach(function (f) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { badJson.push(rel(f) + ': ' + e.message); }
});
ok('全部 JSON 合法（' + jsonFiles.length + ' 个）', badJson.length === 0, badJson.join(' | '));

/* ---------- ② JS 语法 ---------- */
var jsFiles = files.filter(function (f) { return f.endsWith('.js'); });
var badJs = [];
jsFiles.forEach(function (f) {
  try { cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { badJs.push(rel(f) + ': ' + (e.stderr || e.message).toString().split('\n')[0]); }
});
ok('全部 JS 语法正确（' + jsFiles.length + ' 个）', badJs.length === 0, badJs.join(' | '));

/* ---------- ③ 页面文件完整性 ---------- */
var app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
var missingPage = [];
app.pages.forEach(function (pg) {
  ['.js', '.json', '.wxml', '.wxss'].forEach(function (ext) {
    var p = path.join(root, pg + ext);
    if (!fs.existsSync(p)) missingPage.push(pg + ext);
  });
});
ok('app.json 声明的页面文件齐全（' + app.pages.length + ' 页）', missingPage.length === 0, missingPage.join(', '));

ok('app.json 有 window 配置', !!app.window);
ok('sitemap.json 存在', fs.existsSync(path.join(root, 'sitemap.json')));
ok('project.config.json 存在', fs.existsSync(path.join(root, 'project.config.json')));

/* ---------- ④ WXML ↔ JS 交叉检查 ---------- */
/* 从 JS 的 data:{...} 里取出顶层键 */
function extractDataKeys(src) {
  var i = src.indexOf('data:');
  if (i < 0) return [];
  var start = src.indexOf('{', i);
  if (start < 0) return [];
  var depth = 0, end = -1;
  for (var k = start; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) return [];
  var block = src.slice(start + 1, end);
  var keys = [];
  var re = /^\s{4}([A-Za-z_$][\w$]*)\s*:/gm;
  var m;
  while ((m = re.exec(block)) !== null) keys.push(m[1]);
  return keys;
}

/* 从 JS 里取出函数名（Page 对象的方法） */
function extractMethods(src) {
  var names = [];
  var re = /^\s{2}([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/gm;
  var m;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

var pageDirs = files.filter(function (f) { return f.endsWith('.wxml'); });

pageDirs.forEach(function (wxmlPath) {
  var base = wxmlPath.slice(0, -5);
  var name = rel(wxmlPath);
  var jsPath = base + '.js';
  if (!fs.existsSync(jsPath)) { ok(name + ' 有对应 js', false); return; }

  var wxml = fs.readFileSync(wxmlPath, 'utf8');
  var js = fs.readFileSync(jsPath, 'utf8');
  var dataKeys = extractDataKeys(js);
  var methods = extractMethods(js);

  /* 4a. 事件处理函数必须存在 */
  var handlers = {};
  var hre = /\b(?:bind|catch)(?::)?[a-z]+="([A-Za-z_$][\w$]*)"/g;
  var hm;
  while ((hm = hre.exec(wxml)) !== null) handlers[hm[1]] = true;
  var missH = Object.keys(handlers).filter(function (h) { return methods.indexOf(h) < 0; });
  ok(name + ' 事件处理函数均已定义', missH.length === 0, missH.join(', '));

  /* 4b. 顶层数据字段必须出现在 data 中 */
  var tplVars = {};
  var tre = /\{\{([^}]*)\}\}/g;
  var tm;
  while ((tm = tre.exec(wxml)) !== null) {
    var expr = tm[1];
    /* 先剥掉字符串字面量，避免 'hot' / 'c-cyan' 这类被当变量名提取 */
    expr = expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ' ');
    var vre = /[A-Za-z_$][\w$]*/g;
    var vm;
    while ((vm = vre.exec(expr)) !== null) {
      var token = vm[0];
      var at = vm.index;
      /* 跳过属性访问（前面是 . 的）与字符串内容 */
      if (at > 0 && expr[at - 1] === '.') continue;
      tplVars[token] = true;
    }
  }
  /* wx:for 产生的局部变量 */
  var locals = { item: 1, index: 1, true: 1, false: 1, null: 1 };
  var fore = /wx:for-item="([\w$]+)"/g, fm;
  while ((fm = fore.exec(wxml)) !== null) locals[fm[1]] = 1;

  var missV = Object.keys(tplVars).filter(function (v) {
    return !locals[v] && dataKeys.indexOf(v) < 0;
  });
  ok(name + ' 模板变量均在 data 中声明', missV.length === 0, missV.join(', '));
});

/* ---------- ⑤ 引擎在小程序 require 链下可用 ---------- */
try {
  var E = require('./miniprogram/shared/engine.js');
  var r = E.analyze([
    { id: 'cn_growth', amount: 180000 },
    { id: 'us_tech', amount: 150000 },
    { id: 'gold', amount: 60000 },
    { id: 'bond_cn', amount: 40000 }
  ], { lang: 'tw' });
  ok('小程序内 shared/engine.js 可正常求解', !!r && r.count === 4);
  ok('小程序内双语结论可用', !!r && r.findings.length > 0 && r.lang === 'tw');
} catch (e) {
  ok('小程序内 shared/engine.js 可正常求解', false, e.message);
}

/* ---------- ⑥ 关键约定 ---------- */
ok('使用 touristappid（可直接游客运行）', /"appid":\s*"touristappid"/.test(
  fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')));
ok('未引入 npm 依赖', !fs.existsSync(path.join(root, 'node_modules')));
ok('页面数 = 3', app.pages.length === 3, 'got ' + app.pages.length);

/* ---------- 输出 ---------- */
console.log('');
console.log('════════════════════════════════════════');
console.log('  微信小程序静态自检');
console.log('════════════════════════════════════════');
console.log('  通过: ' + pass);
console.log('  失败: ' + fail);
if (fail) fails.forEach(function (f, i) { console.log('  ✗ ' + (i + 1) + '. ' + f); });
console.log('════════════════════════════════════════');
process.exit(fail ? 1 : 0);
