# Toss Language Tour

この文書は将来設計を含む言語ツアーです。実装済みの範囲は [README](../README.md) を参照してください。名前付きマクロは `%name`、シンボルは `#name`、呼び出しに関わる annotation は `@name` に分けます。[ADR-32](adr/0032-macro-and-annotation-sigils.md) に判断を記録しています。

## 1. 言語のコア哲学

* **すべてはオブジェクトであり、すべては辞書である。**
* **すべての計算は「オブジェクトへのメッセージ送信」によって行われる。**（二項演算子は存在しない）
* 構文規則は極小。キーワードなどの予約語は持たず、制御構文や変数宣言すらもメッセージとマクロで解決する。
* **JavaScriptをコンパイル先とし、必要なランタイムコードを許容する。**

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

コンパイル時にASTを展開・変換するための仕組みです。名前付きマクロは `%name` を使い、`#name` は常にシンボルです。将来の汎用マクロでは、中身をトークンツリーとしてマクロ関数に渡す方針です。
数式の解決（二項演算子のエミュレート）にはビルトインマクロ `$()` を使います。

現在実装されているのは `$()`、パイプライン右辺の `%extend(...)`、親実装を呼ぶ `%super(...)` です。以下の `%regex`・`%let`・`%const`・`%import` は将来設計です。未定義・未対応のマクロ呼び出しはコンパイルエラーになり、シンボルとしての解釈には切り替わりません。

```
// インラインマクロ
$(1 + 2 * 3) print.
%regex(^abc.*$) match: 'abcdef'.

// ステートメントマクロ（文の先頭で使い、対応する括弧の外にあるピリオドまでを引数とする）
%let x = 100.
%const secret = 42.
%import $Math as: M.
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

クラスは存在しません。既存のオブジェクト（辞書）を複製（`clone`）し、スロット（プロパティやブロック）を拡張（`%extend` マクロ）することで新しいオブジェクトを定義します。未知のメッセージは暗黙的に親（プロトタイプ）へ委譲されます。

### オブジェクトの定義と継承

```
// 親オブジェクトの定義
#Animal bind: $Object clone |> %extend(
    name: 'Unknown',
    bark: {
        $self name print.
        'Bow wow!' print.
    }
).

// 子オブジェクトの定義（継承）
#Dog bind: $Animal clone |> %extend(
    name: 'Pochi',

    // メソッドのオーバーライドとsuper呼び出し
    bark: {
        %super().
        'Woooo!' print.
    }
).

// 実行
$Dog bark.
```

### `$self` のセマンティクス

`%super()` は現在と同じキーの親実装を引数なしで呼びます。引数を渡す場合は `%super($x, $y)` と明示し、現在の引数を暗黙転送することはありません。探索は実行中のメソッドを選んだスロット所有者の親から開始し、`$self` のレシーバは維持します。継承した上書きメソッドでも、同じ上書きへ再帰しません。

親のスロットは呼び出し時に探索します。遅延ブロックも親呼び出しの文脈を保持して `value` で利用できますが、別のメソッドとして呼ばれると新しい文脈を使います。文脈や親実装がない場合は、明示引数を評価した後にランタイムエラーになります。String キーでは最後に Object prelude を使えます。Symbol キーでは使いません。詳細は [ADR-36](adr/0036-parent-calls.md) を参照してください。

ブロック内で `$self` を参照すると、ランタイム（またはコンパイル時のα変換）によってレシーバ自身が解決されます。JSにコンパイルする際は、レキシカルスコープの恩恵を受けて衛生的に変換されます。

### 動的なメッセージ呼び出し（実装済み）

Object は `perform:` で引数なし、`perform:withArguments:` で配列に並べた引数を渡せます。文字列とシンボルのキーは区別され、継承先を検索します。メソッドの `$self` は実際のレシーバです。

```text
#obj bind: ($Object clone |> %extend(
    (#sum): { left, right -> $left add: $right }
)).
($obj perform: #sum withArguments: [2, 3]) print.
```

引数の数は Block のパラメータ数と一致させます。キーの綴りやコロンの数は、保存した Block の引数の数を制約しません。String で prelude を選ぶ場合は、そのメッセージの引数の数を検証します。詳しくは [ADR-31](adr/0031-perform-without-arguments.md) と [ADR-33](adr/0033-perform-with-arguments.md) を参照してください。

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
$module |> #exports bind: ( $Object clone |> %extend(
    pi: 3.14159,
    calc: { x -> $internalCalc value: x }
) ).
```

### ユニークキーによるメソッドへのアクセス（Symbolの活用）

`$Symbol generateUnique` は実装済みで、呼び出すたびに新しいシンボルを作ります。辞書のキーとして使い、キーを共有した相手だけがそのメッセージを選択できます。名前付きシンボルから同じキーを再生成することはできませんが、キーの共有や将来の相互運用も含めた絶対的な秘匿性を保証するものではありません。表示は `<unique>`、検査用表示は `#<unique>` で、表示文字列は識別子ではありません。[ADR-34](adr/0034-unique-symbols.md) を参照してください。以下のモジュール構文は将来設計です。

```
#PRIVATE_DIGEST bind: $Symbol generateUnique.

$module |> #exports bind: ( $Animal clone |> %extend(
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
} handleWith: ( $Object clone |> %extend(
    FileNotFound: { resume ->
        'Warning!' print.
        // デフォルト値を返して処理を再開させる
        resume value: '{"theme": "dark"}'.
    }
) ).
```

---

## 7. 型注釈（オプション）

将来機能として、推論器やLSP（Language Server Protocol）を助けるコロン `:` による型注釈を検討しています。コンパイル時の型情報として扱う方針で、以下の構文は未実装です。呼び出しに関わる `@name` annotation とは別の機能であり、両者の関係は未決定です。

```
%let count: Int = 0.

#greet bind: { name: String ->
    $('Hello, ' + name)
}.
```

## 8. Annotations と Attributes（将来設計）

`@name` は呼び出しに関わる annotation 用の接頭辞です。annotation の宣言によって、実行時の呼び出しとして処理するか、コンパイル時に展開するかを決める方針です。コンパイラが展開方法を知る宣言であれば、annotation 自体への呼び出しを生成せずに済みます。ただし、展開結果に検査などの実行時処理が残る場合もあり、実行時コストが常にゼロになる保証ではありません。

明示的な `%name` マクロと annotation は、内部の展開機構を共有することが考えられます。annotation の宣言方法・適用対象・引数・合成・名前解決の詳細は未決定で、`@name` は未実装です。

Attributes は対象にデータを付ける仕組みで、それ自体は呼び出しへの介入を要求しません。表現・付与・取得・寿命の決定は延期し、接頭辞も割り当てません。
