// テキストとして送ろうとしているものが Flex でないか、の判定。
//
// この事故はエラーにならない。送信は成功し、配信数も増える。管理画面の
// プレビューは中身を見て描いていることが多いので、そちらでは正しく絵で
// 出る。**送った側から見て、すべて正常に見える。**
//
// 誤検出も同じくらい困る。角括弧で始まる普通の本文を Flex だと言い出すと、
// 送れるはずのものが止まる。両方向を固定しておく。

import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeFlex } from "../src/index.ts";

const isFlex = (text: string): boolean => looksLikeFlex(text).looksLikeFlex;

test("bubble の JSON を見つける", () => {
  const result = looksLikeFlex('{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[]}}');
  assert.equal(result.looksLikeFlex, true);
  assert.equal(result.containerType, "bubble");
});

test("carousel の JSON を見つける", () => {
  assert.equal(looksLikeFlex('{"type":"carousel","contents":[]}').containerType, "carousel");
});

test("配列で始まる形も見る", () => {
  // 先頭が { かどうかだけで判定すると、ここを取りこぼす。
  assert.equal(isFlex('[{"type":"bubble","body":{}}]'), true);
});

test("flex メッセージが丸ごと入っている形も見る", () => {
  const result = looksLikeFlex('{"type":"flex","altText":"x","contents":{"type":"carousel","contents":[]}}');
  assert.equal(result.looksLikeFlex, true);
  assert.equal(result.containerType, "carousel");
});

// --- 誤検出しないこと ---

test("角括弧で始まる普通の本文を Flex と言わない", () => {
  // 呼び出しタグや箇条書きの本文がここに落ちる。止めてはいけない。
  for (const text of ["[FORM_1] からご回答ください", "[重要] 明日の予定", "[1] はい [2] いいえ"]) {
    assert.equal(isFlex(text), false, `${text} を Flex と判定した`);
  }
});

test("波括弧で始まる普通の本文を Flex と言わない", () => {
  assert.equal(isFlex("{name} さん、こんにちは"), false);
});

test("Flex でない JSON を Flex と言わない", () => {
  for (const text of ['{"type":"text","text":"hello"}', '{"foo":1}', "[1,2,3]", '{"type":"image"}']) {
    assert.equal(isFlex(text), false, `${text} を Flex と判定した`);
  }
});

test("普通の文章を Flex と言わない", () => {
  for (const text of ["こんにちは", "", "   ", "https://example.com"]) {
    assert.equal(isFlex(text), false);
  }
});

test("前後に空白があっても見つける", () => {
  assert.equal(isFlex('\n  {"type":"bubble"}  \n'), true);
});

test("判定した理由を返す", () => {
  // 判定を疑うときに、何を見てそう言ったのかが分からないと調べようがない。
  assert.match(looksLikeFlex('{"type":"bubble"}').reason, /bubble/);
  assert.match(looksLikeFlex("[FORM_1]").reason, /JSON/);
  assert.match(looksLikeFlex("こんにちは").reason, /開始文字/);
});
