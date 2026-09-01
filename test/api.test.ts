// 公開している入口の振る舞い。

import assert from "node:assert/strict";
import test from "node:test";

import { format, validate } from "../src/index.ts";
import { at, validBubble } from "./fixtures.ts";

/** error と warning を 1 件ずつ持つメッセージ。 */
function mixed(): any {
  const message: any = validBubble();
  message.appMeta = { tapLimit: 1 };
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  return message;
}

test("ok は error の有無だけを見る", () => {
  const result = validate(mixed());
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.warnings.length, 1);
});

test("warning だけなら ok は true", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  const result = validate(message);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
});

test("findings は error と warning の合計", () => {
  const result = validate(mixed());
  assert.equal(result.findings.length, result.errors.length + result.warnings.length);
});

// --- 無効化 ---

test("ルールを名前で無効にできる", () => {
  const result = validate(mixed(), { disable: ["schema/unknown-property"] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
});

test("前方一致でまとめて無効にできる", () => {
  // 見え方の検査は「そう作ってある」ことがあるので、まとめて外せる方がよい。
  const result = validate(mixed(), { disable: ["render"] });
  assert.deepEqual(result.warnings, []);
});

test("無効にしていないものは残る", () => {
  const result = validate(mixed(), { disable: ["render", "size"] });
  assert.equal(result.errors.length, 1);
});

// --- プロパティの許可 ---

test("プロパティを名指しで許可できる", () => {
  // 表は LINE の定義から生成しているので、LINE が先に増やすと一時的に
  // 未知と出る。再生成を待たずに進めるための逃げ道。
  const result = validate(mixed(), { allowProperties: ["appMeta"] });
  assert.deepEqual(result.errors, []);
});

test("許可していないプロパティは残る", () => {
  const message: any = validBubble();
  message.appMeta = {};
  message.otherMeta = {};
  const result = validate(message, { allowProperties: ["appMeta"] });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.path, "$.otherMeta");
});

// --- 表示 ---

test("format は 1 行目に severity と場所を出す", () => {
  const [finding] = validate(mixed()).errors;
  const [head] = format(finding!).split("\n");
  assert.match(head!, /^\[error\] \$\.appMeta/);
});

test("format は直し方を続けて出す", () => {
  const [finding] = validate(mixed()).errors;
  assert.equal(format(finding!).split("\n").length, 2);
});

test("直し方が無い指摘は 1 行で出す", () => {
  assert.equal(format({ rule: "x", severity: "warning", path: "$", message: "y" }).split("\n").length, 1);
});

// --- 壊れた入力で落ちないこと ---

test("想定外の形でも例外を投げない", () => {
  const broken: unknown[] = [
    undefined,
    null,
    { type: "flex" },
    { type: "flex", contents: null },
    { type: "bubble", body: "文字列" },
    { type: "carousel", contents: "配列ではない" },
    { type: "bubble", body: { type: "box", contents: [null, 1, "x"] } },
  ];
  for (const value of broken) {
    assert.doesNotThrow(() => validate(value), `${JSON.stringify(value)} で落ちた`);
  }
});

test("循環参照は例外ではなく指摘として返す", () => {
  // 検査器が入力で落ちるのは、見逃すより悪い。呼んだ側が道連れになる。
  const message: any = validBubble();
  message.contents.body.contents.push(message.contents.body);
  const result = validate(message);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.rule, "schema/not-serializable");
});
