// Import-boundary and content checker (skeleton spec, task 4.1).
// Pure: checkBoundaries(files) takes a map of workspace-relative posix paths to
// source text (or null for a file that could not be read) and returns violations.
import { posix } from "node:path";

export const APPS = ["dead-air", "night-desk"];
export const KIT = "packages/hindsight";
const KIT_SRC = `${KIT}/src`;
const CORE_ENTRY = `${KIT_SRC}/index.ts`;

// Which kit folders each kit folder may import from (itself always allowed).
export const KIT_DIRECTION = {
  engine: ["engine"],
  channel: ["channel", "engine"],
  ledger: ["ledger", "engine"],
  replay: ["replay", "ledger", "engine"],
};

export const FORBIDDEN_WORDS = ["resident", "booth", "modem", "tower", "night desk", "dead air", "fsk", "acoustic"];
export const README_WORDS = ["resident", "booth", "modem"];
export const FORBIDDEN_APIS = ["Math.random", "Date.now"];
export const DOM_GLOBALS = ["window", "document", "navigator", "AudioContext", "AudioWorkletNode"];
const BANNED_FOR_CORE = ["react", "react-dom"];
const API_FOLDERS = new Set(["engine", "channel", "modem"]);

/** Blank comments (and optionally string contents) while keeping every newline. */
export function stripSource(src, blankStrings = false) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c && !(c !== "`" && src[j] === "\n")) j += src[j] === "\\" ? 2 : 1;
      j = Math.min(j + 1, n);
      const lit = src.slice(i, j);
      out += blankStrings ? c + blank(lit.slice(1, -1)) + (lit.length > 1 ? lit[lit.length - 1] : "") : lit;
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

const IMPORT_RE =
  /(?:\bimport\s*(?:[^'"();]*?\bfrom\s*)?|\bexport\s[^'"();]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

/** All import specifiers with 1-based line numbers. */
export function extractSpecifiers(src) {
  const code = stripSource(src);
  const found = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    const at = m.index + m[0].length - m[2].length - 1;
    found.push({ specifier: m[2], line: lineOf(code, at) });
  }
  return found;
}

const isRelative = (s) => s.startsWith("./") || s.startsWith("../") || s === "." || s === "..";
const resolveRel = (file, spec) => posix.normalize(posix.join(posix.dirname(file), spec));
const within = (path, dir) => path === dir || path.startsWith(`${dir}/`);
const appOf = (path) => {
  const m = /^apps\/([^/]+)\//.exec(path);
  return m ? m[1] : null;
};
const namesApp = (spec) =>
  APPS.some((a) => spec === a || spec.startsWith(`${a}/`) || spec.includes(`/${a}/`) || spec.endsWith(`/${a}`)) ||
  spec.includes("apps/");
const kitFolder = (path) => {
  const m = new RegExp(`^${KIT_SRC}/([^/]+)(?:/|$)`).exec(path);
  return m && KIT_DIRECTION[m[1]] ? m[1] : null;
};

function importRule(file, spec) {
  const app = appOf(file);
  if (app) {
    if (isRelative(spec)) {
      const target = resolveRel(file, spec);
      if (within(target, `apps/${app}`)) return null;
      const other = appOf(`${target}/`);
      return other ? "app-imports-other-app" : "app-relative-leaves-app";
    }
    if (APPS.some((a) => a !== app && (spec === a || spec.startsWith(`${a}/`)))) return "app-imports-other-app";
    if ((spec === "hindsight" || spec.startsWith("hindsight/")) && spec !== "hindsight" && spec !== "hindsight/replay") {
      return "app-kit-deep-import";
    }
    return null;
  }
  if (within(file, KIT)) {
    if (isRelative(spec)) {
      const target = resolveRel(file, spec);
      if (!within(target, KIT)) return "kit-relative-leaves-kit";
      const from = kitFolder(file);
      const to = kitFolder(target);
      if (from && to && KIT_DIRECTION[from] && !KIT_DIRECTION[from].includes(to)) return "kit-folder-direction";
      return null;
    }
    if (namesApp(spec)) return "kit-names-app";
  }
  return null;
}

function coreClosure(files) {
  const seen = new Set();
  const queue = [CORE_ENTRY];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || typeof files[file] !== "string") continue;
    seen.add(file);
    for (const { specifier } of extractSpecifiers(files[file])) {
      if (!isRelative(specifier)) continue;
      const base = resolveRel(file, specifier);
      const hit = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
        (c) => typeof files[c] === "string",
      );
      if (hit) queue.push(hit);
    }
  }
  return seen;
}

function scanWords(file, text, words, violations) {
  const lower = text.toLowerCase();
  for (const word of words) {
    let at = lower.indexOf(word);
    while (at !== -1) {
      violations.push({ file, line: lineOf(text, at), specifier: text.slice(at, at + word.length), rule: "forbidden-word" });
      at = lower.indexOf(word, at + word.length);
    }
  }
}

function scanApis(file, text, violations) {
  for (const api of FORBIDDEN_APIS) {
    let at = text.indexOf(api);
    while (at !== -1) {
      violations.push({ file, line: lineOf(text, at), specifier: api, rule: "forbidden-api" });
      at = text.indexOf(api, at + api.length);
    }
  }
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const KIT_WORD_EXT = /\.(?:ts|tsx)$/;
const hasApiFolder = (file) => file.split("/").slice(0, -1).some((s) => API_FOLDERS.has(s));

/** @param {Record<string, string | null>} files @returns {{file:string,line:number,specifier:string,rule:string}[]} */
export function checkBoundaries(files) {
  const violations = [];
  const paths = Object.keys(files).sort();
  const closure = coreClosure(files);
  for (const file of paths) {
    const text = files[file];
    if (typeof text !== "string") {
      violations.push({ file, line: 0, specifier: "-", rule: "unreadable-file" });
      continue;
    }
    if (SOURCE_EXT.test(file)) {
      for (const { specifier, line } of extractSpecifiers(text)) {
        const rule = importRule(file, specifier);
        if (rule) violations.push({ file, line, specifier, rule });
        if (closure.has(file) && BANNED_FOR_CORE.some((b) => specifier === b || specifier.startsWith(`${b}/`))) {
          violations.push({ file, line, specifier, rule: "core-entry-imports-ui" });
        }
      }
    }
    if (closure.has(file)) {
      const code = stripSource(text, true);
      for (const g of DOM_GLOBALS) {
        for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${g}(?![\\w$])`, "g"))) {
          violations.push({ file, line: lineOf(code, m.index), specifier: g, rule: "core-entry-uses-dom-global" });
        }
      }
    }
    if (within(file, KIT) && KIT_WORD_EXT.test(file)) scanWords(file, text, FORBIDDEN_WORDS, violations);
    if (/(^|\/)README\.md$/.test(file)) scanWords(file, text, README_WORDS, violations);
    if (SOURCE_EXT.test(file) && (within(file, KIT) || hasApiFolder(file))) scanApis(file, text, violations);
  }
  return violations;
}

export const formatViolation = (v) => `${v.file}:${v.line} ${v.specifier} ${v.rule}`;
