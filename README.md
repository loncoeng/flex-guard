# flex-guard

[![test](https://github.com/lon-coeng/flex-guard/actions/workflows/test.yml/badge.svg)](https://github.com/lon-coeng/flex-guard/actions/workflows/test.yml)

*[日本語版 / Japanese version](README.ja.md)*

**Your types compile and LINE still returns 400.** This catches it before you send.

No dependencies at runtime.

---

## The problem

A LINE Flex Message is JSON. Types will hold the shape together, but **the failures
collect in the places types cannot reach.**

```
types catch      structure, required keys, value kinds

types miss       how large the JSON turns out to be
                 keys LINE has never heard of
                 how it looks on someone else's phone
```

And there are two kinds of failure, which is the awkward part.

**One kind you notice immediately.** LINE returns `400` and the send fails.

**The other kind you never notice.** The send succeeds. The delivery count goes up.
On the recipient's screen the text has dissolved into the background, or an image slot
is blank. **No error comes back. Nothing lands in a log.** It shows up only as silence,
so running the thing in production will not tell you.

## What it does

```ts
import { validate, format } from "flex-guard";

const result = validate(message);

if (!result.ok) {
  for (const finding of result.errors) console.log(format(finding));
}
```

```
[error] $.appMeta  FlexMessage has no property "appMeta"
          LINE rejects a message containing properties it does not know. If you attach
          your own metadata, strip it just before sending — on every send path you have.

[error] $.contents.footer.contents[0].action.data  PostbackAction.data exceeds 300 characters (400)
          Are you putting the action itself in here? Carry an identifier and read the
          payload back from somewhere else, and the limit stops mattering.

[warning] $.contents.body.contents[0].color  A near-white text colour (#FFFFFF) is set explicitly
          LINE adapts only the default text colour to the background. Setting a colour
          opts out of that, so it dissolves for anyone in dark mode.
```

## error and warning mean different things

**This split is the decision the whole library is built around.**

| | Meaning | What happens if you ignore it |
|---|---|---|
| `error` | LINE will not accept it | The send fails. You find out at once |
| `warning` | The send succeeds | It looks wrong on their screen. **You never find out** |

`result.ok` reflects **errors only**. Warnings leave it `true`.

That is deliberate: it must not block something LINE would happily deliver. Fold the two
together and you hand people a reason to switch the check off to silence a warning —
**and then the errors stop being seen too.**

## What it checks

### error

| Rule | |
|---|---|
| `schema/unknown-property` | A key that is not in the specification |
| `schema/missing-required` | A required key is absent (`altText`, a video's `previewUrl`) |
| `schema/unknown-type` | A `type` value the specification does not define |
| `schema/invalid-enum` | `large` where `size` wanted `mega` |
| `size/bubble-too-large` | A bubble over 10KB |
| `size/carousel-too-large` | A carousel over 50KB |
| `action/data-too-long` | An action's `data` over 300 characters |
| `schema/not-serializable` | Cannot become JSON at all (a cycle) |

### warning

| Rule | |
|---|---|
| `render/dark-mode-invisible` | Near-white text that dissolves in dark mode |
| `render/empty-container` | An empty box: no content, but the spacing stays |
| `render/mixed-bubble-size` | Bubbles of differing widths inside one carousel |
| `render/insecure-url` | A non-https image, which leaves the slot blank |
| `variables/unescaped-placeholder` | A substituted value that could break the JSON |

## The property table is not hand-written

**The list of permitted properties is generated from LINE's own published OpenAPI
definition.**

```sh
npm run spec:generate
```

The generated [`src/spec.ts`](src/spec.ts) carries the source URL, the date it was
fetched, and the sha256 of what was fetched. **Which version of the specification you
are checking against is visible in the file itself.**

It is generated rather than typed out because **a false positive is the worst thing this
library can do.** Stop a valid message and nobody runs the check again. Copy six hundred
property names by hand and you will get one of them wrong.

When LINE adds a property before the table catches up, there is a way through:

```ts
validate(message, { allowProperties: ["newProperty"] });
```

## When the message type and the content disagree

If you store Flex and send it later, **the declared type and the actual content can
drift apart.** Send Flex JSON while the type still says `text` and LINE treats it as a
string — **the recipient sees the raw JSON in their chat.**

Nothing errors. The send succeeds and the delivery count goes up. An admin preview
usually renders from the content rather than the declared type, so there it still looks
correct. **From your side, everything appears fine.**

```ts
import { looksLikeFlex } from "flex-guard";

const detected = looksLikeFlex(body);
if (detected.looksLikeFlex) {
  throw new Error(`about to send this as text (${detected.reason})`);
}
```

Testing only for a leading `{` misses anything that starts as an array. Loosen it too
far and you block ordinary copy like `[FORM_1] to get started`. This parses the string
and looks for the shape of a Flex container.

## Install

```sh
npm install flex-guard
```

Node 22.18 or later. Accepts either a whole `{type:"flex", altText, contents}` or a bare
bubble / carousel.

## Options

```ts
validate(message, {
  disable: ["render"],              // prefix match, so a whole family goes at once
  allowProperties: ["myMeta"],      // keys outside the specification you mean to send
});
```

`disable` exists because a warning is sometimes exactly what was intended — white text
paired with a background colour, for instance.

## What it does not do

**It does not build anything.** This checks; it does not assemble. The official SDK
builds Flex, and how you assemble it is your business.

**It does not send.** It sits in front of your send call and stays out of it.

**It carries no rule it cannot cite.** A maximum length for `altText`, a maximum number
of bubbles in a carousel, a maximum nesting depth — no published figure for any of them
turned up, so none of them are here. **One rule you cannot justify costs you the
credibility of the rest.** They go in when a source does.

**It cannot promise how anything looks.** LINE states plainly that the same Flex Message
renders differently depending on device OS, LINE version, resolution, language settings
and font. What is here is the part that can be judged from the JSON.

## Tests

```sh
npm test
```

Node built-ins only. Types are stripped at run time, so the tests need no build step.

Each test fixes that **only the one thing that was broken gets reported**, because a
false positive costs more than a miss. That objects like `styles` and `background` are
never mistaken for components is pinned down the same way.

## License

MIT. See [LICENSE](LICENSE).
