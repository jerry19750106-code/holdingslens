/* 构建单文件版：把 engine.bundle.js 内联进 index.html，去掉外链依赖。
 * 用途：投稿附件 / 无服务器环境直接双击打开。 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = __dirname;

var html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
var bundle = fs.readFileSync(path.join(root, 'web', 'engine.bundle.js'), 'utf8');

var tag = '<script src="./engine.bundle.js"></script>';
if (html.indexOf(tag) < 0) { console.error('✗ 未找到 bundle 引用标签'); process.exit(1); }
var out = html.replace(tag, '<script>\n' + bundle + '\n</script>');

/* 单文件版无同目录依赖，标注一下来源便于辨识 */
out = out.replace('<head>', '<head>\n<!-- 单文件版：引擎已内联，无外部依赖，可离线双击打开 -->', 1);

var target = path.join(root, 'deliverables', '持倉透鏡_H5演示_单文件.html');
fs.writeFileSync(target, out, 'utf8');
console.log('✓ 单文件版生成: ' + target + '  (' + (out.length / 1024).toFixed(1) + ' KB)');
