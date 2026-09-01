// 構造の検査。すべて error にしている。
//
// ここで挙がるものは LINE API が 400 を返す。送信そのものが失敗するので、
// 直さない選択肢が無い。

import { ACTIONS, FLEX_COMPONENTS, FLEX_CONTAINERS, FLEX_MESSAGE, type TypeSpec } from "../spec.ts";
import type { Finding, RuleContext } from "../types.ts";
import { specFor, walk, type Visit } from "../walk.ts";

const REFERENCE = "https://developers.line.biz/en/reference/messaging-api/#flex-message";

function tableFor(visit: Visit): TypeSpec | undefined {
  if (visit.kind === "message") return FLEX_MESSAGE;
  if (visit.kind === "action") return visit.type === undefined ? undefined : ACTIONS[visit.type];
  return specFor(visit);
}

function known(kind: Visit["kind"]): readonly string[] {
  if (kind === "container") return Object.keys(FLEX_CONTAINERS);
  if (kind === "component") return Object.keys(FLEX_COMPONENTS);
  if (kind === "action") return Object.keys(ACTIONS);
  return ["flex"];
}

/**
 * 未知のプロパティ。
 *
 * LINE API は知らないキーがあるとメッセージ全体を拒否する。これが起きる
 * のは、独自のメタ情報を JSON に持たせている場合が多い。タップ回数や
 * 内部 ID を content に載せて、送信の直前に取り除く設計にしていると、
 * 送信経路を1つ増やしたときに取り除き忘れる。
 */
export function unknownProperty(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const key of Object.keys(visit.node)) {
      if (spec.properties.includes(key)) continue;
      findings.push({
        rule: "schema/unknown-property",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema} が知らないプロパティ "${key}" があります`,
        hint:
          "LINE は未知のプロパティを含むメッセージを受け取りません。独自のメタ情報を"
          + "載せているなら、送信の直前に取り除いてください。送信経路が複数あるなら全部です。",
        spec: REFERENCE,
      });
    }
  }
  return findings;
}

/** 必須プロパティの欠落。altText や video の previewUrl はここで挙がる。 */
export function missingRequired(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const key of spec.required) {
      if (key in visit.node && visit.node[key] !== undefined) continue;
      findings.push({
        rule: "schema/missing-required",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema} に必須の "${key}" がありません`,
        hint: hintForRequired(spec.schema, key),
        spec: REFERENCE,
      });
    }
  }
  return findings;
}

function hintForRequired(schema: string, key: string): string {
  if (schema === "FlexMessage" && key === "altText") {
    return "PC 版と通知欄に出る文字です。無いと送信できません。";
  }
  if (schema === "FlexVideo" && key === "previewUrl") {
    return "サムネイル画像の URL です。用意できない動画は送らないか、先頭フレームから生成してください。";
  }
  if (schema === "FlexVideo" && key === "altContent") {
    return "動画に対応していない LINE で代わりに出す画像です。無いとその端末で何も出ません。";
  }
  return `${schema} には ${key} が要ります。無いと LINE がメッセージ全体を拒否します。`;
}

/** type の値が仕様に無い。綴り違いのほか、独自の型を混ぜている場合に出る。 */
export function unknownType(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    if (visit.kind === "message") continue;
    if (visit.type !== undefined && tableFor(visit)) continue;
    findings.push({
      rule: "schema/unknown-type",
      severity: "error",
      path: `${visit.path}.type`,
      message:
        visit.type === undefined
          ? "type がありません"
          : `"${visit.type}" は ${visit.kind} の型として仕様にありません`,
      hint: `使えるのは ${known(visit.kind).join(" / ")} です。`,
      spec: REFERENCE,
    });
  }
  return findings;
}

/** enum に無い値。size に "large" と書くような取り違えを拾う。 */
export function invalidEnum(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const [key, allowed] of Object.entries(spec.enums)) {
      const value = visit.node[key];
      if (typeof value !== "string" || allowed.includes(value)) continue;
      findings.push({
        rule: "schema/invalid-enum",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `"${value}" は ${spec.schema}.${key} に使えません`,
        hint: `使えるのは ${allowed.join(" / ")} です。`,
        spec: REFERENCE,
      });
    }
  }
  return findings;
}
