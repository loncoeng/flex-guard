// The shape of a result.
//
// Splitting severity into error and warning is the decision this library is
// built around. The two differ fundamentally in what happens if you leave
// them alone.
//
//   error    the LINE API answers 400. The send itself fails, so you find out
//   warning  the send succeeds. It just looks wrong on the recipient's device,
//            and **the sender never finds out at all**
//
// The second is the troublesome one. Nothing reaches an error log, and the
// only sign of it is the absence of a reply. A type checker can only see the
// structure, so this is a thing to look at while it runs.

/** error means LINE refuses it. warning means it sends and does not look right. */
export type Severity = "error" | "warning";

export interface Finding {
  /** The rule's identifier, built as category/name: `schema/unknown-property` */
  rule: string;
  severity: Severity;
  /** Where the problem is, as `$.contents.body.contents[2]` */
  path: string;
  /** What is happening */
  message: string;
  /** How to fix it. Written carelessly, a finding is something you can see
   *  and cannot act on */
  hint?: string;
  /** The citation. Every rule with a numeric limit carries one */
  spec?: string;
}

export interface Result {
  /** No errors at all — which is to say, LINE will accept it */
  ok: boolean;
  findings: Finding[];
  errors: Finding[];
  warnings: Finding[];
}

/** What a rule is handed, so that no rule has to rebuild the JSON itself. */
export interface RuleContext {
  /** The whole message being checked */
  message: unknown;
  /** The serialized JSON, so the size rules do not stringify it again */
  serialized: string;
}

export type Rule = (context: RuleContext) => Finding[];
