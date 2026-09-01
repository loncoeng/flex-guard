// 構造の検査。ここで挙がるものは LINE が受け取らない。

import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../src/index.ts";
import { at, validBubble, validCarousel } from "./fixtures.ts";

const rules = (message: unknown): string[] => validate(message).findings.map((f) => f.rule);

test("正しい bubble には何も出ない", () => {
  const result = validate(validBubble());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test("正しい carousel には何も出ない", () => {
  assert.deepEqual(validate(validCarousel()).findings, []);
});

test("bubble 単体でも受け取る", () => {
  // 保存してあるのが中身だけ、という作りは珍しくない。
  const result = validate(validBubble().contents);
  assert.deepEqual(result.findings, []);
});

// --- 未知のプロパティ ---

test("未知のプロパティを error にする", () => {
  const message: any = validBubble();
  message.appMeta = { tapLimit: 1 };
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/unknown-property");
  assert.equal(finding?.path, "$.appMeta");
});

test("部品の中の未知プロパティも見つける", () => {
  const message: any = validBubble();
  at(message, ["contents", "body", "contents", 0]).internalId = "abc";
  const [finding] = validate(message).errors;
  assert.equal(finding?.path, "$.contents.body.contents[0].internalId");
});

test("アクションの中の未知プロパティも見つける", () => {
  const message: any = validBubble();
  at(message, ["contents", "footer", "contents", 0, "action"]).expiresAt = 1;
  assert.deepEqual(rules(message), ["schema/unknown-property"]);
});

test("styles や background は部品ではないので潜らない", () => {
  // ここを型で判定すると、これらを未知の部品として誤検出する。
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

// --- 必須プロパティ ---

test("altText が無ければ error", () => {
  const message: any = validBubble();
  delete message.altText;
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/missing-required");
  assert.equal(finding?.path, "$.altText");
});

test("video の previewUrl と altContent の欠落を両方挙げる", () => {
  // 仕様で必須と決まっている。サムネイルを用意できない動画は送れない。
  const message: any = validBubble();
  message.contents.body.contents.push({ type: "video", url: "https://e.example.com/v.mp4" });
  const missing = validate(message)
    .errors.filter((f) => f.rule === "schema/missing-required")
    .map((f) => f.path.split(".").pop());
  assert.deepEqual(missing.sort(), ["altContent", "previewUrl"]);
});

test("必須の指摘には直し方が付く", () => {
  const message: any = validBubble();
  delete message.altText;
  const [finding] = validate(message).errors;
  assert.ok(finding?.hint && finding.hint.length > 0);
});

// --- 型と enum ---

test("知らない type を error にする", () => {
  const message: any = validBubble();
  message.contents.body.contents.push({ type: "textt", text: "綴り違い" });
  const found = validate(message).errors.find((f) => f.rule === "schema/unknown-type");
  assert.ok(found);
  assert.match(found.message, /textt/);
});

test("type が無い部品を error にする", () => {
  const message: any = validBubble();
  message.contents.body.contents.push({ text: "type がない" });
  assert.ok(rules(message).includes("schema/unknown-type"));
});

test("enum に無い値を error にする", () => {
  const message: any = validBubble();
  message.contents.size = "large";
  const [finding] = validate(message).errors;
  assert.equal(finding?.rule, "schema/invalid-enum");
  assert.match(finding?.hint ?? "", /mega/);
});

test("enum に在る値は通す", () => {
  const message: any = validBubble();
  for (const size of ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"]) {
    message.contents.size = size;
    assert.deepEqual(validate(message).findings, [], `size=${size} で指摘が出た`);
  }
});

// --- Flex でないもの ---

test("Flex でないものを渡したら、その旨を返す", () => {
  for (const value of ["こんにちは", 1, null, [], { type: "text", text: "x" }]) {
    const result = validate(value);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]?.rule, "schema/unknown-type");
  }
});
