// 公開する入口。
//
//   validate(message)      Flex を検査する
//   looksLikeFlex(text)    テキストとして送ろうとしているものが Flex でないか見る

import { containerTooLarge, propertyTooLong } from "./rules/size.ts";
import {
  darkModeInvisible,
  emptyContainer,
  insecureUrl,
  mixedBubbleSize,
} from "./rules/render.ts";
import {
  invalidEnum,
  missingRequired,
  unknownProperty,
  unknownType,
} from "./rules/schema.ts";
import { unescapedPlaceholder } from "./rules/variables.ts";
import type { Finding, Result, Rule, RuleContext } from "./types.ts";
import { rootKind } from "./walk.ts";

export type { Finding, Result, Rule, Severity } from "./types.ts";
export type { FlexLikeness } from "./detect.ts";
export { looksLikeFlex } from "./detect.ts";

/** 既定で動くルール。名前で無効化できるよう、識別子と対にして持つ。 */
const RULES: Readonly<Record<string, Rule>> = {
  "schema/unknown-type": unknownType,
  "schema/unknown-property": unknownProperty,
  "schema/missing-required": missingRequired,
  "schema/invalid-enum": invalidEnum,
  "size/container-too-large": containerTooLarge,
  "size/property-too-long": propertyTooLong,
  "render/dark-mode-invisible": darkModeInvisible,
  "render/empty-container": emptyContainer,
  "render/mixed-bubble-size": mixedBubbleSize,
  "render/insecure-url": insecureUrl,
  "variables/unescaped-placeholder": unescapedPlaceholder,
};

export interface Options {
  /**
   * 無効にするルール。前方一致で当たるので、`render` と書けば見え方の検査を
   * まとめて外せる。
   *
   * 外せるようにしてあるのは、warning に「そう作ってある」場合があるため。
   * error を外す用途は想定していないが、止める側に回るのはこちらの仕事では
   * ないので禁じてはいない。
   */
  disable?: readonly string[];
  /**
   * 仕様に無いが送りたいプロパティ。LINE 側が先に増えたときの逃げ道。
   *
   * 表は LINE の定義から生成しているので、LINE が新しいプロパティを足すと
   * 一時的に「未知」と出る。そのときに再生成を待たずに済むようにしておく。
   */
  allowProperties?: readonly string[];
}

const applies = (rule: string, disabled: readonly string[]): boolean =>
  !disabled.some((prefix) => rule === prefix || rule.startsWith(`${prefix}/`));

/**
 * Flex メッセージを検査する。
 *
 * `{type:"flex", altText, contents}` でも、中身の bubble / carousel 単体でも
 * 受け取る。前者なら altText の欠落まで見られる。
 */
export function validate(message: unknown, options: Options = {}): Result {
  const disabled = options.disable ?? [];
  const allowed = new Set(options.allowProperties ?? []);

  if (rootKind(message) === undefined) {
    return finish([
      {
        rule: "schema/unknown-type",
        severity: "error",
        path: "$",
        message: 'Flex メッセージではありません (type が "flex" / "bubble" / "carousel" のいずれでもない)',
        hint: "テキストを渡していませんか。その場合は looksLikeFlex() を使ってください。",
      },
    ]);
  }

  const serialized = serialize(message);
  if (serialized === undefined) {
    // 循環参照など。LINE に送ることもできないので error として返す。
    // ここで例外を投げると、検査を呼んだ側が落ちる。**検査器が入力で
    // 落ちるのは、見逃すより悪い。**
    return finish([
      {
        rule: "schema/not-serializable",
        severity: "error",
        path: "$",
        message: "JSON にできません (循環参照が含まれている可能性があります)",
        hint: "組み立ての途中で同じオブジェクトを 2 か所に入れていませんか。",
      },
    ]);
  }

  const context: RuleContext = { message, serialized };

  const findings: Finding[] = [];
  for (const [name, rule] of Object.entries(RULES)) {
    if (!applies(name, disabled)) continue;
    for (const finding of rule(context)) {
      if (finding.rule === "schema/unknown-property") {
        const key = finding.path.slice(finding.path.lastIndexOf(".") + 1);
        if (allowed.has(key)) continue;
      }
      findings.push(finding);
    }
  }
  return finish(findings);
}

function serialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return undefined;
  }
}

function finish(findings: Finding[]): Result {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  // ok は「LINE が受け取るか」だけを見る。warning は判断の余地があるので
  // 含めない。ここを混ぜると、警告を消すために検査を切る動機が生まれる。
  return { ok: errors.length === 0, findings, errors, warnings };
}

/** 人が読む1行に整える。CI のログや console.log にそのまま流せる。 */
export function format(finding: Finding): string {
  const head = `[${finding.severity}] ${finding.path}  ${finding.message}`;
  return finding.hint === undefined ? head : `${head}\n          ${finding.hint}`;
}
