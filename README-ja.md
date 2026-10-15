# Toss ⚾️

> **すべては辞書であり、すべてはメッセージ。予約語はゼロ。**

**Toss**（仮称）は、コンピュータサイエンスの歴史において最も美しい概念たちを、わずか「5つの構文規則」に凝縮した、極小かつ純粋なオブジェクト指向言語です。

Smalltalkの動的なメッセージパシング、Lispのメタプログラミングの力、そしてJavaScriptのプロトタイプチェーンにインスパイアされています。オブジェクト間で軽快にキャッチボール（Toss）をするようにコードを書くことができ、クリーンでモダンなJavaScriptへと1対1でトランスパイルされ、Node.jsやDeno上でシームレスに動作します。

## ✨ Tossの特徴

* **予約語ゼロの無限の表現力:** `class` や `if`、`let` すら存在しません。制御構造や宣言はすべて「メッセージ」と「衛生的なマクロ (`#`)」によってエレガントに処理されます。
* **純粋なメッセージパシング:** すべての計算はオブジェクト（辞書）にメッセージを投げることでのみ行われます。
* **パイプライン・ファースト:** パイプライン演算子 `|>` により、データは自然に左から右へと流れ、次のメッセージの最後の引数として暗黙的に注入されます。
* **摩擦ゼロのJS連携 & トランスパイル:** 実行時のオーバーヘッドなしで完璧なJavaScriptへコンパイルされます。衛生的なα変換により `$self` の束縛も自動的に解決されます。
* **代数的エフェクトの組み込み:** `try/catch` の定型文を排除し、ブロックと辞書だけで完結する高度なエラーハンドリング（エフェクトハンドラ）を実現しています。

## 🚀 A Glimpse of the Syntax

```
// 1. Statement Macros for clean declarations
#import $Math as: M.
#const baseRate = 10.

// 2. Prototype-based inheritance & 3. Block closures
#Dog bind: $Animal clone |> #extend(
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
