// The checks on how it looks. All warnings.
//
// Everything here sends successfully. It only looks different on the
// recipient's screen, so the sender never finds out. Which is why ok must not
// become false — and why staying silent is not an option either.

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const warnings = (message: unknown): string[] =>
  validate(message).warnings.map((f) => f.rule);

// --- dark mode ---

test("a near-white text colour is a warning", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.deepEqual(warnings(message), ["render/dark-mode-invisible"]);
});

test("a warning does not make ok false", () => {
  // The send succeeds, so there is no reason to stop it. Fold them in and you
  // create a reason to turn the whole check off to make the warning go away.
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.equal(validate(message).ok, true);
});

test("the three-digit colour form is read too", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#fff";
  assert.deepEqual(warnings(message), ["render/dark-mode-invisible"]);
});

test("a dark text colour says nothing", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#333333";
  assert.deepEqual(warnings(message), []);
});

test("a background colour makes it stay quiet", () => {
  // White text combined with a background colour is a scheme somebody chose.
  const message: any = validBubble();
  at(message, ["contents", "body"]).backgroundColor = "#1B1B1B";
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  assert.deepEqual(warnings(message), []);
});

test("a value that is not a colour does not throw", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "white";
  assert.doesNotThrow(() => validate(message));
});

// --- empty boxes ---

test("an empty box is a warning", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents"]).push({
    type: "box",
    layout: "vertical",
    contents: [],
  });
  assert.deepEqual(warnings(message), ["render/empty-container"]);
});

// --- bubble sizes ---

test("mismatched sizes in a carousel are a warning", () => {
  const message: any = validCarousel();
  message.contents.contents[1].size = "giga";
  assert.deepEqual(warnings(message), ["render/mixed-bubble-size"]);
});

test("an unset size counts as the default, mega", () => {
  // Written on one and not the others is the likeliest shape of this. If the
  // one that is written says mega, they match.
  const message: any = validCarousel();
  for (const bubble of message.contents.contents) delete bubble.size;
  message.contents.contents[0].size = "mega";
  assert.deepEqual(warnings(message), []);
});

test("a single bubble has nothing to compare against", () => {
  const message: any = validBubble();
  message.contents.size = "giga";
  assert.deepEqual(warnings(message), []);
});

// --- URLs ---

test("an http image is a warning", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url = "http://cdn.example.com/a.png";
  assert.deepEqual(warnings(message), ["render/insecure-url"]);
});

test("a data URI passes", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url = "data:image/png;base64,iVBORw0K";
  assert.deepEqual(warnings(message), []);
});

// --- substitution ---

test("something that looks like a placeholder is a warning", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{name}, hello";
  assert.deepEqual(warnings(message), ["variables/unescaped-placeholder"]);
});

test("the double-brace form is caught too", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{{first_name}}, hello";
  assert.deepEqual(warnings(message), ["variables/unescaped-placeholder"]);
});

test("no braces, nothing said", () => {
  assert.deepEqual(warnings(validBubble()), []);
});

test("one place is not reported twice", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).text = "{name}, your birthday is {field:birthday}";
  assert.equal(validate(message).warnings.length, 1);
});
