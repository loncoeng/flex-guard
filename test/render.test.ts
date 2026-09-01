// 見え方の検査。すべて warning。
//
// ここで挙がるものは送信に成功する。相手の画面で違って見えるだけなので、
// 送った側からは分からない。だから ok を false にしてはいけないし、
// 逆に黙っていてもいけない。

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const warnings = (message: unknown): string[] =>
  validate(message).warnings.map((f) => f.rule);

// --- ダークモード ---

test("白に近い文字色を warning にする", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.deepEqual(warnings(message), ["render/dark-mode-invisible"]);
});

test("warning は ok を false にしない", () => {
  // 送信は成功するので、止める理由がない。ここを混ぜると、警告を消すために
  // 検査ごと切る動機が生まれる。
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.equal(validate(message).ok, true);
});

test("3桁の色指定も見る", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#fff";
  assert.deepEqual(warnings(message), ["render/dark-mode-invisible"]);
});

test("暗い文字色には何も言わない", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#333333";
  assert.deepEqual(warnings(message), []);
});

test("背景色を指定してあれば黙る", () => {
  // 白文字と背景色を組み合わせているなら、それは意図した配色である。
  const message: any = validBubble();
  at(message, ["contents", "body"]).backgroundColor = "#1B1B1B";
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.deepEqual(warnings(message), []);
});

test("色として読めない値では落ちない", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "white";
  assert.doesNotThrow(() => validate(message));
});

// --- 空の箱 ---

test("空の box を warning にする", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents"]).push({
    type: "box",
    layout: "vertical",
    contents: [],
  });
  assert.deepEqual(warnings(message), ["render/empty-container"]);
});

// --- bubble の大きさ ---

test("carousel 内で size が揃っていなければ warning", () => {
  const message: any = validCarousel();
  message.contents.contents[1].size = "giga";
  assert.deepEqual(warnings(message), ["render/mixed-bubble-size"]);
});

test("size 未指定は既定の mega として扱う", () => {
  // 片方だけ書いてある形が一番起きやすい。書いてある方が mega なら揃っている。
  const message: any = validCarousel();
  for (const bubble of message.contents.contents) delete bubble.size;
  message.contents.contents[0].size = "mega";
  assert.deepEqual(warnings(message), []);
});

test("bubble が 1 枚なら比べない", () => {
  const message: any = validBubble();
  message.contents.size = "giga";
  assert.deepEqual(warnings(message), []);
});

// --- URL ---

test("http の画像を warning にする", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url = "http://cdn.example.com/a.png";
  assert.deepEqual(warnings(message), ["render/insecure-url"]);
});

test("data URI は通す", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url = "data:image/png;base64,iVBORw0K";
  assert.deepEqual(warnings(message), []);
});

// --- 差し込み ---

test("差し込みらしき記述を warning にする", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{name}さん、こんにちは";
  assert.deepEqual(warnings(message), ["variables/unescaped-placeholder"]);
});

test("二重波括弧の書き方も拾う", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{{first_name}} さん";
  assert.deepEqual(warnings(message), ["variables/unescaped-placeholder"]);
});

test("波括弧が無ければ何も言わない", () => {
  assert.deepEqual(warnings(validBubble()), []);
});

test("同じ場所を二重に挙げない", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{name}さん {field:誕生日} です";
  assert.equal(validate(message).warnings.length, 1);
});
