# Flix のトップページと Toss の能力比較

調査日:
2026-11-11。[Flix のトップページ](https://flix.dev/)が紹介する機能を、現在の
Toss と比較するための検討メモ。Flix
の仕様全体や両言語の優劣を判定するものではない。Toss 側の根拠は
[README](../README.md)、[言語ツアー](tour.md)、[ADR-0](adr/0000-core-concepts.md)、[ADR-42](adr/0042-explicit-async-blocks.md)、[effect 設計メモ](effects-design.md)。

以下の「未実装」は、このリポジトリに同等の言語機能がないという意味であり、その計算自体をプログラムできないという主張ではない。JS
ライブラリで実行できること、Toss
の機能として安全性を保証できること、将来の設計で実現できることは分ける。将来設計は採用済みの製品機能ではない。

## Effect と制御

| Flix の機能・例                                                                          | 現在の Toss                                                                                                                            | 現在の effect 設計との関係                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 利用者定義 effect と handler、時間を差し替える例                                         | effect / handler は未実装。独立した処理を Block や Object の引数として渡す依存性注入は可能                                             | 同期・一回再開の設計が実現すれば、Toss 内の同期的な時計取得の差し替えは表現できる見込み。実行可能性はプロトタイプ待ち                                                                                                                     |
| 複数回再開                                                                               | 未実装                                                                                                                                 | 初期設計は一つの `resume` を最大一回に制限。複数回の分岐探索は直接は表現できず、独立した探索アルゴリズム等は別途可能。将来の採否は未決定                                                                                                  |
| default handler と Clock / Console / Env / FileSystem / Http / Logger / Process / Random | 同等の標準 effect・default handler はない。JS 相互運用でホストの機能は呼べる                                                           | 同期 handler があっても default handler、標準ライブラリやホスト連携は別途必要。未処理 effect はエラーという現設計との整合も必要                                                                                                           |
| HTTP middleware の合成、retry、circuit breaker                                           | Hono の middleware を JS 相互運用や async Block で書ける ([Hono 例](../examples/hono/README.md))。Flix の effect middleware 自体はない | 同期的な handler の合成は検証候補。現在の初期設計は async Block 呼び出し・JS 呼び出し境界を越えないため、一般の非同期 HTTP リクエストを Flix と同じ仕組みで扱えるとは言えない。retry も要求の再実行と同じ continuation の複数回再開は別物 |
| purity と polymorphic effects                                                            | 型・effect の静的追跡や purity の保証は未実装                                                                                          | runtime handler を追加しても静的効果推論は得られない。`%js` はホストの副作用を起こせるため、静的保証には境界を含む別設計が必要                                                                                                            |
| purity reflection                                                                        | 未実装                                                                                                                                 | 関数が純粋かの静的に信頼できる情報と、それを反映する仕組みが別途必要。単なるメタデータだけでは同等の保証にならない                                                                                                                        |
| region-based local mutation                                                              | mutable Array と Object はあるが、領域内に変更を閉じ込め純粋性を保証する型・region はない                                              | `ensure:` の資源 cleanup は提案中だが、所有権・参照の漏出防止・純粋性保証とは別問題                                                                                                                                                       |
| Assertion を effect として表現し test runner で扱う                                      | Toss 本体のテストは Deno で実行するが、同等の言語内 test framework は確認できない                                                      | 同期の一回再開または非再開の handler で一部の assertion の振る舞いを設計できる可能性はある。発見・実行・診断と型情報は別途必要                                                                                                            |

Flix のトップページは、effect system、multi-shot resumption、標準 effect と
default handler
を別々の能力として記述する。[Flix: effects and libraries](https://flix.dev/)。

## データ・抽象化

| Flix の機能                                                                           | 現在の Toss と差分                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| first-class functions                                                                 | Block と lexical closure が実装済み。型付き関数や effect 注釈は同等ではない ([Block](../README.md#blocks-and-closures))                                                                          |
| algebraic data types / pattern matching                                               | 専用の代数的データ型とパターン照合・網羅性検査は未実装。Object・Symbol・分岐で個別にタグ付き値を表す余地はあるが、静的保証はない                                                                 |
| tuples / extensible records                                                           | Array と Object で組や拡張可能なキー付きデータを表せる。Flix の tuple 型や row-polymorphic な構造的 record 型はない ([Object](../README.md#dictionary-objects))                                  |
| mutable structs / region / encapsulation                                              | Object や Array は変更可能で、モジュールの binding は非公開にできる。Flix の region・静的な field 可視性・unboxed field は保証しない ([modules](../README.md#local-modules))                     |
| traits・自動導出                                                                      | 同じメッセージを異なる Object に送り動的な多態性を表現できる。型クラス、instance 検査や自動導出はない                                                                                            |
| parametric polymorphism / higher-kinded types / associated types / associated effects | 動的な Block や Object は種々の値を受け取れるが、これらの型レベルの抽象とコンパイル時保証は未実装。任意の型注釈は構想段階で、これらを備えると決まっていない ([tour](tour.md#7-型注釈オプション)) |
| monadic `forM` / applicative `forA`                                                   | 同等の構文や標準 trait はない。Block、メッセージ、マクロを用いたライブラリ・DSL の可能性はあるが、評価順や短絡、複数エラー蓄積の同等性は実装・検証が必要                                         |

Flix の具体例と型機能の説明は[トップページの機能紹介](https://flix.dev/)を参照。

## 並行処理とホスト

| Flix の機能                                    | 現在の Toss と差分                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| parallelism / structured concurrency / channel | `%async` と `%await` は実装済みで JS Promise と連携できるが、それだけでは並列実行、構造化 concurrency、region 内の子タスク終了保証、CSP channel を提供しない。JS の仕組みを使う場合もホスト側の制約に従う ([ADR-42](adr/0042-explicit-async-blocks.md)) |
| Java 相互運用 / JVM bytecode                   | Toss は JavaScript をターゲットにし、JS modules・expressions・callback を実装。Java や JVM との同等な直接連携は示されていない ([JS expressions](../README.md#javascript-expressions), [modules](../README.md#javascript-modules))                       |
| first-class Datalog                            | 専用の制約構文・統合 solver は未実装。関係・規則をデータで表し solver を実装、または JS 側の solver を利用することは別案だが、Flix の統合された型・構文・最適化との同等性は未検証 ([Flix Datalog](https://flix.dev/))                                   |

## 言語ツール・実装

| Flix の機能・一覧項目                                              | 現在の Toss と差分                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compiler / REPL / diagnostics                                      | compiler、CLI、REPL、位置情報付き診断がある。Flix の範囲や成熟度と同等とは未評価 ([README](../README.md))                                                                              |
| package manager / project test framework / LSP・editor integration | Flix のトップページにある統合機能に対応する Toss 固有の実装は、本リポジトリの README では確認できない。Deno や JS 側のツールを使うこととは区別する                                     |
| string interpolation / expression holes / termination checking     | Flix 相当の専用機能は確認できない。文字列操作や `%js` の JavaScript 構文は別物                                                                                                         |
| full tail call elimination                                         | 言語レベルでの同等の保証は確認できない。JS エンジン任せで保証されると仮定しない                                                                                                        |
| parallel / incremental / resilient compiler architecture           | Flix の主張する compiler 設計に相当する Toss の保証は確認できない                                                                                                                      |
| unboxed primitives / keyword-based syntax                          | Toss は JS 値を直接使い、キーワードメッセージを持つが、Flix の低レベル表現や構文と同一ではない ([ADR-1](adr/0001-initial-implementation-scope.md), [ADR-0](adr/0000-core-concepts.md)) |

## 次に確認するとよいこと

1. Flix の時計差し替えを、まず Toss の既存の依存性注入で表し、その後設計中の同期
   handler と比較する。静的 purity はどちらにも付与しない。
2. ネストした同期 handler、非再開・一回再開、`ensure:`、未処理の effect を Toss
   実装で試作し、JS・async 境界で意図した診断になるか検証する。
3. Flix の HTTP middleware は同期 handler の達成基準に含めず、非同期
   handler、default handler、ホスト連携、エラー・cancellation
   の別の検討項目として扱う。
4. 複数回再開の必要性は、具体的な分岐探索などを使って一回再開や通常のライブラリ実装と比較する。Flix
   に機能があることだけを根拠に Toss への採用を決めない。
5. static effect / purity が必要かは、捕捉漏れや純粋性の保証など、実行時 handler
   では満たせない具体的な利用上の要求から検討する。
