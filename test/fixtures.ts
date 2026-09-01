// テストで使う、指摘が 1 件も出ない Flex メッセージ。
//
// 検査器で一番怖いのは誤検出である。正しいものを「送れません」と止めたら、
// 次からは誰も検査を通さなくなる。だから各テストは「壊した 1 箇所だけが
// 挙がること」を確かめる形にしてあり、その土台がこれである。

export const validBubble = () => ({
  type: "flex" as const,
  altText: "本日のお知らせ",
  contents: {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "本日のお知らせ", weight: "bold", size: "lg" },
        { type: "text", text: "17時に配信します", wrap: true },
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
          action: { type: "postback", label: "詳しく見る", data: "detail" },
        },
      ],
    },
  },
});

export const validCarousel = () => ({
  type: "flex" as const,
  altText: "3件のお知らせ",
  contents: {
    type: "carousel",
    contents: [bubble("1件目"), bubble("2件目"), bubble("3件目")],
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

/** 深い場所を書き換えるための小さな道具。テストの意図を1行で見せるために使う。 */
export function at(root: any, path: readonly (string | number)[]): any {
  return path.reduce((node, key) => node[key], root);
}
