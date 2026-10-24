/* 静态自检：语法、id 引用、i18n key 完整性、引擎可用性
 * 目的：在没有浏览器的环境下，把「一打开就白屏」这类错误挡在交付前。
 * 运行：node verify-web.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = __dirname;
var htmlPath = path.join(root, 'web', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');

var pass = 0, fail = 0, fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? ' → ' + e : '')); } }

/* ---------- 1. 提取内联脚本并做语法检查 ---------- */
var scripts = [];
var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
var m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
ok('找到内联脚本块', scripts.length > 0, 'count=' + scripts.length);

var inline = scripts.join('\n;\n');
var tmp = path.join(root, '.verify.tmp.js');
fs.writeFileSync(tmp, inline, 'utf8');
try {
  cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  ok('内联脚本语法正确', true);
} catch (e) {
  ok('内联脚本语法正确', false, (e.stderr || e.message).toString().slice(0, 400));
}
try { fs.unlinkSync(tmp); } catch (e) {}

/* ---------- 2. $('#id') 引用的元素必须存在 ---------- */
var ids = {};
var idRe = /\bid="([^"]+)"/g;
while ((m = idRe.exec(html)) !== null) ids[m[1]] = true;

var missing = [];
var selRe = /\$\('#([A-Za-z0-9_-]+)'\)/g;
var used = {};
while ((m = selRe.exec(inline)) !== null) {
  used[m[1]] = true;
  if (!ids[m[1]]) missing.push(m[1]);
}
ok('所有 $(\'#id\') 引用都存在', missing.length === 0, missing.join(', '));
ok('脚本确实引用了页面元素', Object.keys(used).length >= 8, 'used=' + Object.keys(used).length);

/* ---------- 3. data-t 的 key 在两套语言里都存在 ---------- */
var dt = {};
var dtRe = /data-t="([^"]+)"/g;
while ((m = dtRe.exec(html)) !== null) dt[m[1]] = true;

/* 粗略切出 cn / tw 两个对象块 */
var cnStart = inline.indexOf('cn: {');
var twStart = inline.indexOf('tw: {');
var cnBlock = inline.slice(cnStart, twStart);
var twBlock = inline.slice(twStart, inline.indexOf('};', twStart) + 2);

var missingKeys = [];
Object.keys(dt).forEach(function (k) {
  if (cnBlock.indexOf(k + ':') < 0) missingKeys.push('cn.' + k);
  if (twBlock.indexOf(k + ':') < 0) missingKeys.push('tw.' + k);
});
ok('data-t 的 key 在 cn/tw 均存在', missingKeys.length === 0, missingKeys.join(', '));

/* ---------- 4. 危险模式检查 ---------- */
ok('未使用 eval', !/\beval\s*\(/.test(inline));
ok('未使用 document.write', !/document\.write/.test(inline));
ok('canvas 尺寸为 1080x1440', /width="1080"\s+height="1440"/.test(html));
ok('引用了 engine.bundle.js', /src="\.\/engine\.bundle\.js"/.test(html));
ok('有 viewport meta', /name="viewport"/.test(html));

/* ---------- 5. bundle 可用性 ---------- */
var bundlePath = path.join(root, 'web', 'engine.bundle.js');
ok('engine.bundle.js 已生成', fs.existsSync(bundlePath));
if (fs.existsSync(bundlePath)) {
  var bsrc = fs.readFileSync(bundlePath, 'utf8');
  ok('bundle 暴露 XRayAssets', /root\.XRayAssets\s*=/.test(bsrc));
  ok('bundle 暴露 XRayEngine', /root\.XRayEngine\s*=/.test(bsrc));
  ok('bundle 含 analyze 方法', /analyze:\s*analyze/.test(bsrc));
}

/* ---------- 6. CSS 变量都有定义 ---------- */
var varDef = {};
var vd = /--([a-z0-9-]+)\s*:/g;
while ((m = vd.exec(html)) !== null) varDef[m[1]] = true;
var varUse = {};
var vu = /var\(--([a-z0-9-]+)\)/g;
while ((m = vu.exec(html)) !== null) varUse[m[1]] = true;
var undef = Object.keys(varUse).filter(function (k) { return !varDef[k]; });
ok('所有 CSS 变量都有定义', undef.length === 0, undef.join(', '));

/* ---------- 输出 ---------- */
console.log('');
console.log('════════════════════════════════════════');
console.log('  H5 静态自检');
console.log('════════════════════════════════════════');
console.log('  通过: ' + pass);
console.log('  失败: ' + fail);
if (fail) fails.forEach(function (f, i) { console.log('  ✗ ' + (i + 1) + '. ' + f); });
console.log('════════════════════════════════════════');
process.exit(fail ? 1 : 0);
