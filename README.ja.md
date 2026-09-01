# flex-guard

[![test](https://github.com/lon-coeng/flex-guard/actions/workflows/test.yml/badge.svg)](https://github.com/lon-coeng/flex-guard/actions/workflows/test.yml)

*[English version](README.md)*

**型が通っても LINE は 400 を返します。** 送る前に落とすための検査器です。

実行時の依存はありません。

---

## 何が問題か

LINE の Flex メッセージは JSON です。型を付ければ構造は守れますが、**型では届かないところに失敗が集まっています。**

```
型で防げる      構造・必須のキー・値の種類

型で防げない    JSON にしたときの大きさ
                知らないキーが混ざっていること
                相手の端末での見え方
```

そして厄介なのは、失敗が2種類あることです。

**片方はすぐ気付きます。** LINE が `400` を返し、送信が失敗します。

**もう片方は永久に気付きません。** 送信は成功し、配信数も増えます。ただ相手の画面では文字が背景に溶けていたり、画像の場所が空欄になっていたりします。**エラーは返らず、ログにも残りません。** 反応が無いという形でしか現れないので、運用していても分かりません。

## 何をするか

```ts
import { validate, format } from "flex-guard";

const result = validate(message);

if (!result.ok) {
  for (const finding of result.errors) console.log(format(finding));
}
```

```
[error] $.appMeta  FlexMessage が知らないプロパティ "appMeta" があります
          LINE は未知のプロパティを含むメッセージを受け取りません。独自のメタ情報を
          載せているなら、送信の直前に取り除いてください。送信経路が複数あるなら全部です。

[error] $.contents.footer.contents[0].action.data  PostbackAction.data が 300 文字を超えています (400)
          アクションの中身をそのまま載せていませんか。識別子だけを入れて、
          実体は送信ログなど別の場所から引き直す形にすると、上限に当たらなくなります。

[warning] $.contents.body.contents[0].color  白に近い文字色 (#FFFFFF) を指定しています
          LINE は既定の文字色だけを背景に合わせて調整します。色を明示するとその調整は
          効かないので、相手がダークモードのとき背景に溶けます。
```

## error と warning を分けています

**ここがこの検査器の中心にある判断です。**

| | 意味 | 直さないとどうなるか |
|---|---|---|
| `error` | LINE が受け取らない | 送信が失敗する。すぐ気付く |
| `warning` | 送信は成功する | 相手の画面で違って見える。**気付けない** |

`result.ok` は **error が無いかどうかだけ**を見ます。warning があっても `true` です。

送れるものを止めないためです。ここを混ぜると、警告を消したいがために検査ごと切る動機が生まれます。**そうなれば error も見られなくなります。**

## 検査するもの

### error

| ルール | 内容 |
|---|---|
| `schema/unknown-property` | 仕様に無いキーがある |
| `schema/missing-required` | 必須のキーが無い（`altText`、video の `previewUrl` など） |
| `schema/unknown-type` | `type` の値が仕様に無い |
| `schema/invalid-enum` | `size` に `large` と書くような取り違え |
| `size/bubble-too-large` | bubble が 10KB 超 |
| `size/carousel-too-large` | carousel が 50KB 超 |
| `action/data-too-long` | アクションの `data` が 300 文字超 |
| `schema/not-serializable` | JSON にできない（循環参照） |

### warning

| ルール | 内容 |
|---|---|
| `render/dark-mode-invisible` | 白に近い文字色。ダークモードで背景に溶ける |
| `render/empty-container` | 中身の無い box。余白だけが残る |
| `render/mixed-bubble-size` | carousel 内で bubble の幅が不揃い |
| `render/insecure-url` | https でない画像。その場所が空欄になる |
| `variables/unescaped-placeholder` | 差し込む値で JSON が壊れうる |

## 仕様表は手で書いていません

**許可するプロパティの一覧は、LINE 自身が公開している OpenAPI 定義から生成しています。**

```sh
npm run spec:generate
```

生成物 [`src/spec.ts`](src/spec.ts) の先頭に、取得元の URL・取得日・その内容の sha256 が入ります。**いつ時点の定義かは、生成物を見れば分かります。**

手で書き写していないのは、**この検査器で一番危ないのが誤検出**だからです。正しいメッセージを「送れません」と止めてしまうと、次からは誰も検査を通しません。600 近いプロパティ名を人間が写せば、どこかで間違えます。

LINE が先にプロパティを増やしたときは、再生成を待たずに逃がせます。

```ts
validate(message, { allowProperties: ["newProperty"] });
```

## 送る種別が食い違っていないか

Flex を保存して後から送る作りでは、**種別と中身が食い違う**ことが起きます。種別が `text` のまま Flex の JSON を送ると、LINE はそれを文字列として扱い、**受け取った人の画面に JSON がそのまま表示されます。**

この事故はエラーになりません。送信は成功し、配信数も増えます。管理画面のプレビューは種別ではなく中身を見て描いていることが多いので、そちらでは正しく絵で出ます。**送った側から見て、すべて正常に見えます。**

```ts
import { looksLikeFlex } from "flex-guard";

const detected = looksLikeFlex(body);
if (detected.looksLikeFlex) {
  throw new Error(`テキストとして送ろうとしています (${detected.reason})`);
}
```

先頭が `{` かどうかだけで見ると、`[` で始まる配列を取りこぼします。逆に緩くしすぎると、`[FORM_1] からご回答ください` のような普通の本文を止めてしまいます。**JSON として読めて、Flex の container の形をしているか**まで見ます。

## 導入

```sh
npm install flex-guard
```

Node 22.18 以上。`{type:"flex", altText, contents}` でも、中身の bubble / carousel 単体でも受け取ります。

## オプション

```ts
validate(message, {
  disable: ["render"],              // 前方一致でまとめて外せる
  allowProperties: ["myMeta"],      // 仕様に無いが送りたいキー
});
```

`disable` を用意してあるのは、warning に「そう作ってある」場合があるためです。背景色と組み合わせた白文字などが該当します。

## やらないこと

**組み立てはしません。** ここにあるのは検査だけです。Flex を組む道具は公式 SDK にありますし、組み方は作る人が決めることです。

**送信もしません。** 送る直前に挟むものなので、送信そのものには関わりません。

**出典の無いルールは入れていません。** altText の文字数上限、carousel に入る bubble の枚数、ネストの深さは、公式に数値の記載を見つけられなかったため入れていません。**根拠を示せないルールを 1 つ入れると、他の全部の信用が落ちます。** 出典が確認できたら足します。

**見え方は保証できません。** LINE 自身が、同じ Flex でも端末の OS・LINE のバージョン・解像度・言語設定・フォントによって描画が変わると書いています。ここで見ているのは、そのうち JSON から判断できる範囲だけです。

## テスト

```sh
npm test
```

Node の組み込みだけで動きます。型を剥がして `.ts` のまま実行するので、テストにビルドは要りません。

各テストは**壊した 1 箇所だけが挙がること**を確かめる形にしてあります。誤検出は見逃しより高くつくためです。`styles` や `background` のような「部品ではないオブジェクト」を部品として扱わないことも、テストで固定しています。

## ライセンス

MIT. [LICENSE](LICENSE) を参照してください。
