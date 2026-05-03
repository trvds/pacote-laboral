import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  computeFlatItems,
  escapeHtml,
  VIEW_MODES,
} from './lib/pacote-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const outFile = path.join(distDir, 'index.html');

function parseMode() {
  const arg = process.argv.find((a) => a.startsWith('--mode='));
  const v = arg ? arg.slice('--mode='.length) : 'ante';
  if (v === 'full') return { fullCt: true, onlyChanges: false, modeIndex: 1 };
  if (v === 'changes') return { fullCt: true, onlyChanges: true, modeIndex: 2 };
  return { fullCt: false, onlyChanges: false, modeIndex: 0 };
}

function renderDiffRowHtml(r) {
  const lnL = r.lnL != null ? String(r.lnL) : '';
  const lnR = r.lnR != null ? String(r.lnR) : '';
  const clsL = 'blob-num' + (r.lnL == null ? ' empty' : '');
  const clsR = 'blob-num' + (r.lnR == null ? ' empty' : '');
  let cellL;
  let cellR;
  if (r.type === 'chg') {
    cellL = '<td class="deletion">' + r.leftHtml + '</td>';
    cellR = '<td class="addition">' + r.rightHtml + '</td>';
  } else {
    const escL = r.left != null ? escapeHtml(r.left) : '';
    const escR = r.right != null ? escapeHtml(r.right) : '';
    const cL = r.left != null ? (r.type === 'del' ? 'deletion' : '') : 'line-empty';
    const cR = r.right != null ? (r.type === 'add' ? 'addition' : '') : 'line-empty';
    cellL = '<td class="' + cL + '">' + (r.left != null ? escL : '') + '</td>';
    cellR = '<td class="' + cR + '">' + (r.right != null ? escR : '') + '</td>';
  }
  return (
    '<tr><td class="' +
    clsL +
    '">' +
    lnL +
    '</td>' +
    cellL +
    '<td class="' +
    clsR +
    '">' +
    lnR +
    '</td>' +
    cellR +
    '</tr>'
  );
}

function renderSectionRowHtml(title) {
  return (
    '<tr class="diff-section-row"><td colspan="4" class="diff-section-header">' +
    escapeHtml(title) +
    '</td></tr>'
  );
}

function flatToTbodyHtml(flat) {
  const parts = [];
  for (const item of flat) {
    if (item.kind === 'section') parts.push(renderSectionRowHtml(item.title));
    else parts.push(renderDiffRowHtml(item.row));
  }
  return parts.join('\n');
}

const mode = parseMode();
const modeLabel = VIEW_MODES[mode.modeIndex].btn;

const codigoPath = path.join(root, 'content', 'codigo_trabalho.md');
const antePath = path.join(root, 'content', 'anteprojeto.md');
const cssPath = path.join(root, 'src', 'styles-pacote-github.css');

const [codigoText, anteText, css] = await Promise.all([
  fs.readFile(codigoPath, 'utf8'),
  fs.readFile(antePath, 'utf8'),
  fs.readFile(cssPath, 'utf8'),
]);

const flat = computeFlatItems(codigoText, anteText, {
  fullCt: mode.fullCt,
  onlyChanges: mode.onlyChanges,
});
const tbodyHtml = flatToTbodyHtml(flat);
const generatedAt = new Date().toISOString();

const html =
  '<!DOCTYPE html>\n' +
  '<html lang="pt-pt">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '  <title>Pacote laboral — diff Código do Trabalho</title>\n' +
  '  <style>\n' +
  css.replace(/<\/style/gi, '<\\/style') +
  '\n  </style>\n' +
  '</head>\n' +
  '<body>\n' +
  '  <h1 class="page-title">Comparativo: Código do Trabalho × Pacote Laboral (Anteprojeto)</h1>\n' +
  '  <p class="page-sub">Página estática gerada em <time datetime="' +
  escapeHtml(generatedAt) +
  '">' +
  escapeHtml(generatedAt) +
  '</time> · modo: ' +
  escapeHtml(modeLabel) +
  ' · <code>npm run build -- --mode=ante|full|changes</code></p>\n' +
  '  <div class="container" id="panel">\n' +
  '    <div class="diff-scroll">\n' +
  '      <table class="diff-table" id="diff-table">\n' +
  '        <thead>\n' +
  '          <tr>\n' +
  '            <th colspan="2" class="label-header">Código atual</th>\n' +
  '            <th colspan="2" class="label-header">Proposta (anteprojeto)</th>\n' +
  '          </tr>\n' +
  '        </thead>\n' +
  '        <tbody>\n' +
  tbodyHtml +
  '\n        </tbody>\n' +
  '      </table>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '</body>\n' +
  '</html>\n';

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(outFile, html, 'utf8');
console.log('Gerado:', outFile, '·', flat.length, 'linhas lógicas ·', modeLabel);
