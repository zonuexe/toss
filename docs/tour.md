# Toss Language Tour

## 1. 言語のコア哲学

* **すべてはオブジェクトであり、すべては辞書である。**
* **すべての計算は「オブジェクトへのメッセージ送信」によって行われる。**（二項演算子は存在しない）
* 構文規則は極小。キーワードなどの予約語は持たず、制御構文や変数宣言すらもメッセージとマクロで解決する。
* **実行環境はJavaScript（Node.js/Deno）への逐語的コンパイルを前提とする。**

---

## 2. コア構文（5つの基本ルール）

パーサーが理解すべきASTの基本ノードは以下の5つのみです。文の終端（ステートメント・ターミネーター）は **明示的なピリオド `.`** を使用し、ASI（Auto Semicolon Insertion、暗黙の補完）は行いません。

### ① 単項メッセージ (Unary Message)

引数を取らないメッセージです。

```
Window new.
'hello' upcase trim print.
```

### ② キーワードメッセージ (Keyword Message)

コロン `:` を使って引数を渡すメッセージです。複数の引数は交互に並びます。

```
myArray at: 1 put: 'Apple'.
```

### ③ ブロック (Block / Closure)

遅延評価されるコードの塊（クロージャ）です。`->` で引数を定義します。

```
// 引数なしのブロック
{ 'Hello' print }

// 引数ありのブロック
{ x -> $(x * 2) }
{ name, age -> $('Name: ' + name) print }
```

### ④ マクロ (Macro / DSL)

コンパイル時にASTを展開・変換するための仕組みです。中身はトークンツリーとしてマクロ関数に渡されます。
数式の解決（二項演算子のエミュレート）にはビルトインマクロ `$()` を使います。

```
// インラインマクロ
$(1 + 2 * 3) print.
#regex(^abc.*$) match: 'abcdef'.

// ステートメントマクロ（括弧を省略すると、ピリオドまでを引数とする行マクロになる）
#let x = 100.
#const secret = 42.
#import $Math as: M.
```

### ⑤ パイプライン演算子 (`|>`)

左辺の評価結果を、右辺のキーワードメッセージの「最後の引数」として暗黙的に注入します。

```
// 1024 が put: の引数として注入される
1024 |> myDict at: 'user_id' put:.

// 連続したデータ変換
[1, 2, 3] 
    flatMap: { x -> x timesMap: { x } }
    |> #resultArray bind:.
```

---

## 3. 環境と状態（スコープと代入）

スコープ（環境）は単なる辞書オブジェクトです。

* **フェッチ（参照）:** `$変数名` と書くことで、現在の環境辞書から値を取り出します。これにより「変数」と「単項メッセージ」の曖昧さが完全に消滅します。
* **バインド（代入）:** `#シンボル bind: 値` というメッセージ式で環境辞書に値を登録します。

```
// 代入（バインド）
#x bind: $(1 + 2 * 3).

// パイプラインを使ったバインド
$(1 + 2 * 3) |> #x bind:.

// 参照（フェッチ）
$x print.
```

---

## 4. オブジェクトモデル（プロトタイプベース）

クラスは存在しません。既存のオブジェクト（辞書）を複製（`clone`）し、スロット（プロパティやブロック）を拡張（`#extend` マクロ）することで新しいオブジェクトを定義します。未知のメッセージは暗黙的に親（プロトタイプ）へ委譲されます。

### オブジェクトの定義と継承

```
// 親オブジェクトの定義
#Animal bind: $Object clone |> #extend(
    name: 'Unknown',
    bark: {
        $self name print.
        'Bow wow!' print.
    }
).

// 子オブジェクトの定義（継承）
#Dog bind: $Animal clone |> #extend(
    name: 'Pochi',

    // メソッドのオーバーライドとsuper呼び出し
    bark: {
        #super(bark).
        'Woooo!' print.
    }
).

// 実行
$Dog bark.
```

### `$self` のセマンティクス

ブロック内で `$self` を参照すると、ランタイム（またはコンパイル時のα変換）によってレシーバ自身が解決されます。JSにコンパイルする際は、レキシカルスコープの恩恵を受けて衛生的に変換されます。

---

## 5. モジュールとカプセル化

ファイルごとに独立した環境（辞書）が生成されます（Node.jsスタイル）。外部に公開したいものだけを `$module exports` にバインドします。

```
// --- math.ext ---

// ファイル内だけのプライベート変数（自動的にカプセル化される）
#secretMultiplier bind: 42.

// プライベート関数
#internalCalc bind: { x -> $(x * $secretMultiplier) }.

// 外部への公開
$module |> #exports bind: ( $Object clone |> #extend(
    pi: 3.14159,
    calc: { x -> $internalCalc value: x }
) ).
```

### 完全なプライベートメソッド（Symbolの活用）

ユニークなSymbolオブジェクトを生成し、それを辞書のキーにすることで、外部から絶対にアクセスできない内部メッセージを作れます。

```
#PRIVATE_DIGEST bind: $Symbol generateUnique.

$module |> #exports bind: ( $Animal clone |> #extend(
    eat: { food ->
        // 内部メッセージの呼び出し
        $self perform: $PRIVATE_DIGEST.
    },

    ($PRIVATE_DIGEST): {
        'Digesting in secret...' print.
    }
) ).
```

---

## 6. 制御構造とエフェクトハンドラ

`if` や `for` などの制御構造はすべてブロックへのメッセージです。さらに、エラーハンドリングはFlix等に見られる「エフェクトハンドラ」を辞書とメッセージの組み合わせで実現します。

### 基本的な制御構造

```
// 条件分岐
$(x > 0)
    ifTrue: { 'Positive' print }
    ifFalse: { 'Negative' print }.

// 繰り返し
3 times: { 'Hello' print }.
```

### `unwind-protect` (確実な後処理)

```
#file bind: $File open: 'data.txt'.
{
    $file readLines map: { line -> line print }.
} ensure: {
    $file close.
}.
```

### エフェクトハンドラ（例外の発生と再開）

```
// エフェクトの発生（返答を待つ）
#config bind: ( $Effect perform: #FileNotFound ).

// エフェクトの捕捉と再開（resume）
{
    // 何らかの処理
    $Effect perform: #FileNotFound.
} handleWith: ( $Object clone |> #extend(
    FileNotFound: { resume ->
        'Warning!' print.
        // デフォルト値を返して処理を再開させる
        resume value: '{"theme": "dark"}'.
    }
) ).
```

---

## 7. 型注釈（オプション）

推論器やLSP（Language Server Protocol）を助けるため、TypeScriptライクなコロン `:` による型注釈をサポートします。これらはコンパイル時にメタデータとして処理され、実行時のオーバーヘッドにはなりません。

```
#let count: Int = 0.

#greet bind: { name: String ->
    $('Hello, ' + name)
}.
```
