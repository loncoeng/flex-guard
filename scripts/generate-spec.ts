// src/spec.ts を LINE 公式の OpenAPI 定義から生成する。
//
// 許可プロパティの表を手で書き写すと、必ずどこかで間違える。そして
// このライブラリで一番危ないのは、未知プロパティの誤検出である。正しい
// メッセージを「送れません」と止めてしまうと、検査そのものが信用されなく
// なる。だから表は人間が書かず、LINE 自身が公開している定義から機械的に
// 起こす。
//
//   npm run spec:generate
//
// 取得元は line/line-openapi の messaging-api.yml。生成物の先頭に取得日と
// sha256 を書き込むので、いつ時点の定義かは生成物を見れば分かる。

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { load } from "js-yaml";

const SOURCE = "https://raw.githubusercontent.com/line/line-openapi/main/messaging-api.yml";

// 生成対象。この2つの discriminator の配下がすべて要る。
const ROOTS = ["FlexComponent", "Action"] as const;

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  enum?: string[];
  maxLength?: number;
  maxItems?: number;
  discriminator?: { propertyName: string; mapping: Record<string, string> };
  $ref?: string;
}

interface Document {
  components: { schemas: Record<string, Schema> };
}

interface TypeSpec {
  schema: string;
  properties: string[];
  required: string[];
  limits: Record<string, number>;
  enums: Record<string, string[]>;
}

const refName = (ref: string): string => ref.replace("#/components/schemas/", "");

/**
 * allOf を辿って、その型が実際に受け付けるプロパティを集める。
 *
 * OpenAPI の allOf は継承として使われている。FlexText なら
 * FlexComponent の type と自分の properties の和が答えになる。
 */
function collect(schemas: Record<string, Schema>, name: string, seen = new Set<string>()): TypeSpec {
  const spec: TypeSpec = { schema: name, properties: [], required: [], limits: {}, enums: {} };
  if (seen.has(name)) return spec;
  seen.add(name);

  const merge = (node: Schema | undefined): void => {
    if (!node) return;
    if (node.$ref) {
      const parent = collect(schemas, refName(node.$ref), seen);
      spec.properties.push(...parent.properties);
      spec.required.push(...parent.required);
      Object.assign(spec.limits, parent.limits);
      Object.assign(spec.enums, parent.enums);
      return;
    }
    for (const part of node.allOf ?? []) merge(part);
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      spec.properties.push(key);
      if (typeof value.maxLength === "number") spec.limits[key] = value.maxLength;
      if (typeof value.maxItems === "number") spec.limits[key] = value.maxItems;
      if (Array.isArray(value.enum)) spec.enums[key] = value.enum;
    }
    spec.required.push(...(node.required ?? []));
  };

  merge(schemas[name]);
  spec.properties = [...new Set(spec.properties)].sort();
  spec.required = [...new Set(spec.required)].sort();
  return spec;
}

function build(schemas: Record<string, Schema>, root: string): Record<string, TypeSpec> {
  const mapping = schemas[root]?.discriminator?.mapping;
  if (!mapping) throw new Error(`${root} に discriminator がありません`);
  const out: Record<string, TypeSpec> = {};
  for (const [typeValue, ref] of Object.entries(mapping)) {
    out[typeValue] = collect(schemas, refName(ref));
  }
  return out;
}

function render(name: string, table: Record<string, TypeSpec>): string {
  const body = Object.entries(table)
    .map(([type, spec]) => {
      const lines = [
        `  ${JSON.stringify(type)}: {`,
        `    schema: ${JSON.stringify(spec.schema)},`,
        `    properties: ${JSON.stringify(spec.properties)},`,
        `    required: ${JSON.stringify(spec.required)},`,
        `    limits: ${JSON.stringify(spec.limits)},`,
        `    enums: ${JSON.stringify(spec.enums)},`,
        `  },`,
      ];
      return lines.join("\n");
    })
    .join("\n");
  return `export const ${name}: Readonly<Record<string, TypeSpec>> = {\n${body}\n};\n`;
}

async function main(): Promise<void> {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`取得に失敗しました: ${response.status}`);
  const text = await response.text();
  const digest = createHash("sha256").update(text).digest("hex");
  const document = load(text) as Document;
  const schemas = document.components.schemas;

  const containers = {
    bubble: collect(schemas, "FlexBubble"),
    carousel: collect(schemas, "FlexCarousel"),
  };
  const components = build(schemas, ROOTS[0]);
  const actions = build(schemas, ROOTS[1]);
  const message = collect(schemas, "FlexMessage");

  const header = [
    "// 自動生成。手で編集しないこと。",
    "//",
    "//   npm run spec:generate",
    "//",
    `// 出典   ${SOURCE}`,
    `// 取得日 ${new Date().toISOString().slice(0, 10)}`,
    `// sha256 ${digest}`,
    "//",
    "// この表にあるプロパティ名は LINE 自身の定義から起こしている。手で",
    "// 書き写していないので、綴り違いによる誤検出は起きない。",
    "",
    "export interface TypeSpec {",
    "  /** OpenAPI 上のスキーマ名。指摘の根拠を示すために持つ */",
    "  schema: string;",
    "  properties: readonly string[];",
    "  required: readonly string[];",
    "  /** maxLength / maxItems。仕様に書かれているものだけ */",
    "  limits: Readonly<Record<string, number>>;",
    "  enums: Readonly<Record<string, readonly string[]>>;",
    "}",
    "",
  ].join("\n");

  const parts = [
    header,
    `/** Flex メッセージ本体 (altText と contents) */`,
    `export const FLEX_MESSAGE: TypeSpec = ${JSON.stringify(message, null, 2)};`,
    "",
    `/** bubble と carousel */`,
    render("FLEX_CONTAINERS", containers),
    `/** box / text / image / video など */`,
    render("FLEX_COMPONENTS", components),
    `/** postback / uri / message など */`,
    render("ACTIONS", actions),
  ];

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, "..", "src", "spec.ts");
  writeFileSync(target, parts.join("\n"), "utf8");

  const count = (t: Record<string, TypeSpec>) => Object.keys(t).length;
  console.log(`  src/spec.ts を生成しました`);
  console.log(`    コンテナ ${count(containers)} / コンポーネント ${count(components)} / アクション ${count(actions)}`);
  console.log(`    sha256 ${digest.slice(0, 16)}...`);
}

await main();
