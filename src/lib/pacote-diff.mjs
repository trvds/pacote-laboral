import * as Diff from 'diff';

export const ARTICLE_HEAD_RE = /^### Artigo (\d+\.º(?:-[A-Z])?)(?:\s*[—–-]\s*(.*))?\s*$/;
export const FOREIGN_BLOCK_RE = /^### Artigo \d+\.º(?:-[A-Z])? — Alteração (à|ao) /;
export const INTRA_LINE_SIMILARITY_MIN = 0.32;

export const VIEW_MODES = [
  { fullCt: false, onlyChanges: false, btn: 'Artigos alterados' },
  { fullCt: true, onlyChanges: false, btn: 'Todo o diploma' },
  { fullCt: true, onlyChanges: true, btn: 'Só linhas alteradas' },
];

export function splitAnteprojetoDocuments(text) {
  const lines = text.split(/\r?\n/);
  const docs = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    docs.push({
      id: cur.id,
      label: cur.label,
      text: cur.lines.join('\n').replace(/^\n+|\n+$/g, ''),
    });
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?\.md)\s*$/);
    if (m) {
      flush();
      cur = { id: m[1].trim(), label: m[1].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  flush();

  return docs.map((doc) => ({
    id: doc.id,
    label: doc.label,
    articles: parseArticles(doc.text).map((a) => Object.assign(a, { scope: doc.id })),
  }));
}

export function splitAnteprojeto(text) {
  const docs = splitAnteprojetoDocuments(text);
  if (docs.length) {
    return docs.flatMap((doc) =>
      doc.articles.map((a) =>
        Object.assign(a, {
          scope: doc.id === 'codigo_trabalho.md' ? 'ct' : 'foreign',
        }),
      ),
    );
  }

  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((l) => FOREIGN_BLOCK_RE.test(l));
  const ctPart = cut === -1 ? text : lines.slice(0, cut).join('\n');
  const foreignPart = cut === -1 ? '' : lines.slice(cut).join('\n');
  const ct = parseArticles(ctPart).map((a) => Object.assign(a, { scope: 'ct' }));
  const foreign = parseArticles(foreignPart).map((a) => Object.assign(a, { scope: 'foreign' }));
  return ct.concat(foreign);
}

export function parseArticles(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  let pendingStruct = [];
  let structMode = false;

  function isStructureMarkdownHeading(line) {
    if (line.startsWith('###')) return false;
    if (line.startsWith('##')) return true;
    if (line.startsWith('#')) return true;
    return false;
  }

  for (const line of lines) {
    const m = line.match(ARTICLE_HEAD_RE);
    if (m) {
      if (cur) out.push(cur);
      cur = {
        id: m[1],
        title: (m[2] || '').trim(),
        bodyLines: [],
        structureBefore: pendingStruct.slice(),
      };
      pendingStruct = [];
      structMode = false;
    } else if (structMode) {
      pendingStruct.push(line);
    } else if (isStructureMarkdownHeading(line)) {
      structMode = true;
      pendingStruct.push(line);
    } else if (cur) {
      cur.bodyLines.push(line);
    } else {
      pendingStruct.push(line);
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function articleBody(a) {
  return a.bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export function indexCodigoParagraphs(codigoBody) {
  const map = new Map();
  if (!codigoBody) return map;
  const lines = codigoBody.split(/\r?\n/);
  let cur = null;
  const buf = [];
  const flush = () => {
    if (cur != null) map.set(cur, buf.join('\n'));
  };
  for (const line of lines) {
    const m = line.match(/^-\s*(\d+)\s*[–-]+(.*)$/);
    if (m) {
      flush();
      cur = parseInt(m[1], 10);
      buf.length = 0;
      buf.push(line);
    } else if (cur != null) buf.push(line);
  }
  flush();
  return map;
}

export function extractAlineaFromBlock(block, letter) {
  if (!block) return null;
  const low = letter.toLowerCase();
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(new RegExp('^(\\s*)-\\s*' + low + '\\)\\s*(.*)$', 'i'));
    if (m) return { full: line, body: m[2] };
  }
  return null;
}

export function renumberParagraphBlock(block, newNum) {
  if (!block) return block;
  const ls = block.split(/\r?\n/);
  if (ls.length === 0) return block;
  ls[0] = ls[0].replace(/^-\s*\d+(\s*[–-]+)/, '- ' + newNum + '$1');
  return ls.join('\n');
}

export function alineaWithNewLetter(oldLine, newLetter) {
  return oldLine.replace(/^(\s*-\s*)[a-z]\)/i, '$1' + newLetter.toLowerCase() + ')');
}

export function extractParagraphIntroOnly(block) {
  if (!block) return '';
  const intro = [];
  for (const L of block.split(/\r?\n/)) {
    if (/^\s+-\s*[a-z]\)/i.test(L)) break;
    intro.push(L);
  }
  return intro.join('\n');
}

export function peekHasNestedAlineas(lines, paraLineIndex) {
  for (let k = paraLineIndex + 1; k < lines.length; k++) {
    const t = lines[k];
    if (t.trim() === '') continue;
    if (/^-\s*\d+\s*[–-]/.test(t)) return false;
    if (/^\s+-\s*[a-z]\)/i.test(t)) return true;
    return false;
  }
  return false;
}

export function pushExpandedParagraphBlock(out, block, useIntroOnly) {
  if (!block) return;
  const text = useIntroOnly ? extractParagraphIntroOnly(block) : block;
  if (text) out.push.apply(out, text.split(/\r?\n/));
}

const ELLIPSIS_BODY_RE = /^\[(?:…|\.\.\.)]\s*[.:;,]?\s*$/;
const REVOGADO_BODY_RE = /^\[Revogado]\s*[.:;,]?\s*$/i;
const ANTERIOR_N_BODY_RE = /^\(anterior n\.?\s*º\s*(\d+)\)\s*\.?\s*$/i;

export function isArticleRevogado(article) {
  return REVOGADO_BODY_RE.test(articleBody(article).trim());
}

export function expandAnteprojetoForDiff(anteBody, codigoBody) {
  const paras = indexCodigoParagraphs(codigoBody);
  const lines = anteBody.split(/\r?\n/);
  const out = [];
  let curPara = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const para = line.match(/^-\s*(\d+)\s*[–-]+(.*)$/);
    if (para && !/^\s/.test(line)) {
      const n = parseInt(para[1], 10);
      curPara = n;
      const rest = para[2].trim();

      if (REVOGADO_BODY_RE.test(rest)) continue;

      if (ELLIPSIS_BODY_RE.test(rest)) {
        const block = paras.get(n);
        if (block) {
          const nested = peekHasNestedAlineas(lines, i);
          pushExpandedParagraphBlock(out, block, nested);
        } else out.push(line);
        continue;
      }

      const an = rest.match(ANTERIOR_N_BODY_RE);
      if (an) {
        const oldN = parseInt(an[1], 10);
        const block = paras.get(oldN);
        if (block) {
          const ren = renumberParagraphBlock(block, n);
          pushExpandedParagraphBlock(out, ren, peekHasNestedAlineas(lines, i));
        } else out.push(line);
        continue;
      }

      out.push(line);
      continue;
    }

    const al = line.match(/^(\s*)-\s*([a-z])\)\s*(.*)$/i);
    if (al) {
      const letter = al[2].toLowerCase();
      const rest = al[3].trim();

      if (REVOGADO_BODY_RE.test(rest)) continue;

      if (ELLIPSIS_BODY_RE.test(rest)) {
        if (curPara == null || !paras.has(curPara)) {
          out.push(line);
          continue;
        }
        const got = extractAlineaFromBlock(paras.get(curPara), letter);
        if (got) out.push(got.full);
        else out.push(line);
        continue;
      }

      const aan = rest.match(/^\(anterior al\.\s*([a-z])\)/i);
      if (aan) {
        const oldL = aan[1].toLowerCase();
        if (curPara == null || !paras.has(curPara)) {
          out.push(line);
          continue;
        }
        const got = extractAlineaFromBlock(paras.get(curPara), oldL);
        if (got) out.push(alineaWithNewLetter(got.full, letter));
        else out.push(line);
        continue;
      }

      out.push(line);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

export function identityDiffRows(text) {
  if (text == null || text === '') return [];
  const lines = text.split(/\r?\n/);
  const rows = [];
  let ln = 1;
  for (const line of lines) {
    rows.push({ type: 'ctx', left: line, right: line, lnL: ln, lnR: ln });
    ln++;
  }
  return rows;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wordOverlapSimilarity(a, b) {
  const toks = (s) => String(s).toLowerCase().match(/[^\s]+/g) || [];
  const A = toks(a);
  const B = toks(b);
  if (A.length === 0 && B.length === 0) return 1;
  const bag = new Map();
  for (const w of B) bag.set(w, (bag.get(w) || 0) + 1);
  let hits = 0;
  for (const w of A) {
    const c = bag.get(w);
    if (c) {
      hits++;
      bag.set(w, c - 1);
    }
  }
  return hits / Math.max(A.length, B.length, 1);
}

function partsToSegments(parts, side) {
  const segs = [];
  for (const p of parts) {
    if (side === 'left') {
      if (p.added) continue;
      if (p.removed) segs.push({ op: 'del', text: p.value });
      else segs.push({ op: 'eq', text: p.value });
    } else {
      if (p.removed) continue;
      if (p.added) segs.push({ op: 'add', text: p.value });
      else segs.push({ op: 'eq', text: p.value });
    }
  }
  return segs;
}

function mergeWhitespaceBetweenSameOp(segments, mergeOp) {
  const out = [];
  let i = 0;
  while (i < segments.length) {
    const cur = segments[i];
    if (cur.op !== mergeOp) {
      out.push(cur);
      i++;
      continue;
    }
    let buf = cur.text;
    i++;
    while (i < segments.length) {
      const mid = segments[i];
      const nxt = segments[i + 1];
      if (mid && mid.op === 'eq' && /^\s+$/.test(mid.text) && nxt && nxt.op === mergeOp) {
        buf += mid.text + nxt.text;
        i += 2;
      } else {
        break;
      }
    }
    out.push({ op: mergeOp, text: buf });
  }
  return out;
}

function emitSegmentsHtml(segments, spanClass) {
  let html = '';
  for (const s of segments) {
    if (s.op === 'eq') html += escapeHtml(s.text);
    else html += '<span class="' + spanClass + '">' + escapeHtml(s.text) + '</span>';
  }
  return html;
}

function inlineDiffWordSpans(oldLine, newLine) {
  const parts = Diff.diffWordsWithSpace(oldLine || '', newLine || '');
  const leftSegs = mergeWhitespaceBetweenSameOp(partsToSegments(parts, 'left'), 'del');
  const rightSegs = mergeWhitespaceBetweenSameOp(partsToSegments(parts, 'right'), 'add');
  return {
    leftHtml: emitSegmentsHtml(leftSegs, 'inline-del'),
    rightHtml: emitSegmentsHtml(rightSegs, 'inline-add'),
  };
}

export function legalLineMeta(line) {
  const s = line || '';
  const mArt = s.match(/^(###\s+Artigo\s+(\d+\.º(?:-[A-Z])?)\s*[—–-]\s*)(.*)$/i);
  if (mArt) {
    return { kind: 'artigo', key: 'art:' + mArt[2], prefix: mArt[1], body: mArt[3] };
  }
  const mAl = s.match(/^(\s*-\s*)([a-z])(\)\s*)(.*)$/i);
  if (mAl) {
    return {
      kind: 'alinea',
      key: 'al:' + mAl[2].toLowerCase(),
      prefix: mAl[1] + mAl[2] + mAl[3],
      body: mAl[4],
    };
  }
  const mPa = s.match(/^(-\s*\d+\s*[–-]+\s*)(.*)$/);
  if (mPa) {
    const num = (mPa[1].match(/(\d+)/) || [])[1] || '';
    return { kind: 'para', key: 'p:' + num, prefix: mPa[1], body: mPa[2] };
  }
  return { kind: 'plain', key: 'plain', prefix: '', body: s };
}

export function legalStructureMatches(a, b) {
  return a.kind === b.kind && a.key === b.key;
}

export function pairedLineDiffHtml(L, R) {
  const ml = legalLineMeta(L);
  const mr = legalLineMeta(R);
  if (!legalStructureMatches(ml, mr)) {
    return { leftHtml: escapeHtml(L), rightHtml: escapeHtml(R) };
  }
  if (wordOverlapSimilarity(ml.body, mr.body) < INTRA_LINE_SIMILARITY_MIN) {
    return { leftHtml: escapeHtml(L), rightHtml: escapeHtml(R) };
  }
  const { leftHtml: lb, rightHtml: rb } = inlineDiffWordSpans(ml.body, mr.body);
  return {
    leftHtml: escapeHtml(ml.prefix) + lb,
    rightHtml: escapeHtml(mr.prefix) + rb,
  };
}

function chunkToLines(chunk) {
  let c = chunk;
  if (c.endsWith('\n')) c = c.slice(0, -1);
  return c.length ? c.split('\n') : [];
}

export function sideBySideRows(oldStr, newStr) {
  const parts = Diff.diffLines(oldStr || '', newStr || '');
  const rows = [];
  let lnL = 1;
  let lnR = 1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lines = chunkToLines(part.value);

    if (part.removed && i + 1 < parts.length && parts[i + 1].added) {
      const nextLines = chunkToLines(parts[i + 1].value);
      const n = Math.max(lines.length, nextLines.length);
      for (let j = 0; j < n; j++) {
        const L = j < lines.length ? lines[j] : null;
        const R = j < nextLines.length ? nextLines[j] : null;
        if (L != null && R != null) {
          if (L === R) {
            rows.push({ type: 'ctx', left: L, right: R, lnL: lnL++, lnR: lnR++ });
          } else {
            const { leftHtml, rightHtml } = pairedLineDiffHtml(L, R);
            rows.push({
              type: 'chg',
              leftHtml,
              rightHtml,
              lnL: lnL++,
              lnR: lnR++,
            });
          }
        } else if (L != null) {
          rows.push({ type: 'del', left: L, right: null, lnL: lnL++, lnR: null });
        } else if (R != null) {
          rows.push({ type: 'add', left: null, right: R, lnL: null, lnR: lnR++ });
        }
      }
      i++;
      continue;
    }

    for (const line of lines) {
      if (part.removed) {
        rows.push({ type: 'del', left: line, right: null, lnL: lnL++, lnR: null });
      } else if (part.added) {
        rows.push({ type: 'add', left: null, right: line, lnL: null, lnR: lnR++ });
      } else {
        rows.push({ type: 'ctx', left: line, right: line, lnL: lnL++, lnR: lnR++ });
      }
    }
  }
  return rows;
}

export function buildAllDiffSections(codigoMap, anteList) {
  const sections = [];
  for (let i = 0; i < anteList.length; i++) {
    const prop = anteList[i];
    if (isArticleRevogado(prop)) {
      const id = prop.id;
      const cur = codigoMap.get(id);
      const leftBody = cur ? articleBody(cur) : '';
      sections.push({
        title: 'Artigo ' + id + ' — ' + (cur?.title ?? prop.title) + ' · Revogado',
        rows: sideBySideRows(leftBody, ''),
      });
      continue;
    }    
    const id = prop.id;
    let cur = prop.scope === 'foreign' ? null : codigoMap.get(id);
    const leftBody = cur ? articleBody(cur) : '';
    const rawAnte = articleBody(prop);
    const rightBody =
      prop.scope === 'foreign' || !cur ? rawAnte : expandAnteprojetoForDiff(rawAnte, leftBody);
    const rows = sideBySideRows(leftBody, rightBody);
    const tag = prop.scope === 'foreign' ? ' — outros diplomas' : '';
    sections.push({
      title: 'Artigo ' + id + ' — ' + prop.title + tag,
      rows,
    });
  }
  return sections;
}

export function buildSectionsFullCodigo(codigoList, codigoMap, anteList) {
  const anteCtById = new Map();
  const foreignList = [];
  for (const a of anteList) {
    if (a.scope === 'foreign') foreignList.push(a);
    else anteCtById.set(a.id, a);
  }
  const codigoIds = new Set(codigoList.map((c) => c.id));
  const sections = [];

  for (const cur of codigoList) {
    const prop = anteCtById.get(cur.id);
    const leftBody = articleBody(cur);
    let title = 'Artigo ' + cur.id + ' — ' + cur.title;
    let rows;
    if (prop) {
      if (isArticleRevogado(prop)) {
        rows = sideBySideRows(leftBody, '');
        title += ' · Revogado';
      } else {
        const rawAnte = articleBody(prop);
        const rightBody = expandAnteprojetoForDiff(rawAnte, leftBody);
        rows = sideBySideRows(leftBody, rightBody);
        if (cur.title !== prop.title) {
          title += ' · Anteprojeto: ' + prop.title;
        }
      }
    } else {
      rows = identityDiffRows(leftBody);
      title += ' · sem alteração neste anteprojeto';
    }
    sections.push({
      title,
      rows,
    });
  }

  for (const prop of anteList) {
    if (prop.scope === 'foreign') continue;
    if (!codigoIds.has(prop.id)) {
      const leftBody = '';
      const rawAnte = articleBody(prop);
      const rightBody = expandAnteprojetoForDiff(rawAnte, leftBody);
      sections.push({
        title: 'Artigo ' + prop.id + ' — ' + prop.title + ' (novo no anteprojeto)',
        rows: sideBySideRows(leftBody, rightBody),
      });
    }
  }

  for (const prop of foreignList) {
    const leftBody = '';
    const rawAnte = articleBody(prop);
    sections.push({
      title: 'Artigo ' + prop.id + ' — ' + prop.title + ' — outros diplomas',
      rows: sideBySideRows(leftBody, rawAnte),
    });
  }

  return sections;
}

export function flattenSectionsForRender(sections, onlyChanges) {
  const out = [];
  for (const s of sections) {
    const rows = onlyChanges ? s.rows.filter((r) => r.type !== 'ctx') : s.rows;
    if (onlyChanges && rows.length === 0) continue;
    out.push({ kind: 'section', title: s.title });
    for (const r of rows) out.push({ kind: 'diff', row: r });
  }
  return out;
}

/**
 * @param {string} codigoText
 * @param {string} anteText
 * @param {{ fullCt: boolean, onlyChanges: boolean }} opts
 */
export function computeFlatItems(codigoText, anteText, opts) {
  const { fullCt, onlyChanges } = opts;
  const codigoList = parseArticles(codigoText);
  const codigoMap = new Map();
  for (const a of codigoList) {
    codigoMap.set(a.id, a);
  }
  const anteList = splitAnteprojeto(anteText);
  const sections = fullCt
    ? buildSectionsFullCodigo(codigoList, codigoMap, anteList)
    : buildAllDiffSections(codigoMap, anteList);
  return flattenSectionsForRender(sections, onlyChanges);
}

/**
 * @param {string} currentText
 * @param {string} anteText
 * @param {string} documentId
 * @param {{ fullCt: boolean, onlyChanges: boolean }} opts
 */
export function computeFlatItemsForDocument(currentText, anteText, documentId, opts) {
  const { fullCt, onlyChanges } = opts;
  const currentList = parseArticles(currentText);
  const currentMap = new Map();
  for (const a of currentList) {
    currentMap.set(a.id, a);
  }

  const doc = splitAnteprojetoDocuments(anteText).find((d) => d.id === documentId);
  const anteList = doc ? doc.articles : [];
  const sections = fullCt
    ? buildSectionsFullCodigo(currentList, currentMap, anteList)
    : buildAllDiffSections(currentMap, anteList);
  return flattenSectionsForRender(sections, onlyChanges);
}
