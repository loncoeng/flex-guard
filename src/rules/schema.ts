// The structural checks. All of them are errors.
//
// Everything here makes the LINE API answer 400. The send itself fails, so
// there is no option of leaving it alone.

import { ACTIONS, FLEX_COMPONENTS, FLEX_CONTAINERS, FLEX_MESSAGE, type TypeSpec } from "../spec.ts";
import type { Finding, RuleContext } from "../types.ts";
import { specFor, walk, type Visit } from "../walk.ts";

const REFERENCE = "https://developers.line.biz/en/reference/messaging-api/#flex-message";

function tableFor(visit: Visit): TypeSpec | undefined {
  if (visit.kind === "message") return FLEX_MESSAGE;
  if (visit.kind === "action") return visit.type === undefined ? undefined : ACTIONS[visit.type];
  return specFor(visit);
}

function known(kind: Visit["kind"]): readonly string[] {
  if (kind === "container") return Object.keys(FLEX_CONTAINERS);
  if (kind === "component") return Object.keys(FLEX_COMPONENTS);
  if (kind === "action") return Object.keys(ACTIONS);
  return ["flex"];
}

/**
 * A property that is not in the specification.
 *
 * The LINE API refuses the whole message over a key it does not know. Usually
 * this happens because the JSON is carrying metadata of your own: a tap count
 * or an internal id tucked into the content, stripped out just before
 * sending. Add one more send path and that is the one that forgets.
 */
export function unknownProperty(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const key of Object.keys(visit.node)) {
      if (spec.properties.includes(key)) continue;
      findings.push({
        rule: "schema/unknown-property",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema} has no property "${key}"`,
        hint:
          "LINE rejects a message containing properties it does not know. If you attach"
          + " your own metadata, strip it just before sending — on every send path you have.",
        spec: REFERENCE,
      });
    }
  }
  return findings;
}

/** A missing required property. altText and a video's previewUrl come up here. */
export function missingRequired(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const key of spec.required) {
      if (key in visit.node && visit.node[key] !== undefined) continue;
      findings.push({
        rule: "schema/missing-required",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `${spec.schema} is missing the required "${key}"`,
        hint: hintForRequired(spec.schema, key),
        spec: REFERENCE,
      });
    }
  }
  return findings;
}

function hintForRequired(schema: string, key: string): string {
  if (schema === "FlexMessage" && key === "altText") {
    return "This is the text shown on desktop and in the notification. Without it the message cannot be sent.";
  }
  if (schema === "FlexVideo" && key === "previewUrl") {
    return "The URL of a thumbnail. If you cannot produce one, either do not send the video or generate it from the first frame.";
  }
  if (schema === "FlexVideo" && key === "altContent") {
    return "The image shown instead on a LINE that cannot play video. Without it, those devices show nothing at all.";
  }
  return `${schema} requires ${key}. Without it, LINE rejects the whole message.`;
}

/** A type value the specification does not have — a misspelling, or a type of your own. */
export function unknownType(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    if (visit.kind === "message") continue;
    if (visit.type !== undefined && tableFor(visit)) continue;
    findings.push({
      rule: "schema/unknown-type",
      severity: "error",
      path: `${visit.path}.type`,
      message:
        visit.type === undefined
          ? "there is no type here"
          : `"${visit.type}" is not a ${visit.kind} type in the specification`,
      hint: `The ones there are: ${known(visit.kind).join(" / ")}.`,
      spec: REFERENCE,
    });
  }
  return findings;
}

/** A value outside an enum — catches writing "large" for a size, and the like. */
export function invalidEnum(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    const spec = tableFor(visit);
    if (!spec) continue;
    for (const [key, allowed] of Object.entries(spec.enums)) {
      const value = visit.node[key];
      if (typeof value !== "string" || allowed.includes(value)) continue;
      findings.push({
        rule: "schema/invalid-enum",
        severity: "error",
        path: `${visit.path}.${key}`,
        message: `"${value}" is not a value ${spec.schema}.${key} accepts`,
        hint: `The ones it does: ${allowed.join(" / ")}.`,
        spec: REFERENCE,
      });
    }
  }
  return findings;
}
