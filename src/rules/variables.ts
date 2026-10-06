// The check for templates with values substituted in later.
//
// Storing a Flex message as a template and filling in per-recipient values at
// send time is a pattern that turns up in almost any real use of this. And a
// substituted value containing a newline or a quote breaks the JSON.
//
// How it breaks is the bad part. It works on the machine the template was
// built on, it works for most values, and **it fails only when sending to one
// particular person** — because one of them has a " in their name.

import type { Finding, RuleContext } from "../types.ts";
import { walk } from "../walk.ts";

/** Catches shapes like {name} {field:birthday} {{first_name}} $NAME. */
const PLACEHOLDER = /\{\{?[^{}\n]{1,60}\}?\}/g;

/** The string properties a value might be substituted into. */
const TEXT_KEYS = ["text", "altText", "label", "data", "displayText", "uri", "url"];

/**
 * A string containing a placeholder.
 *
 * Whether the substituted value gets escaped is not something this JSON can
 * say. So this is a warning — "this can break", not "this is broken" — along
 * with what to go and check.
 */
export function unescapedPlaceholder(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const visit of walk(context.message)) {
    for (const key of TEXT_KEYS) {
      const value = visit.node[key];
      if (typeof value !== "string") continue;
      const matches = [...value.matchAll(PLACEHOLDER)].map((m) => m[0]);
      if (matches.length === 0) continue;

      const path = `${visit.path}.${key}`;
      if (seen.has(path)) continue;
      seen.add(path);

      findings.push({
        rule: "variables/unescaped-placeholder",
        severity: "warning",
        path,
        message: `this looks like a placeholder (${matches.slice(0, 3).join(" ")})`,
        hint:
          "A substituted value containing a newline or a quote breaks the JSON. When"
          + " substituting into JSON, insert JSON.stringify of the value with the"
          + " surrounding quotes taken off. Insert it raw and it fails for one recipient.",
      });
    }
  }
  return findings;
}
