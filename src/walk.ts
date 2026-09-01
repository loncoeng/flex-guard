// Flex メッセージの木を辿る。
//
// 子を持つ場所を型ごとに明示している。「type を持つオブジェクトなら全部
// 潜る」という書き方の方が短いが、それだと styles や background のような
// 「部品ではないオブジェクト」まで部品として扱ってしまい、正しい JSON に
// 対して未知の型だと言い出す。誤検出は見逃しより高くつくので、辿る場所は
// 明示する。

import { FLEX_COMPONENTS, FLEX_CONTAINERS } from "./spec.ts";

export type NodeKind = "message" | "container" | "component" | "action";

export interface Visit {
  kind: NodeKind;
  node: Record<string, unknown>;
  /** $.contents.body.contents[2] の形 */
  path: string;
  /** node.type の値。文字列でなければ undefined */
  type: string | undefined;
}

/** その型が持つ「部品が入るプロパティ」。ここに無いものは辿らない。 */
const COMPONENT_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  bubble: ["header", "hero", "body", "footer"],
  box: ["contents"],
  // text.contents は span の配列。span も部品として同じ表で検査できる。
  text: ["contents"],
};

/** carousel だけが container を子に持つ。 */
const CONTAINER_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  carousel: ["contents"],
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const typeOf = (node: Record<string, unknown>): string | undefined =>
  typeof node["type"] === "string" ? node["type"] : undefined;

/**
 * 入口の種類を判定する。
 *
 * `{type:"flex", altText, contents}` を渡されることもあれば、中身の
 * bubble だけを渡されることもある。どちらでも検査できる方が使いやすい。
 */
export function rootKind(value: unknown): NodeKind | undefined {
  if (!isObject(value)) return undefined;
  const type = typeOf(value);
  if (type === "flex") return "message";
  if (type !== undefined && type in FLEX_CONTAINERS) return "container";
  return undefined;
}

/**
 * 木を深さ優先で辿る。訪れた順に返す。
 *
 * 一度見たオブジェクトは辿り直さない。組み立ての途中で同じオブジェクトを
 * 2 か所に入れると木ではなくなり、素直に再帰すると戻ってこられなくなる。
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

  // action はどの部品にも付きうるので、型ではなくキーで拾う。
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

/** その訪問に対応する仕様表を返す。未知の型なら undefined。 */
export function specFor(visit: Visit) {
  if (visit.type === undefined) return undefined;
  if (visit.kind === "container") return FLEX_CONTAINERS[visit.type];
  if (visit.kind === "component") return FLEX_COMPONENTS[visit.type];
  return undefined;
}
