// 大きさの検査。型検査が絶対に届かない領域。

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const size = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** 指定バイト数に届くまで本文を膨らませる。 */
function inflate(message: any, target: number): any {
  const body = at(message, ["contents", "body", "contents"]);
  while (size(message.contents) < target) {
    body.push({ type: "text", text: "あ".repeat(500) });
  }
  return message;
}

test("10KB 以内の bubble は通る", () => {
  assert.deepEqual(validate(validBubble()).findings, []);
});

test("10KB を超えた bubble を error にする", () => {
  const result = validate(inflate(validBubble(), 10 * 1024 + 1));
  const [finding] = result.errors;
  assert.equal(finding?.rule, "size/bubble-too-large");
  assert.equal(result.ok, false);
});

test("超過の指摘に実際の大きさを載せる", () => {
  // 「超えました」だけでは、どれだけ削ればよいか分からない。
  const [finding] = validate(inflate(validBubble(), 11 * 1024)).errors;
  assert.match(finding?.message ?? "", /KB/);
});

test("carousel の上限は 50KB で、bubble の 10KB ではない", () => {
  // 20KB の carousel は通る。bubble の上限で判定していると、ここで誤検出する。
  const message: any = validCarousel();
  const first = message.contents.contents[0];
  while (size(message.contents) < 20 * 1024) {
    first.body.contents.push({ type: "text", text: "あ".repeat(500) });
  }
  assert.deepEqual(validate(message).errors, []);
});

test("50KB を超えた carousel を error にする", () => {
  const message: any = validCarousel();
  const first = message.contents.contents[0];
  while (size(message.contents) < 50 * 1024 + 1) {
    first.body.contents.push({ type: "text", text: "あ".repeat(500) });
  }
  assert.equal(validate(message).errors[0]?.rule, "size/carousel-too-large");
});

test("大きさの指摘には出典を付ける", () => {
  const [finding] = validate(inflate(validBubble(), 11 * 1024)).errors;
  assert.match(finding?.spec ?? "", /^https:\/\//);
});

// --- アクションの data ---

test("300 文字ちょうどの data は通る", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(300);
  assert.deepEqual(validate(message).errors, []);
});

test("301 文字の data を error にする", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(301);
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "action/data-too-long");
  assert.match(finding?.message ?? "", /301/);
});

test("data 超過の直し方を示す", () => {
  // 上限に当たったとき、実体を別の場所から引き直す形にすれば当たらなくなる。
  // それを知らないと、ラベルを削る方向に進んでしまう。
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(400);
  const [finding] = validate(message).errors;
  assert.match(finding?.hint ?? "", /識別子/);
});

test("上限はアクションの種類ごとに仕様表から引く", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0]).action = {
    type: "datetimepicker",
    label: "日付",
    mode: "date",
    data: "x".repeat(301),
  };
  assert.equal(validate(message).errors[0]?.rule, "action/data-too-long");
});
