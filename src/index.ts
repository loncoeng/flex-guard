// The public entry points.
//
//   validate(message)      check a Flex message
//   looksLikeFlex(text)    check whether what is about to go out as text is Flex

import { containerTooLarge, propertyTooLong } from "./rules/size.ts";
import {
  darkModeInvisible,
  emptyContainer,
  insecureUrl,
  mixedBubbleSize,
} from "./rules/render.ts";
import {
  invalidEnum,
  missingRequired,
  unknownProperty,
  unknownType,
} from "./rules/schema.ts";
import { unescapedPlaceholder } from "./rules/variables.ts";
import type { Finding, Result, Rule, RuleContext } from "./types.ts";
import { rootKind } from "./walk.ts";

export type { Finding, Result, Rule, Severity } from "./types.ts";
export type { FlexLikeness } from "./detect.ts";
export { looksLikeFlex } from "./detect.ts";

/** The rules that run by default, paired with the identifier that disables one. */
const RULES: Readonly<Record<string, Rule>> = {
  "schema/unknown-type": unknownType,
  "schema/unknown-property": unknownProperty,
  "schema/missing-required": missingRequired,
  "schema/invalid-enum": invalidEnum,
  "size/container-too-large": containerTooLarge,
  "size/property-too-long": propertyTooLong,
  "render/dark-mode-invisible": darkModeInvisible,
  "render/empty-container": emptyContainer,
  "render/mixed-bubble-size": mixedBubbleSize,
  "render/insecure-url": insecureUrl,
  "variables/unescaped-placeholder": unescapedPlaceholder,
};

export interface Options {
  /**
   * Rules to turn off. Matched by prefix, so `render` drops the whole set of
   * appearance checks at once.
   *
   * They can be turned off because a warning is sometimes exactly how
   * something was built. Turning off an error is not the intended use, but
   * standing in your way is not this library's job, so it is not forbidden.
   */
  disable?: readonly string[];
  /**
   * Properties not in the specification that you want to send anyway — the way
   * out for when LINE adds something first.
   *
   * The table is generated from LINE's definition, so a new property on their
   * side reads as "unknown" here until it is regenerated. This is so that you
   * do not have to wait for that.
   */
  allowProperties?: readonly string[];
}

const applies = (rule: string, disabled: readonly string[]): boolean =>
  !disabled.some((prefix) => rule === prefix || rule.startsWith(`${prefix}/`));

/**
 * Check a Flex message.
 *
 * Takes `{type:"flex", altText, contents}`, and also a bare bubble or
 * carousel from inside one. With the former, a missing altText is visible too.
 */
export function validate(message: unknown, options: Options = {}): Result {
  const disabled = options.disable ?? [];
  const allowed = new Set(options.allowProperties ?? []);

  if (rootKind(message) === undefined) {
    return finish([
      {
        rule: "schema/unknown-type",
        severity: "error",
        path: "$",
        message: 'this is not a Flex message (type is none of "flex", "bubble" or "carousel")',
        hint: "Did you pass text? If so, looksLikeFlex() is the one you want.",
      },
    ]);
  }

  const serialized = serialize(message);
  if (serialized === undefined) {
    // A cycle, usually. LINE could not be sent this either, so it comes back
    // as an error. Throwing here would take down whatever called the check,
    // and **a checker that falls over on its input is worse than a miss.**
    return finish([
      {
        rule: "schema/not-serializable",
        severity: "error",
        path: "$",
        message: "this cannot be turned into JSON (it may contain a cycle)",
        hint: "Did you put the same object in two places while building it?",
      },
    ]);
  }

  const context: RuleContext = { message, serialized };

  const findings: Finding[] = [];
  for (const [name, rule] of Object.entries(RULES)) {
    if (!applies(name, disabled)) continue;
    for (const finding of rule(context)) {
      if (finding.rule === "schema/unknown-property") {
        const key = finding.path.slice(finding.path.lastIndexOf(".") + 1);
        if (allowed.has(key)) continue;
      }
      findings.push(finding);
    }
  }
  return finish(findings);
}

function serialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return undefined;
  }
}

function finish(findings: Finding[]): Result {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  // ok answers one question: will LINE accept it. Warnings are judgement
  // calls and stay out of it — fold them in and you create a reason to turn
  // the check off to make them go away.
  return { ok: errors.length === 0, findings, errors, warnings };
}

/** One line for a person to read. Goes straight into a CI log or a console.log. */
export function format(finding: Finding): string {
  const head = `[${finding.severity}] ${finding.path}  ${finding.message}`;
  return finding.hint === undefined ? head : `${head}\n          ${finding.hint}`;
}
