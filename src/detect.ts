// Deciding that something is not text.
//
// Unlike the other rules, this one doubts **the message type being sent**
// rather than the contents of a Flex message. Where messages are stored and
// sent later, the type and the contents come apart. Send Flex JSON with the
// type still set to text and LINE treats it as a string, and **the recipient
// gets the JSON on their screen.**
//
// Nothing about this is an error. The send succeeds and the delivery count
// goes up. A preview in an admin screen usually renders from the contents
// rather than the type, so it draws correctly there. **From the sending side,
// everything looks fine.**
//
// Which is why it is worth one line just before sending.

/** What looksLikeFlex decided, and what it decided it on. */
export interface FlexLikeness {
  /** It looks like Flex JSON */
  looksLikeFlex: boolean;
  /** bubble / carousel / undefined */
  containerType: string | undefined;
  /** Why it was read that way; for when you doubt the answer */
  reason: string;
}

const NOT_FLEX = (reason: string): FlexLikeness => ({
  looksLikeFlex: false,
  containerType: undefined,
  reason,
});

/**
 * Check whether a string about to be sent as text is in fact Flex.
 *
 * The test is narrow: does it parse as JSON, and is it shaped like a Flex
 * container. Looking only at whether it starts with `{` misses an array
 * starting with `[`. Loosen it too far and ordinary body text that starts
 * with a bracket, like `[FORM_1]`, gets called Flex.
 */
export function looksLikeFlex(text: string): FlexLikeness {
  const trimmed = text.trim();
  if (trimmed === "") return NOT_FLEX("empty string");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return NOT_FLEX("does not start the way JSON does");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Ordinary body text starting with a bracket lands here, correctly.
    return NOT_FLEX("does not parse as JSON");
  }

  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of candidates) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const type = record["type"];

    if (type === "bubble" || type === "carousel") {
      return {
        looksLikeFlex: true,
        containerType: type,
        reason: `the type is "${type}"`,
      };
    }
    // It also arrives whole, as {type:"flex", contents:{...}}.
    if (type === "flex" && typeof record["contents"] === "object") {
      const contents = record["contents"] as Record<string, unknown> | null;
      const inner = contents === null ? undefined : contents["type"];
      return {
        looksLikeFlex: true,
        containerType: typeof inner === "string" ? inner : undefined,
        reason: 'the type is "flex"',
      };
    }
  }
  return NOT_FLEX("no Flex container in it");
}
