// docs/index.html を生成する。GitHub Pages がここを配信する。
//
// デモが動かしているのは src をビルドした結果そのもので、ページ用に書き
// 直したものではない。**書き直すと本体とずれる。** 直したつもりの挙動が
// デモでは古いまま、という状態が一番たちが悪い。
//
//   npm run demo:build    生成して書き出す
//   npm run demo:check    生成し直して差分が無いか見る (CI 用)
//
// ページは静的で、開いたあとサーバーに一切問い合わせない。検査は訪問者の
// ブラウザの中だけで完結する。

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MARKER = "/* __FLEX_GUARD_BUNDLE__ */";

/** 連結する順。依存の順に並べる。 */
const MODULES = [
  "spec.js",
  "walk.js",
  "detect.js",
  "rules/schema.js",
  "rules/size.js",
  "rules/render.js",
  "rules/variables.js",
  "index.js",
];

const IMPORT_LINE = /^\s*import\s.*?;\s*$/gm;
const EXPORT_FROM = /^\s*export\s+\{[^}]*\}\s+from\s+[^;]+;\s*$/gm;
const EXPORT_KEYWORD = /^(\s*)export\s+(const|function|class|let|var)\b/gm;

/**
 * ビルド結果を 1 つのスクリプトにまとめる。
 *
 * バンドラは使わない。依存が無く、モジュールが 8 つしかないので、
 * import と export の行を落として順に繋げれば足りる。道具を 1 つ増やす
 * より、10 行で読み切れる方がよい。
 */
function bundle(): string {
  const parts = MODULES.map((name) => {
    const source = readFileSync(join(ROOT, "dist", "src", name), "utf8")
      .replace(IMPORT_LINE, "")
      .replace(EXPORT_FROM, "")
      .replace(EXPORT_KEYWORD, "$1$2")
      .trim();
    return `// ---- ${name} ----\n${source}\n`;
  });

  return [
    "// flex-guard のビルド結果をそのまま束ねたもの。デモ用の書き直しではない。",
    "// 生成: npm run demo:build",
    "const FlexGuard = (() => {",
    parts.join("\n"),
    "return { validate, format, looksLikeFlex };",
    "})();",
  ].join("\n");
}

function render(): string {
  // tsc を node から直に起動する。npx 経由だとシェルが要り、
  // OS ごとに書き分けることになる。
  execFileSync(process.execPath, [join(ROOT, "node_modules", "typescript", "bin", "tsc")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const template = readFileSync(join(HERE, "demo-template.html"), "utf8");
  if (!template.includes(MARKER)) throw new Error("雛形に差し込み位置がありません");

  const script = bundle();
  // </script> が中に現れると HTML が途中で閉じる。ビルド結果に入ることは
  // 無いはずだが、入ったときは黙って壊れたページを出す方が困る。
  if (/<\/script/i.test(script)) throw new Error("バンドルに </script> が含まれています");

  return template.replace(MARKER, script);
}

const html = render();
const target = join(ROOT, "docs", "index.html");

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== html) {
    console.error("  docs/index.html が src と合っていません。npm run demo:build を実行してください。");
    process.exit(1);
  }
  console.log("  docs/index.html は src と一致しています");
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
  console.log(`  docs/index.html を生成しました (${html.length.toLocaleString()} バイト)`);
}
