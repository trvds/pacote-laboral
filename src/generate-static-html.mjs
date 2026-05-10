import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  computeFlatItemsForDocument,
  escapeHtml,
  splitAnteprojetoDocuments,
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

const antePath = path.join(root, 'content', 'anteprojeto.md');
const cssPath = path.join(root, 'src', 'styles-pacote-github.css');
const contentDir = path.join(root, 'content');

const [anteText, css, contentFiles] = await Promise.all([
  fs.readFile(antePath, 'utf8'),
  fs.readFile(cssPath, 'utf8'),
  fs.readdir(contentDir),
]);

const flatOpts = [
  { fullCt: false, onlyChanges: false },
  { fullCt: true, onlyChanges: false },
  { fullCt: true, onlyChanges: true },
];

function documentLabel(fileName, text = '') {
  const firstHeading = text.match(/^#\s+(.+)$/m);
  if (firstHeading) return firstHeading[1].trim();
  const base = fileName.replace(/\.md$/i, '');
  if (base === 'codigo_trabalho') return 'Código do Trabalho';
  if (base === 'codigo_processo_trabalho') return 'Código de Processo do Trabalho';
  const law = base.match(/^lei_(\d+)_(\d{4})$/);
  if (law) return 'Lei n.º ' + law[1] + '/' + law[2];
  return base
    .split('_')
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

const availableDocNames = new Set(
  contentFiles.filter((f) => f.endsWith('.md') && f !== 'anteprojeto.md'),
);
const anteDocOrder = splitAnteprojetoDocuments(anteText).map((doc) => doc.id);
const orderedDocNames = [
  ...anteDocOrder.filter((name) => availableDocNames.has(name)),
  ...[...availableDocNames].filter((name) => !anteDocOrder.includes(name)).sort(),
];

const documents = await Promise.all(
  orderedDocNames.map(async (fileName) => {
    const currentText = await fs.readFile(path.join(contentDir, fileName), 'utf8');
    const flats = flatOpts.map((opts) =>
      computeFlatItemsForDocument(currentText, anteText, fileName, opts),
    );
    return {
      id: fileName,
      label: documentLabel(fileName, currentText),
      flats,
      tbodyHtmls: flats.map(flatToTbodyHtml),
    };
  }),
);

const defaultDoc = documents.find((doc) => doc.id === 'codigo_trabalho.md') || documents[0];
const viewModeLabelsJson = JSON.stringify(VIEW_MODES.map((m) => m.btn)).replace(
  /</g,
  '\\u003c',
);
const documentLabelsJson = JSON.stringify(
  Object.fromEntries(documents.map((doc) => [doc.id, doc.label])),
).replace(/</g, '\\u003c');
const defaultDocJson = JSON.stringify(defaultDoc.id).replace(/</g, '\\u003c');
const documentOptionsHtml = documents
  .map(
    (doc) =>
      '<option value="' +
      escapeHtml(doc.id) +
      '"' +
      (doc.id === defaultDoc.id ? ' selected' : '') +
      '>' +
      escapeHtml(doc.label) +
      '</option>',
  )
  .join('\n');
const tbodyHtml = documents
  .flatMap((doc) =>
    doc.tbodyHtmls.map(
      (body, i) =>
        '<tbody class="diff-tbody" data-doc="' +
        escapeHtml(doc.id) +
        '" data-view="' +
        i +
        '">\n' +
        body +
        '\n        </tbody>',
    ),
  )
  .join('\n        ');

const themeToggleIcons =
  '<svg class="theme-toggle__icon when-light" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
  '<svg class="theme-toggle__icon when-dark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

const themeBootScript =
  '(function(){var k="pacote-theme";var s=null;try{s=localStorage.getItem(k);}catch(e){}' +
  'var d=s==="dark"?!0:s==="light"?!1:window.matchMedia("(prefers-color-scheme: dark)").matches;' +
  'document.documentElement.setAttribute("data-theme",d?"dark":"light");' +
  'var k2="pacote-view",s2=null;try{s2=localStorage.getItem(k2);}catch(e){}' +
  'var b=document.documentElement.getAttribute("data-build-view")||"0";' +
  'var v=(s2==="0"||s2==="1"||s2==="2")?s2:b;' +
  'document.documentElement.setAttribute("data-active-view",v);' +
  'var k3="pacote-document",s3=null;try{s3=localStorage.getItem(k3);}catch(e){}' +
  'document.documentElement.setAttribute("data-active-document",s3||' +
  defaultDocJson +
  ');})();';

const pageScript =
  '(function(){var r=document.documentElement,kt="pacote-theme",tb=document.getElementById("theme-toggle");' +
  'function T(t){r.setAttribute("data-theme",t);var x=t==="dark";tb.setAttribute("aria-pressed",x?"true":"false");' +
  'tb.setAttribute("aria-label",x?"Mudar para tema claro":"Mudar para tema escuro");}' +
  'function Ti(){try{var s=localStorage.getItem(kt);if(s==="dark"||s==="light")T(s);' +
  'else T(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}catch(e){T("light");}}' +
  'tb.addEventListener("click",function(){var n=r.getAttribute("data-theme")==="dark"?"light":"dark";' +
  'try{localStorage.setItem(kt,n);}catch(e){}T(n);});Ti();' +
  'var kv="pacote-view",vb=document.getElementById("view-cycle-btn"),vl=document.getElementById("view-cycle-label"),L=' +
  viewModeLabelsJson +
  ';' +
  'function R(){var d=r.getAttribute("data-active-document")||' +
  defaultDocJson +
  ',v=r.getAttribute("data-active-view")||"0";document.querySelectorAll(".diff-tbody").forEach(function(t){t.style.display=t.getAttribute("data-doc")===d&&t.getAttribute("data-view")===v?"table-row-group":"none";});}' +
  'function V(v){r.setAttribute("data-active-view",v);vl.textContent=L[Number(v)]||L[0];try{localStorage.setItem(kv,v);}catch(e){}R();}' +
  'vb.addEventListener("click",function(){var c=Number(r.getAttribute("data-active-view")||"0");V(String((c+1)%3));});' +
  'var kd="pacote-document",ds=document.getElementById("document-select"),dt=document.getElementById("document-title"),lh=document.getElementById("left-label"),D=' +
  documentLabelsJson +
  ';' +
  'function Doc(d){if(!D[d])d=' +
  defaultDocJson +
  ';r.setAttribute("data-active-document",d);ds.value=d;dt.textContent=D[d];lh.textContent=D[d];try{localStorage.setItem(kd,d);}catch(e){}R();}' +
  'ds.addEventListener("change",function(){Doc(ds.value);});Doc(r.getAttribute("data-active-document")||' +
  defaultDocJson +
  ');V(r.getAttribute("data-active-view")||"0");})();';

const html =
  '<!DOCTYPE html>\n' +
  '<html lang="pt-pt" data-build-view="' +
  mode.modeIndex +
  '" data-active-view="' +
  mode.modeIndex +
  '">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '  <meta name="color-scheme" content="light dark">\n' +
  '  <title>Pacote laboral — diffs por diploma</title>\n' +
  '  <script>' +
  themeBootScript +
  '</script>\n' +
  '  <style>\n' +
  css.replace(/<\/style/gi, '<\\/style') +
  '\n  </style>\n' +
  '</head>\n' +
  '<body>\n' +
  '  <header class="page-header">\n' +
  '    <h1 class="page-title">Comparativo: <span id="document-title">' +
  escapeHtml(defaultDoc.label) +
  '</span> × Pacote Laboral</h1>\n' +
  '    <p class="page-subtitle">Baseado no <a href="https://portugal.gov.pt/gc25/comunicacao/documentos/trabalho-xxi-anteprojeto-de-lei-da-reforma-da-legislacao-laboral" target="_blank" rel="noopener">anteprojeto</a> apresentado a 25/07/2025</p>\n' +
  '    <div class="page-header-bar">\n' +
  '      <div class="page-header-bar__start">\n' +
  '        <label class="document-picker" for="document-select">\n' +
  '          <span>Diploma</span>\n' +
  '          <select id="document-select" class="document-select">\n' +
  documentOptionsHtml +
  '\n          </select>\n' +
  '        </label>\n' +
  '        <button type="button" id="view-cycle-btn" class="view-cycle-btn" aria-label="Mudar vista do comparativo">\n' +
  '          Vista: <span id="view-cycle-label"></span>\n' +
  '        </button>\n' +
  '      </div>\n' +
  '      <button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false" aria-label="Mudar para tema escuro">\n' +
  themeToggleIcons +
  '\n      </button>\n' +
  '    </div>\n' +
  '  </header>\n' +
  '  <div class="container" id="panel">\n' +
  '    <div class="diff-scroll">\n' +
  '      <table class="diff-table" id="diff-table">\n' +
  '        <thead>\n' +
  '          <tr>\n' +
  '            <th colspan="2" class="label-header"><span id="left-label">' +
  escapeHtml(defaultDoc.label) +
  '</span> atual</th>\n' +
  '            <th colspan="2" class="label-header">Proposta (anteprojeto)</th>\n' +
  '          </tr>\n' +
  '        </thead>\n' +
  '        ' +
  tbodyHtml +
  '\n' +
  '      </table>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '  <script>' +
  pageScript +
  '</script>\n' +
  '</body>\n' +
  '</html>\n';

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(outFile, html, 'utf8');
console.log(
  'Gerado:',
  outFile,
  '·',
  documents.length,
  'diplomas · predefinição:',
  defaultDoc.label,
  '· vista:',
  modeLabel,
);
