// How the public entry points behave.

import assert from "node:assert/strict";
import test from "node:test";

import { format, validate } from "../src/index.ts";
import { at, validBubble } from "./fixtures.ts";

/** A message with exactly one error and one warning in it. */
function mixed(): any {
  const message: any = validBubble();
  message.appMeta = { tapLimit: 1 };
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  return message;
}

test("ok answers one question: are there errors", () => {
  const result = validate(mixed());
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.warnings.length, 1);
});

test("warnings alone leave ok true", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).color = "#FFFFFF";
  const result = validate(message);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
});

test("findings is the errors and the warnings together", () => {
  const result = validate(mixed());
  assert.equal(result.findings.length, result.errors.length + result.warnings.length);
});

// --- turning rules off ---

test("a rule can be turned off by name", () => {
  const result = validate(mixed(), { disable: ["schema/unknown-property"] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
});

test("a prefix turns off a whole set", () => {
  // An appearance check is sometimes exactly how something was built, so
  // dropping the set at once is the more useful behaviour.
  const result = validate(mixed(), { disable: ["render"] });
  assert.deepEqual(result.warnings, []);
});

test("what was not turned off stays", () => {
  const result = validate(mixed(), { disable: ["render", "size"] });
  assert.equal(result.errors.length, 1);
});

// --- allowing a property ---

test("a property can be allowed by name", () => {
  // The table is generated from LINE's definition, so something they add
  // first reads as unknown here until it is regenerated. This is the way
  // past it without waiting.
  const result = validate(mixed(), { allowProperties: ["appMeta"] });
  assert.deepEqual(result.errors, []);
});

test("a property that was not allowed stays", () => {
  const message: any = validBubble();
  message.appMeta = {};
  message.otherMeta = {};
  const result = validate(message, { allowProperties: ["appMeta"] });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.path, "$.otherMeta");
});

// --- formatting ---

test("format puts the severity and the place on the first line", () => {
  const [finding] = validate(mixed()).errors;
  const [head] = format(finding!).split("\n");
  assert.match(head!, /^\[error\] \$\.appMeta/);
});

test("format puts the fix on the line after", () => {
  const [finding] = validate(mixed()).errors;
  assert.equal(format(finding!).split("\n").length, 2);
});

test("a finding with no fix is one line", () => {
  assert.equal(format({ rule: "x", severity: "warning", path: "$", message: "y" }).split("\n").length, 1);
});

// --- and it does not fall over on broken input ---

test("nothing throws, whatever shape arrives", () => {
  const broken: unknown[] = [
    undefined,
    null,
    { type: "flex" },
    { type: "flex", contents: null },
    { type: "bubble", body: "a string" },
    { type: "carousel", contents: "not an array" },
    { type: "bubble", body: { type: "box", contents: [null, 1, "x"] } },
  ];
  for (const value of broken) {
    assert.doesNotThrow(() => validate(value), `${JSON.stringify(value)} threw`);
  }
});

test("a cycle comes back as a finding, not an exception", () => {
  // A checker that falls over on its input is worse than a miss: it takes the
  // caller down with it.
  const message: any = validBubble();
  message.contents.body.contents.push(message.contents.body);
  const result = validate(message);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.rule, "schema/not-serializable");
});
