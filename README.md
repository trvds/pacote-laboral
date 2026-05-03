# Pacote laboral — comparativo Código do Trabalho × anteprojeto

Este repositório mantém o **texto consolidado do Código do Trabalho** e o **anteprojeto** em Markdown, e gera uma **página HTML estática** com o comparativo (diff) entre ambos.

---

## Onde estão os textos

| Ficheiro | Conteúdo |
|----------|----------|
| [`content/codigo_trabalho.md`](content/codigo_trabalho.md) | Código do Trabalho na versão que queres usar como “texto atual” (coluna esquerda do diff). |
| [`content/anteprojeto.md`](content/anteprojeto.md) | Texto do anteprojeto / pacote laboral (coluna direita do diff). |

Qualquer alteração substantiva ao comparativo passa por **atualizar um ou ambos** estes ficheiros. Convém que o anteprojeto continue a usar a mesma convenção de artigos (`### Artigo …`) e marcas (`[…]`, `[Revogado]`, `(anterior n.º …)`, etc.) que o código em [`src/lib/pacote-diff.mjs`](src/lib/pacote-diff.mjs) assume — caso contrário o diff ou a expansão podem comportar-se de forma inesperada.

---

## Como é gerado o HTML

O resultado é **um único ficheiro HTML** autónomo (CSS embutido, tabela já preenchida; sem `fetch` nem JavaScript no browser).

1. **`npm install`** — instala a biblioteca [`diff`](https://www.npmjs.com/package/diff) (jsdiff), usada só no build em Node.

2. **`npm run build`** (ou variantes abaixo) executa [`src/generate-static-html.mjs`](src/generate-static-html.mjs), que:
   - lê `content/codigo_trabalho.md` e `content/anteprojeto.md`;
   - lê os estilos em [`src/styles-pacote-github.css`](src/styles-pacote-github.css);
   - importa a lógica em [`src/lib/pacote-diff.mjs`](src/lib/pacote-diff.mjs): parte o texto em artigos, expande marcas do anteprojeto face ao código, calcula o diff linha a linha e o realce intra-linha quando aplicável;
   - grava o **HTML final** com o **CSS embutido** em `<style>` e a **tabela de diff já montada**.

**Modos de geração** (o HTML reflecte **só** o modo escolhido no build):

| Comando | Descrição |
|---------|-----------|
| `npm run build` ou `build:ante` | Trechos referidos no anteprojeto, diff completo (predefinido). |
| `npm run build:full` | Todo o Código do Trabalho na ordem do ficheiro, com diff face ao anteprojeto. |
| `npm run build:changes` | Mesma ordem completa, mas só linhas com alterações. |
| `npm run build -- --mode=full` | Igual a `build:full` (podes usar `ante` ou `changes` no valor de `--mode=`). |

Para pré-visualizar localmente, serve o ficheiro gerado por HTTP (por exemplo com [`serve`](https://www.npmjs.com/package/serve) na pasta onde o HTML foi gravado).

---

## Como contribuir

1. **Fork / branch** a partir da branch principal do repositório (ex.: `main`).

2. **Edita os conteúdos** em `content/` conforme a fonte que estiveres a consolidar (correcções tipográficas, alinhamento com diplomas oficiais, nova versão do anteprojeto, etc.).

3. Se alterares **regras de parsing, expansão ou diff**, o sítio certo é **`src/lib/pacote-diff.mjs`** — mantém a lógica coerente com o que o gerador espera.

4. **Gera o HTML** com `npm run build` e abre o ficheiro gerado no browser (via servidor HTTP, se for o caso).

5. Abre um **pull request** com uma descrição clara: que ficheiros mudaram (`content/` vs `src/`) e, se aplicável, a fonte ou o diploma de referência.

6. Garante que **`package-lock.json`** fica coerente se mudares dependências em `package.json` (normalmente `npm install` após alterar deps).

---

## Estrutura útil do repositório

```
content/
  codigo_trabalho.md   ← texto “atual”
  anteprojeto.md       ← proposta
src/
  generate-static-html.mjs   ← orquestra o build
  lib/pacote-diff.mjs        ← núcleo do diff / expansão
  styles-pacote-github.css  ← aparência do diff
```

---

## Nota legal

Os textos em `content/` destinam-se a comparação informativa. Direitos e publicação oficiais cabem às entidades e fontes que os publicam.
