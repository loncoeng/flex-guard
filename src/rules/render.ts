// 見え方の検査。すべて warning にしている。
//
// ここが本題である。挙がるものは全部「送信は成功する」。LINE は受け取り、
// 相手にも届く。ただし相手の画面では意図と違って見える。
//
// 送った側にエラーは返らない。ログにも残らない。相手からの反応が無い、
// という形でしか現れないので、**運用していても気付けない**。だから送る前に
// 見るしかない。

import type { Finding, RuleContext } from "../types.ts";
import { isObject, walk } from "../walk.ts";

/** #FFF / #FFFFFF / #FFFFFFFF から明度を出す。色として読めなければ undefined。 */
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
  // ITU-R BT.709 の輝度。厳密な知覚量ではないが、白に近いかの判定には足りる。
  return 0.2126 * part(0) + 0.7152 * part(1) + 0.0722 * part(2);
}

/** 背景色が明示されているか。されていれば自動調整の話ではなくなる。 */
const hasOwnBackground = (node: Record<string, unknown>): boolean =>
  typeof node["backgroundColor"] === "string" || isObject(node["background"]);

/**
 * ダークモードで読めなくなる文字色。
 *
 * LINE は既定の文字色を背景に合わせて自動調整する。しかし色を明示すると
 * その調整は効かなくなる。明るい画面で作って白に近い色を指定すると、
 * 相手がダークモードのとき背景に溶ける。
 *
 * 背景色を自分で指定している場合は、意図した組み合わせと見て黙る。
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
      message: `白に近い文字色 (${String(visit.node["color"])}) を指定しています`,
      hint:
        "LINE は既定の文字色だけを背景に合わせて調整します。色を明示するとその調整は"
        + "効かないので、相手がダークモードのとき背景に溶けます。色の指定を外すか、"
        + "同じ場所に背景色を指定してください。",
    });
  }
  return findings;
}

/** 中身の無い箱。場所は取るのに何も出ないので、余白がずれる原因になる。 */
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
      message: "中身の無い box があります",
      hint: "描画はされませんが余白は残るため、周りの間隔がずれて見えます。組み立ての段階で落としてください。",
    });
  }
  return findings;
}

/** carousel の中で bubble の size が揃っていない。横幅が不揃いに並ぶ。 */
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
      message: `carousel の中で bubble の size が揃っていません (${[...distinct].join(" / ")})`,
      hint: "横幅が不揃いに並びます。意図した演出でなければ揃えてください。size の既定は mega です。",
    },
  ];
}

/** https でない URL。画像や動画が出ない。 */
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
        message: `https でない URL です (${value.slice(0, 60)})`,
        hint: "LINE は https 以外の画像を読みません。その場所は空欄になります。",
      });
    }
  }
  return findings;
}
