// 大きさの検査。
//
// ここが型検査では絶対に届かない領域である。JSON にしてバイト数を数える
// まで分からないので、コンパイル時には何も言えない。そして超えたときは
// 送信が失敗する。

import { ACTIONS } from "../spec.ts";
import type { Finding, RuleContext } from "../types.ts";
import { rootKind, walk } from "../walk.ts";

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
 * アクションの data が上限を超えている。
 *
 * 超えると LINE に拒否されるが、**押しても何も起きないという形で現れる**
 * ことがある。動かないのに例外も出ないので、原因に辿り着きにくい。
 *
 * 上限は postback / datetimepicker / richmenuswitch のいずれも 300。
 * 仕様表から読むので、ここに数値を書かない。
 */
export function actionDataTooLong(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    if (visit.kind !== "action" || visit.type === undefined) continue;
    const spec = ACTIONS[visit.type];
    if (!spec) continue;
    for (const [key, limit] of Object.entries(spec.limits)) {
      const value = visit.node[key];
      if (typeof value !== "string" || value.length <= limit) continue;
      findings.push({
        rule: "action/data-too-long",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema}.${key} が ${limit} 文字を超えています (${value.length})`,
        hint:
          "アクションの中身をそのまま載せていませんか。識別子だけを入れて、"
          + "実体は送信ログなど別の場所から引き直す形にすると、上限に当たらなくなります。",
        spec: "https://developers.line.biz/en/reference/messaging-api/#action-objects",
      });
    }
  }
  return findings;
}
