/* 构建脚本：把 shared/ 下的两个 UMD 模块打包成 H5 可用的单文件 bundle */
'use strict';
var fs = require('fs');
var path = require('path');

var root = __dirname;
var files = [
  path.join(root, 'shared', 'assetlib.js'),
  path.join(root, 'shared', 'engine.js')
];

var out = files.map(function (f) {
  return '/* ---- ' + path.basename(f) + ' ---- */\n' + fs.readFileSync(f, 'utf8');
}).join('\n\n');

var target = path.join(root, 'web', 'engine.bundle.js');
fs.writeFileSync(target, out, 'utf8');

console.log('✓ bundle 生成: web/engine.bundle.js  (' + (out.length / 1024).toFixed(1) + ' KB)');
