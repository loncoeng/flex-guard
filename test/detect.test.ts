// Deciding whether what is about to go out as text is Flex.
//
// Nothing about this accident is an error. The send succeeds and the delivery
// count goes up, and an admin screen's preview usually renders from the
// contents, so it draws correctly there. **From the sending side, everything
// looks fine.**
//
// A false positive is just as much trouble. Call ordinary body text that
// starts with a bracket Flex, and something that should have gone out is
// stopped. Both directions are pinned here.

import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeFlex } from "../src/index.ts";

const isFlex = (text: string): boolean => looksLikeFlex(text).looksLikeFlex;

test("a bubble's JSON is recognised", () => {
  const result = looksLikeFlex('{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[]}}');
  assert.equal(result.looksLikeFlex, true);
  assert.equal(result.containerType, "bubble");
});

test("a carousel's JSON is recognised", () => {
  assert.equal(looksLikeFlex('{"type":"carousel","contents":[]}').containerType, "carousel");
});

test("the array form is recognised", () => {
  // Looking only at whether it starts with { misses this one.
  assert.equal(isFlex('[{"type":"bubble","body":{}}]'), true);
});

test("a whole flex message is recognised", () => {
  const result = looksLikeFlex('{"type":"flex","altText":"x","contents":{"type":"carousel","contents":[]}}');
  assert.equal(result.looksLikeFlex, true);
  assert.equal(result.containerType, "carousel");
});

// --- and the false positives ---

test("ordinary text starting with a bracket is not Flex", () => {
  // Form call tags and bulleted text land here. They must not be stopped.
  for (const text of ["[FORM_1] fill this in", "[important] tomorrow's plan", "[1] yes [2] no"]) {
    assert.equal(isFlex(text), false, `${text} was called Flex`);
  }
});

test("ordinary text starting with a brace is not Flex", () => {
  assert.equal(isFlex("{name}, hello"), false);
});

test("JSON that is not Flex is not Flex", () => {
  for (const text of ['{"type":"text","text":"hello"}', '{"foo":1}', "[1,2,3]", '{"type":"image"}']) {
    assert.equal(isFlex(text), false, `${text} was called Flex`);
  }
});

test("ordinary prose is not Flex", () => {
  for (const text of ["hello", "", "   ", "https://example.com"]) {
    assert.equal(isFlex(text), false);
  }
});

test("surrounding whitespace does not hide it", () => {
  assert.equal(isFlex('\n  {"type":"bubble"}  \n'), true);
});

test("it says what it decided on", () => {
  // Doubting the answer, with no record of what it was read from, leaves
  // nothing to investigate.
  assert.match(looksLikeFlex('{"type":"bubble"}').reason, /bubble/);
  assert.match(looksLikeFlex("[FORM_1]").reason, /JSON/);
  assert.match(looksLikeFlex("hello").reason, /start/);
});
