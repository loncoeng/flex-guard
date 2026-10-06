// Flex messages that produce no findings at all, for the tests to build on.
//
// The worst thing a checker can do is report something that is not there.
// Stop a valid message with "you cannot send this" and nobody runs the check
// again. So every test takes one of these, breaks one thing, and asserts that
// the one broken thing is what comes back.

export const validBubble = () => ({
  type: "flex" as const,
  altText: "Today's notice",
  contents: {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "Today's notice", weight: "bold", size: "lg" },
        { type: "text", text: "Going out at 17:00", wrap: true },
        { type: "separator", margin: "md" },
        { type: "image", url: "https://cdn.example.com/banner.png", size: "full" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          action: { type: "postback", label: "Read more", data: "detail" },
        },
      ],
    },
  },
});

export const validCarousel = () => ({
  type: "flex" as const,
  altText: "Three notices",
  contents: {
    type: "carousel",
    contents: [bubble("First"), bubble("Second"), bubble("Third")],
  },
});

function bubble(label: string) {
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: label }],
    },
  };
}

/** A small tool for reaching deep into a message, so a test's intent fits on
 *  one line. */
export function at(root: any, path: readonly (string | number)[]): any {
  return path.reduce((node, key) => node[key], root);
}
