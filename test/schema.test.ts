// The structural checks. Everything here is something LINE will not accept.

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const rules = (message: unknown): string[] => validate(message).findings.map((f) => f.rule);

test("a valid bubble produces nothing", () => {
  const result = validate(validBubble());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test("a valid carousel produces nothing", () => {
  assert.deepEqual(validate(validCarousel()).findings, []);
});

test("a bare bubble is accepted", () => {
  // Storing only the contents is a common enough way to build this.
  const result = validate(validBubble().contents);
  assert.deepEqual(result.findings, []);
});

// --- properties that are not in the specification ---

test("an unknown property is an error", () => {
  const message: any = validBubble();
  message.appMeta = { tapLimit: 1 };
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/unknown-property");
  assert.equal(finding?.path, "$.appMeta");
});

test("an unknown property inside a component is found", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).internalId = "abc";
  const [finding] = validate(message).errors;
  assert.equal(finding?.path, "$.contents.body.contents[0].internalId");
});

test("an unknown property inside an action is found", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).expiresAt = 1;
  assert.deepEqual(rules(message), ["schema/unknown-property"]);
});

test("styles and background are not components, and are not walked into", () => {
  // Decided by type, these two get reported as unknown components.
  const message: any = validBubble();
  message.contents.styles = { body: { backgroundColor: "#F0F0F0" } };
  message.contents.body.background = {
    type: "linearGradient",
    angle: "0deg",
    startColor: "#000000",
    endColor: "#FFFFFF",
  };
  assert.deepEqual(validate(message).findings, []);
});

// --- required properties ---

test("a missing altText is an error", () => {
  const message: any = validBubble();
  delete message.altText;
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/missing-required");
  assert.equal(finding?.path, "$.altText");
});

test("a video missing previewUrl and altContent reports both", () => {
  // The specification requires them. A video you cannot produce a thumbnail
  // for is a video you cannot send.
  const message: any = validBubble();
  message.contents.body.contents.push({ type: "video", url: "https://e.example.com/v.mp4" });
  const missing = validate(message)
    .errors.filter((f) => f.rule === "schema/missing-required")
    .map((f) => f.path.split(".").pop());
  assert.deepEqual(missing.sort(), ["altContent", "previewUrl"]);
});

test("a required-property finding says how to fix it", () => {
  const message: any = validBubble();
  delete message.altText;
  const [finding] = validate(message).errors;
  assert.ok(finding?.hint && finding.hint.length > 0);
});

// --- types and enums ---

test("a type that is not in the specification is an error", () => {
  const message: any = validBubble();
  message.contents.body.contents.push({ type: "textt", text: "misspelled" });
  const found = validate(message).errors.find((f) => f.rule === "schema/unknown-type");
  assert.ok(found);
  assert.match(found.message, /textt/);
});

test("a component with no type at all is an error", () => {
  const message: any = validBubble();
  message.contents.body.contents.push({ text: "no type here" });
  assert.ok(rules(message).includes("schema/unknown-type"));
});

test("a value outside an enum is an error", () => {
  const message: any = validBubble();
  message.contents.size = "large";
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/invalid-enum");
  assert.match(finding?.hint ?? "", /mega/);
});

test("every value in the enum passes", () => {
  const message: any = validBubble();
  for (const size of ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"]) {
    message.contents.size = size;
    assert.deepEqual(validate(message).findings, [], `size=${size} produced a finding`);
  }
});

// --- things that are not Flex at all ---

test("something that is not Flex is reported as such", () => {
  for (const value of ["hello", 1, null, [], { type: "text", text: "x" }]) {
    const result = validate(value);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]?.rule, "schema/unknown-type");
  }
});
