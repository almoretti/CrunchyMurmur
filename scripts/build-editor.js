const path = require('path');
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: [path.resolve('ui/editor-entry.js')],
  outfile: path.resolve('ui/editor.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome142'],
  minify: true,
  legalComments: 'none',
}).then(() => {
  console.log('Built shared Markdown editor bundle.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
