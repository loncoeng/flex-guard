// 自動生成。手で編集しないこと。
//
//   npm run spec:generate
//
// 出典   https://raw.githubusercontent.com/line/line-openapi/main/messaging-api.yml
// 取得日 2026-09-01
// sha256 0227978ce1b3133e20da034fc33a9241000619ae4fea2fda7b61983abf79577a
//
// この表にあるプロパティ名は LINE 自身の定義から起こしている。手で
// 書き写していないので、綴り違いによる誤検出は起きない。

export interface TypeSpec {
  /** OpenAPI 上のスキーマ名。指摘の根拠を示すために持つ */
  schema: string;
  properties: readonly string[];
  required: readonly string[];
  /** maxLength / maxItems。仕様に書かれているものだけ */
  limits: Readonly<Record<string, number>>;
  enums: Readonly<Record<string, readonly string[]>>;
}

/** Flex メッセージ本体 (altText と contents) */
export const FLEX_MESSAGE: TypeSpec = {
  "schema": "FlexMessage",
  "properties": [
    "altText",
    "contents",
    "quickReply",
    "sender",
    "type"
  ],
  "required": [
    "altText",
    "contents",
    "type"
  ],
  "limits": {},
  "enums": {}
};

/** bubble と carousel */
export const FLEX_CONTAINERS: Readonly<Record<string, TypeSpec>> = {
  "bubble": {
    schema: "FlexBubble",
    properties: ["action","body","direction","footer","header","hero","size","styles","type"],
    required: ["type"],
    limits: {},
    enums: {"direction":["ltr","rtl"],"size":["nano","micro","deca","hecto","kilo","mega","giga"]},
  },
  "carousel": {
    schema: "FlexCarousel",
    properties: ["contents","type"],
    required: ["contents","type"],
    limits: {},
    enums: {},
  },
};

/** box / text / image / video など */
export const FLEX_COMPONENTS: Readonly<Record<string, TypeSpec>> = {
  "box": {
    schema: "FlexBox",
    properties: ["action","alignItems","background","backgroundColor","borderColor","borderWidth","contents","cornerRadius","flex","height","justifyContent","layout","margin","maxHeight","maxWidth","offsetBottom","offsetEnd","offsetStart","offsetTop","paddingAll","paddingBottom","paddingEnd","paddingStart","paddingTop","position","spacing","type","width"],
    required: ["contents","layout","type"],
    limits: {},
    enums: {"layout":["horizontal","vertical","baseline"],"position":["relative","absolute"],"justifyContent":["center","flex-start","flex-end","space-between","space-around","space-evenly"],"alignItems":["center","flex-start","flex-end"]},
  },
  "button": {
    schema: "FlexButton",
    properties: ["action","adjustMode","color","flex","gravity","height","margin","offsetBottom","offsetEnd","offsetStart","offsetTop","position","scaling","style","type"],
    required: ["action","type"],
    limits: {},
    enums: {"style":["primary","secondary","link"],"gravity":["top","bottom","center"],"position":["relative","absolute"],"height":["md","sm"],"adjustMode":["shrink-to-fit"]},
  },
  "image": {
    schema: "FlexImage",
    properties: ["action","align","animated","aspectMode","aspectRatio","backgroundColor","flex","gravity","margin","offsetBottom","offsetEnd","offsetStart","offsetTop","position","size","type","url"],
    required: ["type","url"],
    limits: {},
    enums: {"position":["relative","absolute"],"align":["start","end","center"],"gravity":["top","bottom","center"],"aspectMode":["fit","cover"]},
  },
  "video": {
    schema: "FlexVideo",
    properties: ["action","altContent","aspectRatio","previewUrl","type","url"],
    required: ["altContent","previewUrl","type","url"],
    limits: {},
    enums: {},
  },
  "icon": {
    schema: "FlexIcon",
    properties: ["aspectRatio","margin","offsetBottom","offsetEnd","offsetStart","offsetTop","position","scaling","size","type","url"],
    required: ["type","url"],
    limits: {},
    enums: {"position":["relative","absolute"]},
  },
  "text": {
    schema: "FlexText",
    properties: ["action","adjustMode","align","color","contents","decoration","flex","gravity","lineSpacing","margin","maxLines","offsetBottom","offsetEnd","offsetStart","offsetTop","position","scaling","size","style","text","type","weight","wrap"],
    required: ["type"],
    limits: {},
    enums: {"align":["start","end","center"],"gravity":["top","bottom","center"],"weight":["regular","bold"],"style":["normal","italic"],"decoration":["none","underline","line-through"],"position":["relative","absolute"],"adjustMode":["shrink-to-fit"]},
  },
  "span": {
    schema: "FlexSpan",
    properties: ["color","decoration","size","style","text","type","weight"],
    required: ["type"],
    limits: {},
    enums: {"weight":["regular","bold"],"style":["normal","italic"],"decoration":["none","underline","line-through"]},
  },
  "separator": {
    schema: "FlexSeparator",
    properties: ["color","margin","type"],
    required: ["type"],
    limits: {},
    enums: {},
  },
  "filler": {
    schema: "FlexFiller",
    properties: ["flex","type"],
    required: ["type"],
    limits: {},
    enums: {},
  },
};

/** postback / uri / message など */
export const ACTIONS: Readonly<Record<string, TypeSpec>> = {
  "camera": {
    schema: "CameraAction",
    properties: ["label","type"],
    required: [],
    limits: {},
    enums: {},
  },
  "cameraRoll": {
    schema: "CameraRollAction",
    properties: ["label","type"],
    required: [],
    limits: {},
    enums: {},
  },
  "clipboard": {
    schema: "ClipboardAction",
    properties: ["clipboardText","label","type"],
    required: ["clipboardText"],
    limits: {"clipboardText":1000},
    enums: {},
  },
  "datetimepicker": {
    schema: "DatetimePickerAction",
    properties: ["data","initial","label","max","min","mode","type"],
    required: [],
    limits: {"data":300},
    enums: {"mode":["date","time","datetime"]},
  },
  "location": {
    schema: "LocationAction",
    properties: ["label","type"],
    required: [],
    limits: {},
    enums: {},
  },
  "message": {
    schema: "MessageAction",
    properties: ["label","text","type"],
    required: [],
    limits: {},
    enums: {},
  },
  "postback": {
    schema: "PostbackAction",
    properties: ["data","displayText","fillInText","inputOption","label","text","type"],
    required: [],
    limits: {"data":300},
    enums: {"inputOption":["closeRichMenu","openRichMenu","openKeyboard","openVoice"]},
  },
  "richmenuswitch": {
    schema: "RichMenuSwitchAction",
    properties: ["data","label","richMenuAliasId","type"],
    required: [],
    limits: {"data":300,"richMenuAliasId":32},
    enums: {},
  },
  "uri": {
    schema: "URIAction",
    properties: ["altUri","label","type","uri"],
    required: [],
    limits: {},
    enums: {},
  },
};
