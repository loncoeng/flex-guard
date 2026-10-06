// The size checks: the territory a type checker cannot reach.

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const size = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

// The filler is deliberately non-ASCII: three bytes a character in UTF-8. It
// is here so that these tests fail if the implementation ever starts counting
// characters instead of bytes.
const FILLER = "あ";

/** Grow the body until it reaches a given number of bytes. */
function inflate(message: any, target: number): any {
  const body = at(message, ["contents", "body", "contents"]);
  while (size(message.contents) < target) {
    body.push({ type: "text", text: FILLER.repeat(500) });
  }
  return message;
}

test("a bubble within 10KB passes", () => {
  assert.deepEqual(validate(validBubble()).findings, []);
});

test("a bubble over 10KB is an error", () => {
  const result = validate(inflate(validBubble(), 10 * 1024 + 1));
  const [finding] = result.errors;
  assert.equal(finding?.rule, "size/bubble-too-large");
  assert.equal(result.ok, false);
});

test("the finding says how big it actually is", () => {
  // "Too big" on its own does not say how much has to come off.
  const [finding] = validate(inflate(validBubble(), 11 * 1024)).errors;
  assert.match(finding?.message ?? "", /KB/);
});

test("a carousel's limit is 50KB, not a bubble's 10KB", () => {
  // A 20KB carousel passes. Checked against the bubble limit, this is where
  // the false positive would show up.
  const message: any = validCarousel();
  const first = message.contents.contents[0];
  while (size(message.contents) < 20 * 1024) {
    first.body.contents.push({ type: "text", text: FILLER.repeat(500) });
  }
  assert.deepEqual(validate(message).errors, []);
});

test("a carousel over 50KB is an error", () => {
  const message: any = validCarousel();
  const first = message.contents.contents[0];
  while (size(message.contents) < 50 * 1024 + 1) {
    first.body.contents.push({ type: "text", text: FILLER.repeat(500) });
  }
  assert.equal(validate(message).errors[0]?.rule, "size/carousel-too-large");
});

test("a size finding cites its source", () => {
  const [finding] = validate(inflate(validBubble(), 11 * 1024)).errors;
  assert.match(finding?.spec ?? "", /^https:\/\//);
});

// --- an action's data ---

test("data at exactly 300 characters passes", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(300);
  assert.deepEqual(validate(message).errors, []);
});

test("data at 301 characters is an error", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(301);
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "size/property-too-long");
  assert.match(finding?.message ?? "", /301/);
});

test("the finding says how to fix an oversized data", () => {
  // Over the limit, carrying an identifier and reading the payload back from
  // elsewhere makes the limit stop mattering. Not knowing that, you go off
  // shortening labels instead.
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).data = "x".repeat(400);
  const [finding] = validate(message).errors;
  assert.match(finding?.hint ?? "", /identifier/);
});

test("an image URL over 2000 characters is an error too", () => {
  // The limits are not only on an action's data. They are read from the spec
  // table, so this one is covered without being written down here.
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url =
    "https://cdn.example.com/" + "a".repeat(2000) + ".png";
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "size/property-too-long");
  assert.match(finding?.message ?? "", /FlexImage\.url/);
});

test("an image URL within 2000 characters passes", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 3]).url =
    "https://cdn.example.com/" + "a".repeat(1900) + ".png";
  assert.deepEqual(validate(message).errors, []);
});

test("the limit comes from the spec table, per action type", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0]).action = {
    type: "datetimepicker",
    label: "Date",
    mode: "date",
    data: "x".repeat(301),
  };
  assert.equal(validate(message).errors[0]?.rule, "size/property-too-long");
});
