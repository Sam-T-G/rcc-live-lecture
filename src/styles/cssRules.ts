// A small reader for the app's stylesheets, shared by the style tests (contrast.test.ts,
// surfaces.test.ts). Vitest blanks CSS imports, so the tests read the files from disk and this
// turns them into rules: selectors, the at-rules around each one, and its declarations.
export type Rule = { selectors: string[]; at: string[]; decls: [string, string][] };

// Splits on `sep` where it isn't inside brackets or quotes.
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// Every style rule in a stylesheet: its selectors, the at-rules around it (@layer, @media, ...)
// and its declarations in order. Statements such as @import and `@layer a, b;` are skipped.
// The app's CSS doesn't nest style rules, so a style rule's whole body is declarations.
export function parse(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const open: string[] = []; // the preludes of the blocks we're inside
  let buf = "";
  let quote = "";
  let depth = 0;
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = "";
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    const inStyleRule = open.length > 0 && !open[open.length - 1].startsWith("@");
    if (depth > 0 || !"{};".includes(ch) || (ch === ";" && inStyleRule)) {
      buf += ch;
      continue;
    }
    if (ch === ";") {
      buf = ""; // a statement outside a style rule, such as @import
    } else if (ch === "{") {
      open.push(buf.trim());
      buf = "";
    } else {
      const prelude = open.pop();
      if (prelude === undefined) throw new Error("A } with no {");
      if (!prelude.startsWith("@")) {
        const decls = splitTop(buf, ";").flatMap((d): [string, string][] => {
          const i = d.indexOf(":");
          return i > 0 ? [[d.slice(0, i).trim(), d.slice(i + 1).replace(/!important\s*$/, "").trim()]] : [];
        });
        rules.push({ selectors: splitTop(prelude, ","), at: [...open], decls });
      }
      buf = "";
    }
  }
  if (open.length) throw new Error("A { with no }");
  return rules;
}
