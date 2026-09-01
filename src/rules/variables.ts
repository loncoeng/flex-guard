// 変数を後から差し込む使い方に対する検査。
//
// Flex を雛形として保存し、送るときに宛先ごとの値を差し込む作りは、
// 業務で使うとほぼ必ず出てくる。このとき、差し込む値に改行や引用符が
// 入ると JSON が壊れる。
//
// 壊れ方が悪い。雛形を作った人の手元では通り、値によっては通り、
// **特定の相手に送るときだけ落ちる**。名前に " が入っている人が 1 人
// 混ざっていた、という形で出る。

import type { Finding, RuleContext } from "../types.ts";
import { walk } from "../walk.ts";

/** {name} {field:誕生日} {{first_name}} $NAME のような形を拾う。 */
const PLACEHOLDER = /\{\{?[^{}\n]{1,60}\}?\}/g;

/** 値を差し込む可能性がある文字列プロパティ。 */
const TEXT_KEYS = ["text", "altText", "label", "data", "displayText", "uri", "url"];

/**
 * プレースホルダを含む文字列。
 *
 * 差し込む値をエスケープしているかどうかは、この JSON からは分からない。
 * だから「壊れている」ではなく「壊れうる」として warning で挙げ、
 * 何を確かめればよいかを示す。
 */
export function unescapedPlaceholder(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const visit of walk(context.message)) {
    for (const key of TEXT_KEYS) {
      const value = visit.node[key];
      if (typeof value !== "string") continue;
      const matches = [...value.matchAll(PLACEHOLDER)].map((m) => m[0]);
      if (matches.length === 0) continue;

      const path = `${visit.path}.${key}`;
      if (seen.has(path)) continue;
      seen.add(path);

      findings.push({
        rule: "variables/unescaped-placeholder",
        severity: "warning",
        path,
        message: `差し込みらしき記述があります (${matches.slice(0, 3).join(" ")})`,
        hint:
          "差し込む値に改行や引用符が入ると JSON が壊れます。JSON の中に差し込むときは"
          + " JSON.stringify した結果から前後の引用符を落としたものを入れてください。"
          + " 素の値を入れると、特定の相手に送るときだけ落ちます。",
      });
    }
  }
  return findings;
}
