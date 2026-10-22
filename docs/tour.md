# Toss Language Tour

この文書は将来設計を含む言語ツアーです。実装済みの範囲は [README](../README.md) を参照してください。名前付きマクロは `%name`、シンボルは `#name`、呼び出しに関わる annotation は `@name` に分けます。[ADR-32](adr/0032-macro-and-annotation-sigils.md) に判断を記録しています。

`mise exec -- deno task repl` で、束縛やローカルマクロを保持しながら式を試せます。入力は通常どおり `.` で終え、結果を `inspect` で表示します。初版の範囲と操作は [README の REPL 節](../README.md#try-the-repl) と [ADR-44](adr/0044-initial-repl.md) を参照してください。

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

コンパイル時に構文を展開・変換するための仕組みです。名前付きマクロは `%name` を使い、`#name` は常にシンボルです。ファイル内の式マクロでは、括弧内を通常の式として解釈する前に、位置とスコープを持つトークンツリーとして展開 Block に渡します。
数式の解決（二項演算子のエミュレート）にはビルトインマクロ `$()` を使います。

現在実装されているのは `$()`、パイプライン右辺の `%extend(...)`、親実装を呼ぶ `%super(...)`、ローカルモジュールの `%import(...)`・`%export(...)`、JavaScript の式を評価する `%js(...)`、JS モジュールを読み込む `%jsImport(...)`、非同期 Block と待機の `%async(...)`・`%await(...)`、式マクロを定義する `%macro(...)` と共有定義を読み込む `%macroImport(...)` です。式マクロと引用構文は第10節で説明します。以下の `%regex`・`%let`・`%const` は将来設計です。未定義・未対応のマクロ呼び出しはコンパイルエラーになり、シンボルとしての解釈には切り替わりません。

```
// インラインマクロ
$(1 + 2 * 3) print.
%regex(^abc.*$) match: 'abcdef'.

// ステートメントマクロ（文の先頭で使い、対応する括弧の外にあるピリオドまでを引数とする）
%let x = 100.
%const secret = 42.

// ローカルモジュール（実装済み。通常のバインドで別名を付ける）
#M bind: %import('./math.toss').
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

ファイルごとに独立した環境（辞書）と `$Object`・`$Symbol` のルート Object を作り、ランタイムコードは共有します。`%export(値).` で1つの任意の値を公開し、`%import('./math.toss')` で取得します。公開した Block は定義元の環境を保持します。依存先にはファイル直下の export が1つ必要で、エントリーファイルでは省略できます。export 後も処理を続け、ファイル全体が正常終了してから公開値を返します。

相対パスは import 元から解決し、`.toss` を明記します。Block 内での import も可能で、初期化は最初に式を実行した時の一度だけです。依存先の収集・検証は未実行の分岐も含めてコンパイル時に行い、循環参照はエラーにします。公開値と初期化失敗はファイル単位でキャッシュし、同じファイルを再実行しません。標準ライブラリの参照方法は延期します。JS パッケージ・URL は第9節の `%jsImport` を使います。[ADR-37](adr/0037-local-modules.md) に記録しています。

```
// --- math.toss ---

// ファイル内だけのプライベート変数（自動的にカプセル化される）
#secretMultiplier bind: 42.

// プライベート関数
#internalCalc bind: { x -> $(x * $secretMultiplier) }.

// 外部への公開
%export($Object clone |> %extend(
    pi: 3.14159,
    'calc:': { x -> $internalCalc value: $x }
)).

// --- main.toss ---
#Math bind: %import('./math.toss').
($Math calc: 2) print.
```

### ユニークキーによるメソッドへのアクセス（Symbolの活用）

`$Symbol generateUnique` は実装済みで、呼び出すたびに新しいシンボルを作ります。辞書のキーとして使い、キーを共有した相手だけがそのメッセージを選択できます。名前付きシンボルから同じキーを再生成することはできませんが、キーの共有や将来の相互運用も含めた絶対的な秘匿性を保証するものではありません。表示は `<unique>`、検査用表示は `#<unique>` で、表示文字列は識別子ではありません。[ADR-34](adr/0034-unique-symbols.md) を参照してください。

```
#PRIVATE_DIGEST bind: $Symbol generateUnique.

%export($Object clone |> %extend(
    eat: { food ->
        // 内部メッセージの呼び出し
        $self perform: $PRIVATE_DIGEST.
    },

    ($PRIVATE_DIGEST): {
        'Digesting in secret...' print.
    }
)).
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

## 9. JavaScript との相互運用（実装済み）

`%js(...)` 内は JavaScript の式一つとして解釈します。関数式の本体には文を書けるため、即時呼び出しで複数の処理も実行できます。

```text
%js(Math.max(3, 7)) print.
%js((() => { const n = 3; return n * 2; })()) print.

#n bind: 3.
%js(x = $n; Math.max(x, 7)) print.
```

`;` の前に `JS側の名前 = Toss式` をカンマ区切りで並べると、Toss の値を渡せます。各 Toss 式は元の Environment で左から右へ一度ずつ評価します。JS 側の名前は再代入できず、strict mode でホストのグローバル値とともに利用できます。生成コード内部の変数は公開しません。`;` の区切りがなければ全体が JS 式なので、`%js(obj.x = 1)` の代入も可能です。

JS の文字列・有限数・Boolean は通常の Toss 値、`null` と `undefined` は Nil になります。Object・Array・Function は `<js>` と表示する JS 参照値で、`toString`・`inspect`・`print`・`dump` のみを受け取ります。再び `%js` に渡すと元の JS 値を利用できます。同じ JS オブジェクトは同じ参照値を使います。非有限数・BigInt・Symbol の戻り値はランタイムエラーです。

Toss Object・Array・Symbol は元の値を JS に渡すため、変更を共有します。直接の Block 渡しはエラーにしますが、Object や Array の内部まで走査しません。JS の戻り値は出自によらず変換するため、渡した Toss Array を返しても JS 参照値になります。Block は後述の `asJSCallback` で明示的に変換できます。

Promise は参照値として扱い、自動で待ちません。外側の `await` は未対応ですが、async 関数式は利用できます。JS 構文エラーはコンパイル時に報告し、JS 例外は元の原因を保持して `%js` の位置を示すランタイムエラーにします。ホスト API の権限や副作用は通常どおりで、`console.log` の出力は Toss が捕捉しません。[ADR-38](adr/0038-javascript-expressions.md) に記録しています。

### JS モジュールの読込

```text
#path bind: %jsImport('node:path').
%js(module = $path; module.basename('/tmp/hello.txt')) print.

#hono bind: %jsImport('npm:hono@4.12.12').
#app bind: %js(module = $hono; new module.Hono()).
```

`%jsImport` は ESM 名前空間の JS 参照値を返します。名前付き export は `module.Hono`、default export は `module.default` のように `%js` 内で利用します。引数は空でない文字列リテラル1つに限定し、バックスラッシュや ASCII 空白・制御文字を拒否します。パッケージ名・ホストのスキーム・絶対 URL を渡せますが、相対パス・ルートからのパス・Windows ドライブパスは未対応です。

同じ指定文字列の import は生成ファイル全体で1つにまとめます。static import なので、未実行の Block や未初期化の Toss 依存先に書いた JS import も Toss 本体より先に初期化されます。コンパイラは JS モジュールを読み込まず、実行ホストが解決・初期化・エラー報告を担います。Toss の `%import` は引き続き遅延初期化です。ローカル式マクロは実行時の `%jsImport` を生成できますが、展開中の読み込みはできません。[ADR-40](adr/0040-static-javascript-imports.md) と [Hono の読込例](../examples/hono/imports.toss) を参照してください。

### JS コールバック

```text
#callback bind: { n -> $n add: 1 } asJSCallback.
%js(callback = $callback; [1, 2, 3].map(callback).join(',')) print.
```

Prelude の `asJSCallback` は Block から JS 関数の参照値を作ります。JS 側から呼ぶと、Block の引数個数分だけを左から右に Toss 値へ変換し、余分な引数は変換前に無視します。不足する引数はエラーです。明示的な `undefined` は引数として数え、Nil に変換します。通常の Toss Block 呼び出しは、従来どおり引数個数の完全一致を要求します。

戻り値は既存の Toss→JS 規則を使います。JS 参照値は元の値に戻すため、Hono の Response を返せます。Nil は `null`、普通の Block を直接返すとエラーになります。Object や Array の中身までは変換しません。Promise の参照値は返せますが、Toss の処理を中断して完了を待つ機能はまだありません。

同じ Block の変換は同じコールバックと参照値を返し、異なる Block は別のコールバックになります。JS の `this` は無視し、捕捉した変数・`$self`・親メソッド・マクロのスコープを維持します。呼び出しごとに新しいローカル Environment を作ります。Block 本体のエラーは元の位置を保って JS に伝え、外側の `%js` が捕捉した場合は既存の cause として保持します。境界の変換エラーは、最初に `asJSCallback` を実行した位置を示します。

```text
#handler bind: { context ->
  %js(c = $context; c.text('Hello, Toss!'))
} asJSCallback.
%js(app = $app, handler = $handler; app.get('/', handler)).
```

Hono が Context と Next を渡しても、Context だけを使う1引数の Block を書けます。展開中のマクロはホストのコールバックを作れませんが、実行時の変換メッセージを生成できます。[ADR-41](adr/0041-javascript-callback-adapters.md) と [JSON 応答・標準ミドルウェアを組み合わせた例](../examples/hono/callbacks.toss) を参照してください。

### 非同期 Block と await

```text
#handler bind: %async({ context ->
  #body bind: %await(%js(c = $context; c.req.json())).
  %js(c = $context, body = $body; c.json(body))
}) asJSCallback.
%js(app = $app, handler = $handler; app.post('/echo', handler)).
```

`%async` はリテラルの Block 一つを受け取り、`%await` は Toss の式一つを受け取ります。どちらも `(` を隣接させます。非同期 Block の呼び出しは本体の実行を始め、`<js>` と表示する非同期結果を返します。`%await` は式を一度だけ評価して待機し、その呼び出しを中断します。通常値の待機でも非同期の継続になります。

Toss の非同期結果を待つと、元の Toss 値と同一性を保ちます。Array はそのまま Array、Block はそのまま Block です。通常値を待つ場合も値を変換せず、普通の Toss Object の `then` スロットを Promise として扱うこともありません。JS 参照値は JavaScript の await・thenable 規則で解決してから、既存の JS→Toss 変換を適用します。そのため JS の Promise が返した Array は JS 参照値になります。

Block ごとに非同期境界を区切ります。外側が非同期でも、内側の通常 Block は await できません。必要な分岐を `%async` にし、選んだ結果を外側で待ちます。以下は非同期 Block 内の式です。

```text
%await($condition ifTrue: %async({
  %await($promise)
}) ifFalse: {
  42
})
```

通常のメッセージや配列操作は自動で待機しません。最後の式が Block の結果になり、その式が別の非同期結果であっても暗黙には待ちません。必要な完了値を得るには明示的に `%await` を使います。ファイル直下の await・Toss モジュールの非同期初期化・展開中のマクロによる非同期実行は未対応です。マクロが実行時の非同期構文を生成することはできます。

非同期結果を JS に渡すと、安定した同一性を持つ Promise を公開し、完了値を既存の Toss→JS 規則で変換します。`asJSCallback` はこの Promise を Hono に返せるため、Response の参照値も元の Response として届きます。内部だけで待つ Toss 値は、JS への変換を強制されません。本体の失敗は元の位置とマクロ展開トレースを保って reject し、JS 由来の reject は待機位置を示すランタイムエラーと元の cause を持ちます。

[Hono サンプルアプリ](../examples/hono/README.md) は、共通の `app.toss`、HTTP 起動用の `main.toss`、メモリ内検証用の `verify.toss` に分かれています。`main.toss` から生成した JS にポート番号を渡し、Deno の localhost ネットワーク権限を付けて起動します。検証側は並行 POST・不正 JSON・ミドルウェアの順序と応答ヘッダを確認します。[ADR-42](adr/0042-explicit-async-blocks.md) に記録しています。

## 10. ユーザー定義の式マクロ（実装済み）

`%macro(#name, { syntax -> ... }).` をファイル直下に置き、定義より後で `%name(...)` を使います。展開 Block は入力の構文オブジェクトを受け取り、式一つ分の構文を返します。

```text
%macro(#show, { syntax ->
    %`((%,($syntax)) print)
}).
%show(1 add: 2).
```

`%quote(...)` は中身を実行せず、そのまま構文にします。quasiquote はパーセント・バッククォート・括弧の順に書き、`%,(...)` で構文一つ、`%,@(...)` で構文オブジェクトの Array を差し込みます。カンマなどの区切りは自動では補いません。

```text
%macro(#pair, { syntax ->
    #items bind: [%quote(1), %quote(,), %quote(2)].
    %`([%,@($items)])
}).
%pair() dump.
```

構文は不変です。`kind` は `#token` または `#group` を返します。グループの `children` は子要素の Array のコピー、`delimiter` は `'()'`・`'[]'`・`'{}'` または構文列を示す `''`、トークンの `spelling` は元の綴りです。Array の `map:` や `reduce:with:` を使って構文列を加工できます。

生成した束縛は呼び出し側と衝突せず、差し込んだ構文の参照先は保持します。生成した自由参照は定義側のスコープで解決し、Named Symbol の値の同一性は変えません。呼び出し側を意図的に捕捉する API は将来設計です。生成したマクロ呼び出しは再帰的に展開し、それぞれの構文が持つスコープと定義順序で名前を解決します。

展開ごとに新しいコンパイル時 Environment を使います。基本の値と構文 API を利用でき、通常の実行時バインディングや外部入出力は利用しません。生成した構文には実行時の `%js`・`%import`・`%super` を含められます。展開自体はメソッド呼び出しを増やさず、`%super` は実行箇所のメソッド文脈を使います。

構文の位置と展開経路を診断に残し、過剰な展開や計算はコンパイラの上限でエラーにします。文の生成、実行時の quote、任意の DSL 用字句規則は後続にします。[ADR-39](adr/0039-user-defined-expression-macros.md) に記録しています。

`%macroImport('./macros.toss').` はマクロ定義だけを含むファイルを読み込む、ファイル直下の宣言です。相対 `.toss` パスを使い、宣言より後で読み込んだマクロを利用します。実行時の `%import` とは別で、ライブラリ本体の実行時初期化はありません。同じ正規化済みファイルの再読込は重複させず、異なる定義との名前衝突はエラーにします。

ライブラリは利用側ごとにマクロの文脈へ組み込まれます。生成した実行時の自由参照は利用側のファイルルート、差し込んだ式は呼び出し側のスコープを使います。共有するマクロはアダプターやアプリなどの実行時依存を引数で受け取る形にします。ライブラリから別のマクロライブラリを読み込む機能、別名・選択的公開は後続にします。[ADR-43](adr/0043-macro-library-imports.md) を参照してください。
