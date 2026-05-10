/**
 * Converte texto plano (linhas: Capítulo, Artigo, "1 - ...") em Markdown
 * alinhado com content/codigo_trabalho.md (## divisões, ### artigos, listas).
 */
import fs from "fs";

const ART_RE = /^Artigo\s+(\d+\.º(?:-[A-Z])?)\s*$/i;
const STRUCT_RE =
  /^(Capítulo|Secção|Subsecção|Título|Livro|Parte|Anexo)(?:\s+(.+))?$/i;
const NUM_PAR_RE = /^(\d+)\s*-\s*(.*)$/;
const SUB_ALI_RE = /^([a-z])\)\s*(.*)$/i;
const SUB_ROMAN_RE = /^([ivxlcdm]+)\)\s*(.*)$/i;

function skipNoise(lines, i) {
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || t === "Alterações ao artigo") {
      i++;
      continue;
    }
    if (t === "Notas") {
      i++;
      while (i < lines.length) {
        const u = lines[i].trim();
        if (u === "Alterações ao artigo" || ART_RE.test(u) || STRUCT_RE.test(u)) break;
        i++;
      }
      continue;
    }
    break;
  }
  return i;
}

function flushParagraph(out, buf) {
  if (!buf.length) return;
  const text = buf.join("\n\n").trim();
  if (text) out.push(text, "");
  buf.length = 0;
}

function lastOutIsNumberedParagraph(out) {
  for (let j = out.length - 1; j >= 0; j--) {
    const L = out[j];
    if (L === "") continue;
    return typeof L === "string" && /^\s*-\s*\d+\s*-/.test(L);
  }
  return false;
}

function formatBody(out, bodyLines) {
  const buf = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      inList = false;
      if (out[out.length - 1] !== "") out.push("");
    }
  };

  for (const raw of bodyLines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (t === "" || t === "Alterações ao artigo") continue;

    const nm = t.match(NUM_PAR_RE);
    if (nm) {
      flushParagraph(out, buf);
      if (!inList) inList = true;
      out.push(`- ${nm[1]} - ${nm[2]}`);
      continue;
    }

    const sm = t.match(SUB_ALI_RE);
    if (sm) {
      flushParagraph(out, buf);
      if (lastOutIsNumberedParagraph(out)) out.push(`  - ${sm[1]}) ${sm[2]}`);
      else {
        if (!inList) inList = true;
        out.push(`- ${sm[1]}) ${sm[2]}`);
      }
      continue;
    }

    const rm = t.match(SUB_ROMAN_RE);
    if (rm) {
      flushParagraph(out, buf);
      if (lastOutIsNumberedParagraph(out)) out.push(`  - ${rm[1]}) ${rm[2]}`);
      else {
        if (!inList) inList = true;
        out.push(`- ${rm[1]}) ${rm[2]}`);
      }
      continue;
    }

    flushList();
    buf.push(t);
  }
  flushParagraph(out, buf);
  flushList();
}

function formatDiploma(src) {
  let lines = src.replace(/\r\n/g, "\n").split("\n");

  const header = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (ART_RE.test(t) || STRUCT_RE.test(t)) break;
    if (t !== "") header.push(lines[i]);
    i++;
  }

  const out = [];
  for (const h of header) {
    const u = h.trim();
    if (u && u !== "Notas") out.push(h.trim());
  }
  if (out.length) out.push("");

  while (i < lines.length) {
    i = skipNoise(lines, i);
    if (i >= lines.length) break;

    const line = lines[i].trim();

    const st = line.match(STRUCT_RE);
    if (st) {
      const rest = (st[2] || "").trim();
      out.push(rest ? `## ${st[1]} ${rest}` : `## ${st[1]}`);
      i++;
      const titleParts = [];
      while (i < lines.length) {
        const u = lines[i].trim();
        if (!u) break;
        if (ART_RE.test(u) || STRUCT_RE.test(u)) break;
        titleParts.push(u);
        i++;
      }
      if (titleParts.length) {
        out.push("");
        out.push(titleParts.join(" "));
        out.push("");
      } else out.push("");
      continue;
    }

    const am = line.match(ART_RE);
    if (am) {
      const artNum = am[1];
      i++;
      let title = "";
      if (i < lines.length) {
        const cand = lines[i].trim();
        if (
          cand &&
          !ART_RE.test(cand) &&
          !STRUCT_RE.test(cand) &&
          !NUM_PAR_RE.test(cand) &&
          !/^Notas$/i.test(cand)
        ) {
          title = cand;
          i++;
        }
      }
      const body = [];
      while (i < lines.length) {
        const u = lines[i].trim();
        if (ART_RE.test(u) || STRUCT_RE.test(u)) break;
        body.push(lines[i]);
        i++;
      }
      if (title) out.push(`### Artigo ${artNum} — ${title}`);
      else out.push(`### Artigo ${artNum}`);
      out.push("");
      formatBody(out, body);
      if (out[out.length - 1] !== "") out.push("");
      continue;
    }

    i++;
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node format-diploma-plain-to-md.mjs <input>");
  process.exit(1);
}
const md = formatDiploma(fs.readFileSync(file, "utf8"));
process.stdout.write(md);
