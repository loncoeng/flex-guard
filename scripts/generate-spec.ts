// Generate src/spec.ts from LINE's own OpenAPI definition.
//
// Copying the table of permitted properties out by hand gets something wrong
// somewhere, every time. And the most dangerous thing this library can do is
// report an unknown property that is not one: stop a valid message with
// "you cannot send this" and nobody trusts the check again. So the table is
// not written by a person. It is derived mechanically from the definition
// LINE publishes.
//
//   npm run spec:generate
//
// The source is messaging-api.yml in line/line-openapi. The date and the
// sha256 go at the top of what is generated, so which version of the
// definition it came from is readable from the output.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { load } from "js-yaml";

const SOURCE = "https://raw.githubusercontent.com/line/line-openapi/main/messaging-api.yml";

// What to generate: everything under these two discriminators.
const ROOTS = ["FlexComponent", "Action"] as const;

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  enum?: string[];
  maxLength?: number;
  maxItems?: number;
  description?: string;
  discriminator?: { propertyName: string; mapping: Record<string, string> };
  $ref?: string;
}

/**
 * Some limits are only stated in the prose.
 *
 * An image's url, for instance, has no `maxLength`; its description reads
 * "Image URL (Max character limit: 2000)". Reading only the machine-readable
 * fields misses it, and adding it by hand **defeats the point of generating
 * the table at all**. This picks it up while the source is still LINE's own
 * definition.
 */
function limitFromDescription(text: string | undefined): number | undefined {
  const match = /Max character limit:\s*([0-9]+)/i.exec(text ?? "");
  return match ? Number(match[1]) : undefined;
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
 * Follow allOf to collect what a type actually accepts.
 *
 * OpenAPI's allOf is being used as inheritance here. For FlexText the answer
 * is FlexComponent's type plus its own properties.
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
      const described = limitFromDescription(value.description);
      if (typeof value.maxLength === "number") spec.limits[key] = value.maxLength;
      else if (described !== undefined) spec.limits[key] = described;
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
  if (!mapping) throw new Error(`${root} has no discriminator`);
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
  if (!response.ok) throw new Error(`could not fetch the definition: ${response.status}`);
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
    "// Generated. Do not edit by hand.",
    "//",
    "//   npm run spec:generate",
    "//",
    `// Source    ${SOURCE}`,
    `// Retrieved ${new Date().toISOString().slice(0, 10)}`,
    `// sha256    ${digest}`,
    "//",
    "// The property names in this table come from LINE's own definition.",
    "// Nothing was copied by hand, so no misspelling of one can cause a",
    "// false positive.",
    "",
    "export interface TypeSpec {",
    "  /** The schema name in the OpenAPI document, carried so a finding can cite it */",
    "  schema: string;",
    "  properties: readonly string[];",
    "  required: readonly string[];",
    "  /** maxLength and maxItems, for the ones the specification states */",
    "  limits: Readonly<Record<string, number>>;",
    "  enums: Readonly<Record<string, readonly string[]>>;",
    "}",
    "",
  ].join("\n");

  const parts = [
    header,
    `/** The Flex message itself: altText and contents */`,
    `export const FLEX_MESSAGE: TypeSpec = ${JSON.stringify(message, null, 2)};`,
    "",
    `/** bubble and carousel */`,
    render("FLEX_CONTAINERS", containers),
    `/** box, text, image, video and the rest */`,
    render("FLEX_COMPONENTS", components),
    `/** postback, uri, message and the rest */`,
    render("ACTIONS", actions),
  ];

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, "..", "src", "spec.ts");
  writeFileSync(target, parts.join("\n"), "utf8");

  const count = (t: Record<string, TypeSpec>) => Object.keys(t).length;
  console.log(`  wrote src/spec.ts`);
  console.log(`    ${count(containers)} containers, ${count(components)} components, ${count(actions)} actions`);
  console.log(`    sha256 ${digest.slice(0, 16)}...`);
}

await main();
