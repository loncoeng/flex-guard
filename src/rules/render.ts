// The checks on how it looks. All of them are warnings.
//
// This is the real subject. Everything here sends successfully. LINE accepts
// it, the recipient gets it, and on their screen it is not what was intended.
//
// No error comes back to the sender. Nothing reaches a log. The only sign of
// it is the absence of a reply, so **running this in production will not tell
// you**. Which leaves looking before it goes out.

import type { Finding, RuleContext } from "../types.ts";
import { isObject, walk } from "../walk.ts";

/** Luminance from #FFF / #FFFFFF / #FFFFFFFF. undefined if it is not a colour. */
function luminance(color: unknown): number | undefined {
  if (typeof color !== "string") return undefined;
  const hex = color.trim().replace(/^#/, "");
  const short = hex.length === 3 || hex.length === 4;
  const full = hex.length === 6 || hex.length === 8;
  if (!short && !full) return undefined;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return undefined;

  const part = (index: number): number => {
    const raw = short
      ? hex[index]!.repeat(2)
      : hex.slice(index * 2, index * 2 + 2);
    return Number.parseInt(raw, 16) / 255;
  };
  // ITU-R BT.709 luminance. Not a rigorous perceptual quantity, and enough to
  // decide whether something is close to white.
  return 0.2126 * part(0) + 0.7152 * part(1) + 0.0722 * part(2);
}

/** Whether a background colour is set. If it is, this is no longer about the
 *  automatic adjustment. */
const hasOwnBackground = (node: Record<string, unknown>): boolean =>
  typeof node["backgroundColor"] === "string" || isObject(node["background"]);

/**
 * A text colour that disappears in dark mode.
 *
 * LINE adapts the default text colour to the background. Set a colour and
 * that adaptation stops applying. Build on a light screen, pick something
 * close to white, and it dissolves for anyone in dark mode.
 *
 * Where a background colour is set, this stays quiet: that is a combination
 * somebody chose.
 */
export function darkModeInvisible(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const backgrounds: boolean[] = [];

  for (const visit of walk(context.message)) {
    if (visit.kind === "component" && hasOwnBackground(visit.node)) {
      backgrounds.push(true);
    }
    if (visit.type !== "text" && visit.type !== "span") continue;
    const level = luminance(visit.node["color"]);
    if (level === undefined || level < 0.85) continue;
    if (backgrounds.length > 0) continue;

    findings.push({
      rule: "render/dark-mode-invisible",
      severity: "warning",
      path: `${visit.path}.color`,
      message: `A near-white text colour (${String(visit.node["color"])}) is set explicitly`,
      hint:
        "LINE adapts only the default text colour to the background. Setting a colour"
        + " opts out of that, so it dissolves for anyone in dark mode. Either drop the"
        + " colour, or set a background colour in the same place.",
    });
  }
  return findings;
}

/** A box with nothing in it. It takes up space and draws nothing, which is
 *  where uneven spacing comes from. */
export function emptyContainer(context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    if (visit.type !== "box") continue;
    const contents = visit.node["contents"];
    if (!Array.isArray(contents) || contents.length > 0) continue;
    findings.push({
      rule: "render/empty-container",
      severity: "warning",
      path: `${visit.path}.contents`,
      message: "this box has nothing in it",
      hint: "Nothing is drawn and the spacing stays, so everything around it sits wrong. Drop it while building the message.",
    });
  }
  return findings;
}

/** bubbles of different sizes in one carousel, which lines up unevenly. */
export function mixedBubbleSize(context: RuleContext): Finding[] {
  const sizes = new Map<string, string>();
  for (const visit of walk(context.message)) {
    if (visit.type !== "bubble") continue;
    const size = typeof visit.node["size"] === "string" ? visit.node["size"] : "mega";
    sizes.set(visit.path, size);
  }
  const distinct = new Set(sizes.values());
  if (sizes.size < 2 || distinct.size < 2) return [];

  return [
    {
      rule: "render/mixed-bubble-size",
      severity: "warning",
      path: "$.contents.contents",
      message: `the bubbles in this carousel are not the same size (${[...distinct].join(" / ")})`,
      hint: "They line up at different widths. Unless that is deliberate, make them match. size defaults to mega.",
    },
  ];
}

/**
 * An image or video URL that is not https.
 *
 * LINE's documentation says, of image and video messages, to "make sure the
 * URLs have the HTTPS (TLS 1.2 or later) scheme". The Flex section says no
 * such thing, and **nowhere could be found stating that the API rejects it.**
 *
 * So this is a warning and not an error. What can actually be observed is
 * that the slot arrives blank, and the send goes through. Calling it an error
 * would assert that LINE rejects the message, and there is nothing to back
 * that up. **Not treating something as serious without being able to cite it**
 * is how this library is built.
 *
 * Confirm a rejection and this becomes an error.
 */
export function insecureUrl(context: RuleContext): Finding[] {
  const keys = ["url", "previewUrl", "iconUrl", "backgroundImage"];
  const findings: Finding[] = [];
  for (const visit of walk(context.message)) {
    for (const key of keys) {
      const value = visit.node[key];
      if (typeof value !== "string" || value === "") continue;
      if (value.startsWith("https://") || value.startsWith("data:")) continue;
      findings.push({
        rule: "render/insecure-url",
        severity: "warning",
        path: `${visit.path}.${key}`,
        message: `this URL is not https (${value.slice(0, 60)})`,
        hint:
          "LINE asks for HTTPS (TLS 1.2 or later) on images and video."
          + " It will not load, and the slot arrives blank.",
        spec: "https://developers.line.biz/en/docs/messaging-api/message-types/",
      });
    }
  }
  return findings;
}
