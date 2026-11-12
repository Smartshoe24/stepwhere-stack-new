import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(appRoot, 'assets/brandmark.svg');
const outputDir = resolve(appRoot, 'assets/images');
const source = await readFile(sourcePath, 'utf8');
const inner = source.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/)?.[1];

if (!inner) {
  throw new Error(`Could not parse ${sourcePath}`);
}

function render({ size, markHeight, background, monochrome = false }) {
  const markWidth = markHeight * (176.3 / 235.82);
  const x = (size - markWidth) / 2;
  const y = (size - markHeight) / 2;
  const monoStyle = monochrome
    ? '<style>.brandmark path { fill: #000 !important; }</style>'
    : '';
  const backgroundRect = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${backgroundRect}
      ${monoStyle}
      <svg class="brandmark" x="${x}" y="${y}" width="${markWidth}" height="${markHeight}" viewBox="0 0 176.3 235.82">
        ${inner}
      </svg>
    </svg>
  `;

  return new Resvg(svg).render().asPng();
}

function removeAlpha(pngBuffer) {
  return PNG.sync.write(PNG.sync.read(pngBuffer), { colorType: 2 });
}

await Promise.all([
  writeFile(
    resolve(outputDir, 'icon.png'),
    removeAlpha(render({ size: 1024, markHeight: 700, background: '#FFFFFF' })),
  ),
  writeFile(
    resolve(outputDir, 'android-icon-foreground.png'),
    render({ size: 512, markHeight: 300 }),
  ),
  writeFile(
    resolve(outputDir, 'android-icon-monochrome.png'),
    render({ size: 432, markHeight: 260, monochrome: true }),
  ),
  writeFile(
    resolve(outputDir, 'splash-icon.png'),
    render({ size: 512, markHeight: 360 }),
  ),
]);
