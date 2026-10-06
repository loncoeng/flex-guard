// The size checks.
//
// This is the territory a type checker cannot reach at all. Nothing is known
// until the thing is serialized and the bytes are counted, so at compile time
// there is nothing to say. And over the limit, the send fails.

import { ACTIONS } from "../spec.ts";
import type { Finding, RuleContext } from "../types.ts";
import { rootKind, specFor, walk } from "../walk.ts";

// Source: LINE Engineering, "Introducing Flex Message"
// https://engineering.linecorp.com/en/blog/introducing-flex-message-a-new-message-type-for-line-messaging-api/
const BUBBLE_MAX_BYTES = 10 * 1024;
const CAROUSEL_MAX_BYTES = 50 * 1024;
const SIZE_REFERENCE =
  "https://engineering.linecorp.com/en/blog/introducing-flex-message-a-new-message-type-for-line-messaging-api/";

// TextEncoder rather than Buffer, so this runs in a browser as well as in
// Node. The limit is in bytes, and non-ASCII text is three bytes a character
// in UTF-8 — counting characters is out by nearly a factor of three.
const encoder = new TextEncoder();
const bytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value) ?? "").length;

const kb = (n: number): string => `${(n / 1024).toFixed(1)}KB`;

/**
 * A bubble may be 10KB and a carousel 50KB.
 *
 * What takes you over is an image embedded as a data URI, or a long body of
 * text. Non-ASCII text is three bytes a character, so it reaches the limit
 * well before it looks like it should.
 */
export function containerTooLarge(context: RuleContext): Finding[] {
  const message = context.message as Record<string, unknown> | null;
  const container =
    rootKind(message) === "message" && message ? message["contents"] : message;
  if (typeof container !== "object" || container === null) return [];

  const type = (container as Record<string, unknown>)["type"];
  const limit = type === "carousel" ? CAROUSEL_MAX_BYTES : BUBBLE_MAX_BYTES;
  const actual = bytes(container);
  if (actual <= limit) return [];

  return [
    {
      rule: type === "carousel" ? "size/carousel-too-large" : "size/bubble-too-large",
      severity: "error",
      path: "$.contents",
      message: `${String(type)} exceeds ${kb(limit)} (${kb(actual)})`,
      hint:
        "Are you embedding an image as a data URI? A URL instead takes most of it off."
        + " Non-ASCII text is three bytes a character, so the body counts for more than it looks like.",
      spec: SIZE_REFERENCE,
    },
  ];
}

/**
 * A property with a limit in the specification, over that limit.
 *
 * Not only an action's `data`: an image's `url` has a 2000-character limit
 * too. Where the limits are is read from the spec table, so no number is
 * written here. **Written here, it becomes a lie the moment LINE changes it.**
 *
 * How this shows up is the bad part. For `data`, it takes the form of a
 * button that does nothing when tapped. No exception, nothing in a log.
 */
export function propertyTooLong(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = specFor(visit)
      ?? (visit.kind === "action" && visit.type !== undefined ? ACTIONS[visit.type] : undefined);
    if (!spec) continue;

    for (const [key, limit] of Object.entries(spec.limits)) {
      const value = visit.node[key];
      if (typeof value !== "string" || value.length <= limit) continue;
      findings.push({
        rule: "size/property-too-long",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema}.${key} exceeds ${limit} characters (${value.length})`,
        hint: hintFor(spec.schema, key),
        spec: "https://github.com/line/line-openapi/blob/main/messaging-api.yml",
      });
    }
  }
  return findings;
}

function hintFor(schema: string, key: string): string {
  if (key === "data") {
    return "Are you putting the action itself in here? Carry an identifier and read the"
      + " payload back from somewhere else, and the limit stops mattering.";
  }
  if (key === "url") {
    return "A signed URL, or a lot of query string? Shorten it, or put something in front of it to redirect.";
  }
  return `${schema}.${key} over its limit is refused by LINE.`;
}
