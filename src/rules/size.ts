// 大きさの検査。
//
// ここが型検査では絶対に届かない領域である。JSON にしてバイト数を数える
// まで分からないので、コンパイル時には何も言えない。そして超えたときは
// 送信が失敗する。

import { ACTIONS } from "../spec.ts";
import type { Finding, RuleContext } from "../types.ts";
import { rootKind, specFor, walk } from "../walk.ts";

// 出典: LINE Engineering "Introducing Flex Message"
// https://engineering.linecorp.com/en/blog/introducing-flex-message-a-new-message-type-for-line-messaging-api/
const BUBBLE_MAX_BYTES = 10 * 1024;
const CAROUSEL_MAX_BYTES = 50 * 1024;
const SIZE_REFERENCE =
  "https://engineering.linecorp.com/en/blog/introducing-flex-message-a-new-message-type-for-line-messaging-api/";

// TextEncoder を使うのは、Node とブラウザの両方で動かすため。Buffer は
// Node にしかない。上限はバイト数で決まっており、日本語は 1 文字 3 バイト
// なので、文字数で数えると 3 倍近くずれる。
const encoder = new TextEncoder();
const bytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value) ?? "").length;

const kb = (n: number): string => `${(n / 1024).toFixed(1)}KB`;

/**
 * bubble は 10KB、carousel は 50KB まで。
 *
 * 画像を data URI で埋めたり、長い本文を入れたときに超える。日本語は
 * 1文字 3 バイトなので、見た目の文字数より早く上限に届く。
 */
export function containerTooLarge(context: RuleContext): Finding[] {
  const message = context.message as Record<string, unknown> | null;
  const container =
    rootKind(message) === "message" && message ? message["contents"] : message;
  if (typeof container !== "object" || container === null) return [];

  const type = (container as Record<string, unknown>)["type"];
  const limit = type === "carousel" ? CAROUSEL_MAX_BYTES : BUBBLE_MAX_BYTES;
  const actual = bytes(container);
  if (actual <= limit) return [];

  return [
    {
      rule: type === "carousel" ? "size/carousel-too-large" : "size/bubble-too-large",
      severity: "error",
      path: "$.contents",
      message: `${String(type)} が ${kb(limit)} を超えています (${kb(actual)})`,
      hint:
        "画像を data URI で埋め込んでいませんか。URL にすると大きく減ります。"
        + " 日本語は 1 文字 3 バイトなので、本文の長さも見た目より効きます。",
      spec: SIZE_REFERENCE,
    },
  ];
}

/**
 * 仕様に上限のある項目が、その上限を超えている。
 *
 * 対象はアクションの `data` だけではない。画像の `url` にも 2000 文字の
 * 上限がある。どこに上限があるかは仕様表から引くので、ここに数値を書か
 * ない。**書けば LINE 側が変えたときに嘘になる。**
 *
 * 超えたときの現れ方が悪い。`data` の場合は押しても何も起きないという
 * 形になり、例外もログも出ない。
 */
export function propertyTooLong(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = specFor(visit)
      ?? (visit.kind === "action" && visit.type !== undefined ? ACTIONS[visit.type] : undefined);
    if (!spec) continue;

    for (const [key, limit] of Object.entries(spec.limits)) {
      const value = visit.node[key];
      if (typeof value !== "string" || value.length <= limit) continue;
      findings.push({
        rule: "size/property-too-long",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema}.${key} が ${limit} 文字を超えています (${value.length})`,
        hint: hintFor(spec.schema, key),
        spec: "https://github.com/line/line-openapi/blob/main/messaging-api.yml",
      });
    }
  }
  return findings;
}

function hintFor(schema: string, key: string): string {
  if (key === "data") {
    return "アクションの中身をそのまま載せていませんか。識別子だけを入れて、"
      + "実体は送信ログなど別の場所から引き直す形にすると、上限に当たらなくなります。";
  }
  if (key === "url") {
    return "署名つきの URL やクエリを大量に付けていませんか。短縮するか、中継する経路を用意してください。";
  }
  return `${schema}.${key} は ${key} の上限を超えると LINE に拒否されます。`;
}
