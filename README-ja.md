# Toss ⚾️

> **すべては辞書であり、すべてはメッセージ。予約語はゼロ。**

**Toss**（仮称）は、コンピュータサイエンスの歴史において最も美しい概念たちを、わずか「5つの構文規則」に凝縮した、極小かつ純粋なオブジェクト指向言語です。

Smalltalkの動的なメッセージパシング、Lispのメタプログラミング、JavaScriptのプロトタイプチェーンに着想を得ています。小さなランタイムを伴うJavaScriptへコンパイルします。現在のコンパイラの開発・実行環境はDenoです。

## シンボル・マクロ・annotation

| 記法 | 役割 | 実装状況 |
| --- | --- | --- |
| `#name` | 実行時の値である名前付きシンボル | 実装済み |
| `$name` | バインディングの参照 | 実装済み |
| `%name(...)` | 名前付きコンパイラマクロの明示的な呼び出し | 組み込みマクロと、ファイル内で定義する式マクロが実装済み |
| `%name ... .` | ステートメントマクロ | 将来設計 |
| `@name` | 呼び出しに関わる annotation | 将来設計。宣言・適用構文の詳細は未決定 |
| `$()` | 専用の数式マクロ | 実装済み。数式内の `%` は剰余演算子 |

annotation は、宣言によって実行時の呼び出しとして処理するか、コンパイル時に展開するかを決める方針です。展開によって annotation 自体への呼び出しを省けますが、展開結果に実行時の処理が残る場合もあります。

Attributes はデータの付与を表し、その表現・構文の決定は延期します。`@name` は annotation 用です。コロンによる型注釈は別途検討する将来機能です。詳しくは [ADR-32](docs/adr/0032-macro-and-annotation-sigils.md) を参照してください。

既存の `#extend(...)` は `%extend(...)` に変更しました。`#extend` 自体は通常のシンボルです。実装済みの範囲と実行可能な例は [README](README.md) にあります。

## ✨ Tossの特徴

`%macro(#name, { syntax -> ... }).` で式マクロを定義し、定義後に `%name(...)` で使えます。`%quote(...)` は構文をそのまま返し、quasiquote はパーセント・バッククォート・括弧の順に書きます。その内部で `%,(...)` は構文一つ、`%,@(...)` は構文の Array を差し込みます。構文オブジェクトは位置とスコープを保持し、生成した束縛が呼び出し側の変数を暗黙に捕捉しないようにします。展開処理は実行時と別の Environment で動きます。[ADR-39](docs/adr/0039-user-defined-expression-macros.md) と [実行例](examples/macros.toss) を参照してください。

`%js(Math.max(3, 7))` で JavaScript の式を評価できます。`%js(x = $n; Math.max(x, 7))` のように Toss の値を明示的に渡します。文字列・有限数・Boolean は通常の Toss 値、`null` と `undefined` は Nil、Object・Array・Function は `<js>` と表示する専用の参照値になります。参照値への操作は再び `%js(...)` を使います。渡した Toss Object・Array の変更は共有され、直接の Block 渡しはエラーです。Promise は自動で待ちません。[ADR-38](docs/adr/0038-javascript-expressions.md) と [実行例](examples/javascript.toss) を参照してください。

ローカルモジュールは `#Math bind: %import('./math.toss').` で読み込みます。依存先はファイル直下の `%export(値).` で1つの値を公開し、ファイル全体の実行後に返します。初期化は最初の import 実行時に一度だけ行い、依存先をまとめた単一 JavaScript を生成します。標準ライブラリの参照方法は未決定です。[ADR-37](docs/adr/0037-local-modules.md) と [実行例](examples/modules/main.toss) を参照してください。

Object の動的呼び出しは `perform:` と、引数を配列で渡す `perform:withArguments:` に対応しています。文字列とシンボルは別のキーとして扱い、継承したメソッドにも実際のレシーバを `$self` として渡します。実行例は [perform-arguments.toss](examples/perform-arguments.toss)、仕様は [ADR-33](docs/adr/0033-perform-with-arguments.md) を参照してください。

`$Symbol generateUnique` は呼び出すたびに新しいシンボルを作ります。名前から再生成できず、動的キーとメッセージ呼び出しに使えます。キーを持つ側はアクセスできます。詳しくは [ADR-34](docs/adr/0034-unique-symbols.md) を参照してください。

シンボルの `equals:` は同一性を比較して Boolean を返します。同じ名前付きシンボルや同じ値の別名は等しく、別々に生成したユニークシンボルは等しくありません。シンボル以外の引数はエラーです。[ADR-35](docs/adr/0035-symbol-equality.md) に記録しています。

`%super()`・`%super($x, $y)` は、現在と同じキーの親実装を呼びます。引数は常に明示し、暗黙転送は行いません。探索は選ばれたスロットの所有者の親から開始し、元のレシーバを維持します。[ADR-36](docs/adr/0036-parent-calls.md) と実行例 [super.toss](examples/super.toss) を参照してください。

* **予約語ゼロの無限の表現力:** `class` や `if`、`let` すら存在しません。制御構造や宣言はすべて「メッセージ」と「衛生的なマクロ (`%`)」によってエレガントに処理されます。
* **純粋なメッセージパシング:** すべての計算はオブジェクト（辞書）にメッセージを投げることでのみ行われます。
* **パイプライン・ファースト:** パイプライン演算子 `|>` により、データは自然に左から右へと流れ、次のメッセージの最後の引数として暗黙的に注入されます。
* **JavaScriptへのコンパイル:** メッセージ送信と `$self` をランタイムで支えます。`%js(...)` で明示的に JavaScript と連携できます。さらなる最適化は将来設計です。
* **代数的エフェクトの組み込み:** `try/catch` の定型文を排除し、ブロックと辞書だけで完結する高度なエラーハンドリング（エフェクトハンドラ）を実現しています。

## 🚀 A Glimpse of the Syntax

以下は将来の言語設計を含む例です。`%const` のようなステートメントマクロは未実装です。

```
// 1. Statement Macros for clean declarations
#M bind: %import('./math.toss').
%const baseRate = 10.

// 2. Prototype-based inheritance & 3. Block closures
#Dog bind: $Animal clone |> %extend(
    name: 'Pochi',
    bark: {
        $self name print.
        'Woof!' print
    }
).

// 4. Pipelines & 5. Message Passing
[1, 2, 3, 4, 5]
    filter: { x -> $(x % 2 == 0) }
    map: { x -> $(x * $baseRate) }
    |> #results bind:.

$Dog bark.
```
