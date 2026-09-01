// 「これはテキストではない」の判定。
//
// 他のルールと違い、これは Flex の中身ではなく **送ろうとしている種別**を
// 疑う。Flex を保存して後から送る作りでは、種別と中身が食い違うことが
// 起きる。種別が text のまま Flex の JSON を送ると、LINE はそれを文字列
// として扱い、**受け取った人の画面に JSON がそのまま表示される**。
//
// この事故はエラーにならない。送信は成功し、配信数も増える。画面の
// プレビューは種別ではなく中身を見て描いていることが多いので、管理画面
// では正しく絵で出る。**送った側から見て、すべて正常に見える。**
//
// だから送る直前の一行に置く価値がある。

/** looksLikeFlex の判定結果。何を根拠にそう見たかを返す。 */
export interface FlexLikeness {
  /** Flex の JSON に見える */
  looksLikeFlex: boolean;
  /** bubble / carousel / undefined */
  containerType: string | undefined;
  /** そう判断した理由。判定を疑うときに読む */
  reason: string;
}

const NOT_FLEX = (reason: string): FlexLikeness => ({
  looksLikeFlex: false,
  containerType: undefined,
  reason,
});

/**
 * テキストとして送ろうとしている文字列が、実は Flex ではないかを見る。
 *
 * 判定は「JSON として読めて、Flex の container の形をしているか」に絞る。
 * 先頭が `{` かどうかだけで見ると、`[` で始まる配列を取りこぼす。逆に
 * 緩くしすぎると、`[FORM_1]` のような角括弧で始まる普通の本文を誤判定する。
 */
export function looksLikeFlex(text: string): FlexLikeness {
  const trimmed = text.trim();
  if (trimmed === "") return NOT_FLEX("空文字");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return NOT_FLEX("JSON の開始文字で始まっていない");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 角括弧で始まる普通の本文はここに落ちる。テキストとして正しい。
    return NOT_FLEX("JSON として読めない");
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
        reason: `type が "${type}"`,
      };
    }
    // {type:"flex", contents:{...}} の形で丸ごと入っていることもある。
    if (type === "flex" && typeof record["contents"] === "object") {
      const contents = record["contents"] as Record<string, unknown> | null;
      const inner = contents === null ? undefined : contents["type"];
      return {
        looksLikeFlex: true,
        containerType: typeof inner === "string" ? inner : undefined,
        reason: 'type が "flex"',
      };
    }
  }
  return NOT_FLEX("Flex の container が見当たらない");
}
