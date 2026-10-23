import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const cartoApiKey = process.env.CARTO_BASEMAPS_API_KEY?.trim();
if (!cartoApiKey) {
  throw new Error('Set CARTO_BASEMAPS_API_KEY in the deployment environment before building.');
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const directory of ['css', 'js', 'data']) {
  await cp(directory, `dist/${directory}`, {
    recursive: true,
    filter: (source) => !source.endsWith('.DS_Store') && !source.endsWith('runtime-config.js'),
  });
}
for (const entry of await readdir('.', { withFileTypes: true })) {
  if (entry.isFile() && /\.(html|png|ico|svg|webmanifest)$/.test(entry.name)) {
    await cp(entry.name, `dist/${entry.name}`);
  }
}
await writeFile('dist/js/runtime-config.js',
  `window.EKILINK_CONFIG = ${JSON.stringify({ cartoApiKey })};\n`);
console.log('Built EkiLink with deployment environment configuration.');
