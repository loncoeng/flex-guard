// 検査結果の型。
//
// severity を error と warning に分けているのが、このライブラリの中心にある
// 判断である。両者は「直さないとどうなるか」が根本的に違う。
//
//   error    LINE API が 400 を返す。送信そのものが失敗するので、すぐ気付く
//   warning  送信は成功する。相手の端末で意図と違って見えるだけなので、
//            **送った側には永久に分からない**
//
// 後者の方が厄介である。エラーログにも残らず、相手からの反応が無いという
// 形でしか現れない。型検査では構造しか見られないので、ここは実行時に見る
// しかない。

/** error は LINE に拒否される。warning は送れるが意図通りに出ない。 */
export type Severity = "error" | "warning";

export interface Finding {
  /** ルール識別子。`schema/unknown-property` のように分類/名前で組む */
  rule: string;
  severity: Severity;
  /** 問題のある場所。`$.contents.body.contents[2]` の形 */
  path: string;
  /** 何が起きているか */
  message: string;
  /** どう直すか。ここを丁寧に書かないと、検出できても直せない */
  hint?: string;
  /** 根拠。数値の上限を持つルールには必ず付ける */
  spec?: string;
}

export interface Result {
  /** error が 1 件も無い。つまり LINE は受け取る */
  ok: boolean;
  findings: Finding[];
  errors: Finding[];
  warnings: Finding[];
}

/** ルールが受け取る文脈。ルール側で JSON を作り直さずに済むようにしておく。 */
export interface RuleContext {
  /** 検査対象のメッセージ全体 */
  message: unknown;
  /** シリアライズ済みの JSON。サイズ検査で毎回 stringify しないため */
  serialized: string;
}

export type Rule = (context: RuleContext) => Finding[];
