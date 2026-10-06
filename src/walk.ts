// Walking the tree of a Flex message.
//
// Where the children are is written out per type. "Descend into anything with
// a type" would be shorter, and it would also treat objects that are not
// components — styles, background — as though they were, and start claiming
// that valid JSON contains unknown types. A false positive costs more than a
// miss, so what gets walked is stated explicitly.

import { FLEX_COMPONENTS, FLEX_CONTAINERS } from "./spec.ts";

export type NodeKind = "message" | "container" | "component" | "action";

export interface Visit {
  kind: NodeKind;
  node: Record<string, unknown>;
  /** In the form $.contents.body.contents[2] */
  path: string;
  /** The value of node.type, or undefined if it is not a string */
  type: string | undefined;
}

/** For each type, the properties children live in. Anything not here is not walked. */
const COMPONENT_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  bubble: ["header", "hero", "body", "footer"],
  box: ["contents"],
  // text.contents is an array of spans, and a span checks against the same
  // table as any other component.
  text: ["contents"],
};

/** carousel is the only type with containers as children. */
const CONTAINER_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  carousel: ["contents"],
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const typeOf = (node: Record<string, unknown>): string | undefined =>
  typeof node["type"] === "string" ? node["type"] : undefined;

/**
 * Work out what was handed in.
 *
 * Sometimes it is `{type:"flex", altText, contents}`, and sometimes it is just
 * the bubble from inside one. Accepting either is the more useful behaviour.
 */
export function rootKind(value: unknown): NodeKind | undefined {
  if (!isObject(value)) return undefined;
  const type = typeOf(value);
  if (type === "flex") return "message";
  if (type !== undefined && type in FLEX_CONTAINERS) return "container";
  return undefined;
}

/**
 * Walk the tree depth-first, yielding in visit order.
 *
 * An object is never walked twice. Putting the same object in two places
 * while building a message stops it being a tree, and a plain recursion into
 * one never comes back.
 */
export function* walk(root: unknown): Generator<Visit> {
  const kind = rootKind(root);
  if (kind === undefined || !isObject(root)) return;
  const seen = new WeakSet<object>();

  if (kind === "message") {
    yield { kind: "message", node: root, path: "$", type: typeOf(root) };
    seen.add(root);
    const contents = root["contents"];
    if (isObject(contents)) yield* visit(contents, "$.contents", "container", seen);
    return;
  }
  yield* visit(root, "$", "container", seen);
}

function* visit(
  node: Record<string, unknown>,
  path: string,
  kind: Exclude<NodeKind, "message">,
  seen: WeakSet<object>,
): Generator<Visit> {
  if (seen.has(node)) return;
  seen.add(node);
  const type = typeOf(node);
  yield { kind, node, path, type };

  // An action can hang off any component, so it is picked up by key rather
  // than by type.
  const action = node["action"];
  if (isObject(action)) {
    yield* visit(action, `${path}.action`, "action", seen);
  }
  if (kind === "action" || type === undefined) return;

  for (const key of CONTAINER_CHILDREN[type] ?? []) {
    yield* children(node[key], `${path}.${key}`, "container", seen);
  }
  for (const key of COMPONENT_CHILDREN[type] ?? []) {
    yield* children(node[key], `${path}.${key}`, "component", seen);
  }
}

function* children(
  value: unknown,
  path: string,
  kind: Exclude<NodeKind, "message" | "action">,
  seen: WeakSet<object>,
): Generator<Visit> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (isObject(item)) yield* visit(item, `${path}[${index}]`, kind, seen);
    }
    return;
  }
  if (isObject(value)) yield* visit(value, path, kind, seen);
}

/** The spec table for a visit, or undefined for a type that is not in one. */
export function specFor(visit: Visit) {
  if (visit.type === undefined) return undefined;
  if (visit.kind === "container") return FLEX_CONTAINERS[visit.type];
  if (visit.kind === "component") return FLEX_COMPONENTS[visit.type];
  return undefined;
}
