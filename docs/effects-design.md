# Effects and effect handlers: exploration plan

Status: design and feasibility exploration. No syntax or behavior in this note
is implemented or committed as a public language contract. ADR-0 states the
direction; ADR-1 permits runtime support. The examples in the language tour are
illustrative, not an accepted specification.

Run `deno task effects:probe` to execute the exploratory probes together. Some
probes intentionally confirm incorrect behavior in narrowly patched generated
artifacts; their PASS means the limitation was reproduced, not that the Toss
feature is implemented. The probes are separate from the production test suite.

## Goal and sequence

Toss should be able to request an operation, handle it around a computation, and
resume that computation with a value. Resource cleanup should be reliable when
control leaves a protected computation. Start exploring now, and decide whether
to implement only after a prototype demonstrates the trade-offs.

1. Describe concrete synchronous scenarios and candidate semantics (below).
2. Design cleanup alongside effects; assess whether a synchronous `ensure:` for
   normal returns and runtime errors can be delivered independently without
   prejudging its behavior with resumable effects.
3. Prototype synchronous, one-shot resumption across nested Toss calls. Compare
   approaches and their impact on generated code, ordinary programs, the REPL,
   separate runtime output, source locations, and interoperability. Measure
   representative code size and runtime cost before choosing a strategy.
4. Only then specify and implement a minimal public feature, with executable
   integration tests and an ADR for any consequential architectural choice.
5. Extend the design to async Blocks, `%await`, concurrent computations, JS
   callbacks and Promise rejections as separate work. Do not assume that a
   synchronous dynamic handler stack works across asynchronous suspension.

These are ordering gates, not calendar dates. The async work is not a
prerequisite for beginning the synchronous prototype, but its compatibility must
be assessed before committing to a design that prevents it.

## Initial scenarios

The examples describe observable behavior, not Toss syntax:

- A computation requests `FileNotFound`; the nearest matching handler resumes it
  with a default configuration. The request expression produces that value, and
  the computation continues exactly once from the request site.
- An inner handler does not match `FileNotFound`; an enclosing matching handler
  receives it. With no matching handler, execution reports an unhandled effect
  with the request's source location.
- A matching handler returns a value without resuming. The protected computation
  does not continue after the request; the handler's value becomes the result of
  the whole handling expression.
- A handler attempts to resume twice, or to resume after it has returned. Both
  are errors in the proposed first slice. Test the diagnostic and ensure the
  computation cannot run twice.
- A protected resource is released on normal completion, runtime failure, and
  abandonment by a handler. Also test a request that is resumed: cleanup must
  not run prematurely while the protected computation is merely suspended. The
  agreed sections below define ordering and failure precedence.

## Scope of decisions

The agreements below define the intended initial synchronous behavior. Their
implementation feasibility and detailed diagnostics still need verification;
they do not claim that the feature is already implemented. Later async support,
error inspection and optimization are separate work.

## Agreed: handler lookup during a case and resumption

A selected handler is inactive while its case body runs. Requests from the case
body look for an outer matching handler, unless the case body installs another
handler itself. When the case resumes the protected computation, the selected
handler is active again for that computation. Thus another matching request from
the resumed computation can be handled by the same handler. If no active handler
matches a request, it is unhandled. Other agreed sections define the interface
and result; implementation remains open.

## Agreed: resume and handler results

Resume supplies the value of the suspended request and returns the result of the
resumed protected computation to the case body. The case may continue executing;
its final value becomes the handling expression's result. If the case returns
without resuming, its value is likewise the result and the suspended computation
is abandoned. Resume is one-shot and handler-scoped; detailed error reporting
remains open.

## Agreed: effect identity

Both named and unique Toss Symbols can identify effects. Matching uses the
existing Symbol equality rules: named Symbols with the same name match, while
unique Symbols match only the same identity. A library can share a named Symbol
for a conventional effect or expose a unique Symbol to avoid name collisions.
Handler registration and payload are specified below.

## Agreed: effect payload

Each effect request carries one payload, which may be any Toss value. Use Nil
when there is no additional information; use an Object when multiple fields are
needed. The effect's provider and consumers define the payload's meaning; the
language does not inspect its contents. Handler cases receive the payload and
resume capability. Invocation syntax remains undecided.

## Agreed: handler registration and delegation

A handler is a Toss Object whose Symbol keys identify effects and whose values
are case Blocks. Case lookup follows ordinary Object prototype delegation,
allowing inherited cases and overrides. If no slot matches, lookup proceeds to
the next outer handler. A matching non-Block slot is an error, as specified
below.

## Agreed: cleanup failures during ordinary completion or failure

If the protected computation fails and cleanup also fails, preserve the body
error as primary and retain cleanup errors as associated information. If the
body succeeds but cleanup fails, propagate a cleanup error. When multiple
cleanups are due, run all of them from inner to outer even if some fail, and
retain each failure. The error representation and display remain open, as do
failure precedence during effect abandonment or an unhandled effect.

## Agreed: cleanup failure on abandonment

When a case returns without resuming, abandon the suspended computation and run
its pending cleanups. If any cleanup fails, the handling expression fails rather
than returning the case value. Run all pending cleanups from inner to outer; the
first cleanup failure is primary and later failures are retained as associated
information. This does not decide how errors are represented or how cleanup
interacts with an unhandled effect or a case that itself fails.

## Agreed: unhandled effects and cleanup

An effect with no active matching handler becomes an unhandled-effect error.
Unwind the exited scopes and run their cleanups from inner to outer. Preserve
the unhandled-effect error as primary if cleanup also fails, retaining cleanup
failures as associated information. The error retains the effect identity and
request source location. The payload is retained but omitted from default
output.

## Agreed: handler failure and cleanup

If a case fails before resuming, abandon its suspended computation and run
pending cleanups. The case error remains primary; retain cleanup failures as
associated information. If the case fails after resume returns, propagate its
error without repeating the resumed computation or any completed cleanup.
Failure during resumption propagates through the resume call after cleanup.

## Agreed: resume lifetime and usage

Each resume capability may be called at most once and only while its handler
case invocation is active. A second call or a call after the case has returned
fails with a runtime error without running the suspended computation. Each
subsequent effect request receives its own capability. Asynchronous or
multi-shot resumption requires a separate design decision.

## Agreed: invalid handler cases

If case lookup finds a matching Symbol slot but its value is not a Block,
including Nil, report a runtime error rather than trying an outer handler. This
also applies to a slot inherited through the prototype. Only an absent slot
permits lookup to continue outward. Diagnostic details remain open.

## Agreed: effects during cleanup

In the initial synchronous version, performing an effect while cleanup is
executing is prohibited, including effects from indirect calls. A runtime check
must detect the request before dispatch or suspension. Treat the violation as a
cleanup failure: continue other pending cleanups and apply the agreed primary
and associated error rules. An effect handled entirely within a function called
by cleanup is also prohibited in this first version. Whether to allow effects in
cleanup later is a separate design decision.

## Agreed: unhandled-effect payload

An unhandled-effect error retains the original payload but does not include it
in default error output. How Toss code or a JavaScript host can inspect that
payload remains a separate decision; retaining it does not imply an inspection
interface in the initial release.

## Agreed: handler case arguments

Invoke a matching case Block with exactly two arguments in this order: the
payload, then the resume capability. Pass Nil as the payload when no extra
information is needed. The effect identity selects the case and is not passed as
an additional argument. Enforce the existing exact Block arity rule.

## Agreed: requesting an effect

Use `raise:with:` on the Effect object to request an effect, supplying its
Symbol identity and payload explicitly. Pass Nil for no additional information.
This name distinguishes effect requests from the existing Object `perform:`
message for dynamic message dispatch. Use the ordinary Prelude binding
`$Effect`; normal lexical shadowing applies. Its representation and the
implementation of suspension remain undecided.

## Agreed: applying a handler

Send `handleWith:` to a zero-argument Block with the handler Object as its
argument. Run that Block with the handler installed; normal completion returns
the Block's result, while requests follow the agreed lookup and case rules. To
protect an invocation requiring arguments, wrap the invocation in a
zero-argument Block. Exact error diagnostics and runtime implementation remain
open.

## Agreed: invoking resume

A case invokes its resume capability with `value:` and one argument. That
argument becomes the result of the suspended `raise:with:`; the `value:` call
returns the result of the resumed computation. Whether the capability is
represented as an ordinary Block or a dedicated value is an implementation
question; its agreed one-shot and lifetime restrictions apply either way.

## Agreed: ensure result

Send `ensure:` to a zero-argument protected Block with a zero-argument cleanup
Block. If both complete normally, the expression returns the protected Block's
result and ignores the cleanup Block's result. Cleanup failure follows the
agreed error precedence rules. Effect-related behavior remains subject to the
other decisions in this document.

## Agreed: mutable handler objects

Look up the matching case against the handler Object and its current prototype
chain each time an effect is raised. Mutations after `handleWith:` starts affect
later lookups; do not snapshot the cases. A case already selected continues
executing even if its slot is subsequently changed. The next request performs a
fresh lookup.

## Agreed: handler validation

Validate that the handler is a Toss Object before invoking the protected Block.
Reject Arrays, Blocks, JS references and other non-Objects without running the
protected Block. Do not validate all slots in advance; validate a selected case
when its effect is raised, reflecting the Object's current state. This does not
change ordinary evaluation of the receiver and arguments before the message is
invoked.

## Agreed: initial execution boundaries

The initial version supports synchronous Toss call chains. An effect must not
cross a JavaScript call boundary or an `%await` suspension to reach a handler;
report a clear error rather than incorrectly invoking a handler across either
boundary. Whether a handler installed and fully used inside a Toss callback
invoked by JavaScript is feasible will be checked in the prototype. This scope
does not decide how async Blocks interact with handlers in a later version.

## Agreed: request argument evaluation and validation

Evaluate the receiver and arguments using ordinary message-send order before
validating the effect identity. If argument evaluation fails, stop normally;
otherwise reject a non-Symbol identity after payload evaluation, without raising
an effect or invoking a handler. Earlier side effects remain visible.

## Agreed: handler and prototype lookup order

Search each active handler's own slots and prototype chain before moving to the
next outer handler. Consequently, an inherited case in an inner handler wins
over an own case in an outer handler. An invalid matching slot is an error,
including when it is inherited; it does not fall through outward.

## Agreed: handler case receiver

Invoke a selected case as a method with the handler Object as its receiver.
Within the case, `self` is the actual handler Object passed to `handleWith:`,
even when the case slot is inherited. The case retains its lexical environment
and receives the payload and resume capability as its two explicit arguments.
Parent calls follow the agreed ADR-36 rules; prototype feasibility remains to be
verified.

## Agreed: ensure validation

After ordinary evaluation of the receiver and argument expressions, validate
that both the protected receiver and the cleanup are zero-argument Blocks before
invoking the protected Block. Reject a non-Block or wrong arity without starting
the protected computation. Effects of evaluating the expressions remain visible.
Async Block eligibility is a separate decision.

## Agreed: async protected and cleanup Blocks

The initial synchronous `handleWith:` rejects an async protected Block before
running it. Synchronous `ensure:` likewise rejects an async protected Block or
async cleanup Block before running the protected computation. A later async
design must define completion, await, failure and cancellation separately.
Handler case Blocks are a separate decision.

## Agreed: async handler cases

The initial synchronous handler rejects an async case Block when selected,
before invoking its body. As with other case validation, do not inspect every
slot at handler installation time. Async cases require a separate design for
completion and resume lifetime.

## Agreed: synchronous Blocks returning async results

When a synchronous protected Block returns an async result, synchronous
`ensure:` runs cleanup as soon as that Block returns and then returns the async
result; it does not wait for async completion. Synchronous `handleWith:` also
ends its scope when its protected Block returns and returns the async result. An
async Block invocation is itself a boundary: even before its first await, an
effect cannot cross it to an enclosing synchronous handler. Whether a
synchronous handler installed and fully used within the async Block can work
will be checked in the prototype.

## Agreed: parent calls from handler cases

A selected handler case has ordinary method parent-call context. `%super(...)`
uses the existing ADR-36 rules, including the exact Symbol key, selected slot
owner, actual handler receiver, live parent lookup, and explicit arguments. A
case may pass its payload and resume capability to the parent case; sharing the
capability does not relax its one-shot lifetime. Prototype feasibility remains
to be verified.

## Agreed: failure of a resumed computation

If the resumed computation fails, run its pending cleanups before propagating
the error through the `resume value:` call. Preserve cleanup failures according
to the agreed precedence rules. A failed resume is still consumed and cannot be
called again. With no language-level exception handling, the error ordinarily
propagates out of the case; future exception handling is a separate decision.

## Agreed: independent handler installations

Each `handleWith:` invocation creates a distinct handler installation even if
multiple invocations use the same Object. While a selected case runs, the
selected installation is inactive; an outer installation using the same Object
remains eligible. The installations reference the same mutable Object, so each
lookup sees its current slots and prototype. Skipped inner installations are
suspended as described below.

## Agreed: skipped inner handlers during a case

When an outer handler is selected, handler installations inside it belong to the
suspended computation. They are not active while that outer case body runs.
Requests made by the case body search beyond the selected handler (plus any
handlers explicitly installed inside the case body). Resuming reinstates the
suspended inner installations and the selected installation for the resumed
computation. This rule also applies when installations share one Object.

## Agreed: nested handler abandonment

If a case raises another effect and an outer handler returns without resuming,
abandon all suspended computations within that outer installation, including the
case body and the computation it was handling. Run pending cleanups in
inner-to-outer order and invalidate their outstanding resume capabilities.
Cleanup failures follow the agreed abandonment precedence rules.

## Agreed: handler case validation failure

If a selected case is not a Block, is async, or has the wrong arity, report a
runtime error before executing its body. Abandon the suspended protected
computation and run its pending cleanups. Preserve the validation error as
primary and retain cleanup failures as associated information. Earlier effect
request argument evaluation is not rolled back.

## Agreed: resume values

Resume accepts any Toss value and supplies the same value as the result of the
suspended request, preserving identity. An async result or JS reference is
passed as a value; resume does not implicitly await or convert it.

## Agreed: synchronous calls across Toss modules

A synchronous Toss function may raise an effect handled by an enclosing Toss
handler in another module. Handler selection follows the dynamic call chain, not
the module where the function was defined. JavaScript and async boundaries
remain subject to their own restrictions. Effects during module initialization
and their interaction with module caching are a separate decision.

## Agreed: effects during module initialization

A handler may resume an effect raised during synchronous module initialization;
if initialization then finishes successfully, cache its export normally. If a
handler abandons that initialization, record an initialization failure and do
not retry it on subsequent imports; later imports report that initialization was
interrupted. The original handling expression may still return the case's value
if cleanup succeeds. Preserve the existing cache semantics for completed
initialization failures; error representation remains to be specified.

## Agreed: re-entry into suspended module initialization

An initialization suspended by an effect remains in the running state. An import
of that module from its handler case fails with the existing initialization
re-entry error; it does not expose partial exports or start a second
initialization. If that error escapes the case, apply the agreed handler
failure, cleanup and module initialization failure rules.

## Agreed: REPL handler scope

A REPL session may retain handler Objects as ordinary values across cells, but a
`handleWith:` installation ends with its protected call and does not persist
into a later cell. On failure, run pending cleanups and end the installation;
outstanding resume capabilities cannot be used in a later cell. Earlier side
effects remain according to the existing REPL rules.

## Agreed: Prelude Effect value

The Prelude binding `$Effect` supplies a dedicated value whose `raise:with:`
implementation is not user-replaceable. The binding itself follows ordinary
lexical name lookup and can be shadowed; sending a message to a shadowing value
follows that value's ordinary behavior. The value representation and runtime
implementation remain open and must be checked against the Object model.

## Agreed: cleanup returning an async result

A synchronous cleanup Block may return an async result as an ordinary value;
`ensure:` ignores the cleanup result and does not wait for it. Later async
failure is not a synchronous cleanup failure. Awaiting resource release requires
a separately designed async cleanup feature.

## Agreed: handler cases returning async results

If a synchronous case returns an async result without resuming, abandon the
suspended computation, run pending cleanups, and return the async result without
waiting, provided cleanup succeeds. The case has returned, so a resume saved for
later async work is no longer valid. A case that already resumed likewise
returns an async result as an ordinary value. Later async failure is not a
synchronous case failure.

## Agreed: runtime errors are not effects

Existing Toss runtime errors are not automatically converted into effect
requests. An explicit `raise:with:` using `#Error` is an ordinary effect, but
does not intercept unbound-name, wrong-arity or other existing runtime errors.
Runtime errors propagate under existing rules, with `ensure:` cleanup as agreed.
Language-level exception handling remains a separate design.

## Agreed: extent of resumption

Resume continues the suspended computation through nested calls and returns only
when the protected Block of the selected `handleWith:` completes (or fails). Its
result is the Block's result, not merely the result of the function that raised
the effect. Run cleanups as their respective scopes exit before resume returns.
Effects raised during that computation follow the agreed deep handler rules.

## Agreed: resume execution boundaries

In the initial synchronous version, invoking an outer resume capability across
an async Block invocation or JavaScript call boundary is an error, even if its
case is still active and the async Block has not yet reached its first await.
Whether an installation and its resume can be used entirely inside such a
boundary is to be verified in the prototype.

## Agreed: module abandonment with cleanup failure

If a handler abandons module initialization and cleanup within that
initialization fails, the initial handling expression propagates the cleanup
failure under the abandonment rules. Cache an initialization-interrupted error
for the module, retaining failures of its initialization cleanups as associated
information. Later imports report the cached interruption without rerunning the
initializer or cleanups. The cache error and initial propagated error have
different purposes and need not be the same error object.

## Agreed: module failure caused by a handler error

If an effect raised during module initialization reaches a handler whose case
fails, cache the case error as the module's initialization failure. Run pending
cleanups and retain their failures as associated information. Subsequent imports
rethrow the same cached error, consistent with ADR-37, without retrying. This
differs from a case that returns normally without resuming, which records an
initialization-interrupted error.

## Agreed: resume while a case is suspended

A case's resume capability cannot be invoked while that case is suspended by
another effect, even if the capability was passed to an outer case. Report an
error. If the outer case resumes the suspended case, its capability becomes
usable again, subject to the existing one-shot and boundary restrictions. Normal
calls within the running case, including explicit parent calls, are not by
themselves a suspension.

## Agreed: cleanup failure diagnostics

Default CLI and REPL diagnostics display the primary error first, followed by
associated cleanup failures in their execution order, inner to outer. Include
available source locations for each failure. Continue to omit an unhandled
effect's payload from default output. Exact formatting and programmatic error
inspection are separate decisions.

## Agreed: diagnostics for handler failures

Keep the actual failing handler or resumed-code location as the primary error
location. Default diagnostics also identify the effect and request location
being handled, including nested handling context when applicable. Do not show
payloads by default. Exact presentation, retained diagnostic representation and
programmatic inspection remain open.

## Agreed: resume and JavaScript conversion

The initial version rejects conversion of a resume capability to JavaScript,
including `asJSCallback`, even if its internal representation is a Block. This
does not alter conversion of ordinary Blocks or passing JS references as resume
values. A later interop design may revisit the restriction.

## Agreed: resume misuse diagnostics

Report a resume misuse at the invalid invocation location, including repeated,
expired, suspended-case and unsupported-boundary calls. Where available, include
the original effect identity and request location as context without displaying
the payload. Detailed diagnostic formatting remains open.

## Agreed: resume argument evaluation

Evaluate the receiver and argument under ordinary message-send rules before
checking resume validity. If argument evaluation fails, propagate that error; do
not invoke or validate resume. Earlier side effects remain visible.

## Candidate synchronous semantics for the first prototype

The following is a concrete proposal to test, not a committed language contract.
The pseudocode names describe concepts; they do not define syntax.

- A request has an effect identity, a payload, and a source location. Identity
  and payload follow the agreements above. A handling expression installs a set
  of cases only while running its protected computation.
- Find the nearest active matching case in the dynamic call chain. A nonmatching
  handler is skipped, not removed from the suspended computation. A missing
  match raises an unhandled-effect error at the request site.
- Invoke the selected case with the payload and a one-shot resume capability.
  While its case body is running, that handler is not active for requests made
  directly by the case body: those requests can be handled by an outer handler.
  Explicitly installed handlers inside the case body still apply.
- Calling resume with a value makes the suspended request return that value. The
  protected computation continues with its handler active again (a deep
  handler), including handlers skipped during the original lookup. A subsequent
  request can therefore be handled normally, including by the same handler.
- Resume returns the result of the resumed computation to the case body. The
  case body may then do more work; its final result is the handling expression's
  result. If it returns without resuming, that result is also the handling
  expression's result and the suspended computation is abandoned.
- Each individual resume capability can be invoked at most once and only during
  its case invocation. A second or late call is a runtime error; it must never
  execute the suspended computation again. A subsequent request has its own
  capability. Runtime failures propagate rather than silently becoming effect
  requests.

For example, if the protected computation requests a number and then adds 1, a
case that resumes with 10 receives 11 from resume. If it then returns 22, the
handling expression produces 22. A later request made by that same resumed
computation is handled by the installed handler again. By contrast, a request
made directly inside the case body is offered to an outer handler.

## Candidate cleanup behavior

For an `ensure:`-like protected computation, evaluate the cleanup once when that
computation actually exits normally, fails, or is abandoned. Suspending to
invoke a handler is not an exit. When a handler declines to resume, unwind
abandoned scopes from inner to outer before the handling expression completes.
If a handler resumes, cleanup belonging to the resumed computation runs when
that scope exits, before resume returns to the handler. Cleanups outside the
handling expression run only when their own scopes exit.

A useful observable trace for a resource inside the handling expression is:
`acquire, request, handler-before, resume, body-end, cleanup, handler-after`.
Without a resume it is `acquire, request, handler, cleanup`. These traces are
proposed acceptance cases; they do not settle whether abandonment cleanup runs
immediately when a case returns or through another internal mechanism.

Cleanup failure precedence and the initial prohibition on effects during cleanup
are specified above. Verify these rules against any independently implemented
`ensure:` before shipping it.

## Decisions needed before a public interface

- Detailed error representation and diagnostics, including how retained errors
  and unhandled-effect payloads may eventually be inspected.
- How to preserve cleanup and errors across aborts, nested handlers and host
  boundaries, including errors thrown during cleanup.
- Whether a synchronous-only initial feature can provide clear diagnostics at
  unsupported async and JavaScript callback boundaries, without silently
  violating the semantics above.

## Feasibility check: JavaScript generators

A small local JavaScript probe confirmed that `yield*` can propagate a request
through nested generator functions, resume it with a value, and abandon it via
`return()`. It also confirmed the central integration problem: calling a
generator from an ordinary JavaScript function returns an iterator, not the Toss
value the caller expects. Propagating suspension therefore requires cooperation
or transformation across intervening calls; changing only the request and
handler implementations is insufficient for that approach.

A second standalone JavaScript probe confirmed the agreed basic traces for a
generator protected by `try/finally`: resumption completed the body and cleanup
before returning its result to the handler, and `return()` ran cleanup on
abandonment. It did not test nested handlers, Toss dispatch, module caching,
error aggregation, async or JS interop.

This is evidence about one mechanism, not a Toss prototype or proof that another
approach is impossible. Investigate generator conversion, CPS/state machines,
and constrained explicit suspension against the same scenarios. Account for
handler nesting, cleanup, message dispatch, callbacks into JS, async
interaction, code size and unaffected code paths. In particular, assess what
happens when a Toss computation enters host JavaScript and that JavaScript calls
back into Toss; a native JS stack cannot simply be captured by these mechanisms.

## Long-term candidate: static specialization

This is a medium- to long-term investigation, not part of the initial design or
a gate for the synchronous prototype. No production-only optimization is
assumed.

An idea for evaluation, not a design premise: development could use a general
runtime implementation while a production compiler specializes handlers that it
can prove statically. Both modes must preserve the same observable behavior,
including handler selection, evaluation order, resumption, cleanup and errors;
unknown cases must retain a correct general implementation. Optimization can
also apply during development when useful; mode alone is not evidence that a
handler is statically known.

This resembles compile-time macro expansion in its potential to remove runtime
indirection, but a runtime handler can depend on values and dynamic call paths.
Ordinary syntax expansion cannot by itself capture a continuation across
arbitrary calls. Toss's dynamic message dispatch, mutable objects, separate
modules and JS callbacks may prevent a compiler from proving which handler or
callee applies. A handler selected statically does not by itself eliminate the
cost of preserving the continuation. ADR-0's optional type annotations do not
currently provide the effect information used by some published optimizers.

Published work suggests specialization is technically plausible:
[Efficient
compilation of algebraic effect handlers](https://doi.org/10.1145/3485479) uses
type-and-effect information and function specialization to reduce handler
overhead in an Eff-to-OCaml compiler; it is not a result for Toss or JS. The
[Tracing Just-in-Time Compilation for Effects and Handlers](https://se.informatik.uni-tuebingen.de/publications/gaissert2025tracing.pdf)
paper describes ahead-of-time restrictions including statically known handlers
and separate compilation. These results motivate an experiment, not a promise of
low overhead for Toss.

If a general prototype exists, compare it with a specialized variant on the same
programs: a known local handler, a handler selected at runtime, nested handlers,
a handler crossing a module call, and a JS callback boundary. Check result
values, side-effect and cleanup order, unhandled effects and source locations in
both modes. Measure compilation time, generated size and runtime, including a
program with no effects. Reject specialization as an initial implementation
strategy if it requires changing semantics, cannot fall back for unknown cases,
or its complexity outweighs measured gains. Reconsider later if representative
use cases and measurements justify it.

## Candidate: standard libraries backed by effects

Investigate standard Toss interfaces for time, networking, file access and
similar host services, with operations represented as effect requests and host
behavior supplied by handlers. Test handlers could supply deterministic values
or an in-memory implementation. This is an idea, not an accepted interface,
default-handler decision, security boundary or implementation commitment.

Start with a synchronous clock operation as an end-to-end candidate. A handler
can call a host API and resume after that call returns; this is distinct from
letting an effect or resume cross a JS callback boundary. Specify identity,
value representation, test and host handlers, and missing-handler behavior in
the prototype before generalizing.

For HTTP and file I/O, evaluate the constraints of the initial synchronous
handler design separately. A handler may synchronously resume with an async
result which callers later await, but the handler installation then ends; it
does not automatically handle asynchronous completion, rejection, retries or
cancellation. Do not claim parity with async effect middleware without a
separate design. Define host portability, errors and authorization before adding
production adapters. Direct `%js` or other host access bypasses these
interfaces, so handlers alone are not a sandbox.

Static effect tracking in a checker separate from the compiler is a possible
future investigation, deferred independently of the runtime and library design.
Do not assume a checker, a static guarantee, or a particular compiler/checker
architecture in the initial prototype.

## Deferred investigation: local mutation and static checking

Explore region-like local mutation and an optional static checker separately
from the runtime handler design. Neither a region feature nor a checker,
analysis architecture, effect taxonomy or annotation syntax is decided. Flix
regions statically track region-associated mutable values and reject escaping
references; see [Flix regions](https://doc.flix.dev/regions.html).

Candidate scenarios include local mutation used to construct a result; returning
a region-owned mutable value; saving it through a captured closure, an outer
Object, a callback or a JS reference; and mutating pre-existing input. Contrast
these with copying or freezing data before return, accounting for nested values
and aliases. Reading externally mutable values and unknown method calls also
need analysis. Runtime `ensure:` and handlers do not themselves prove that
references cannot escape or that a computation is pure.

Treat arbitrary `%js` conservatively in any future checker: nondeterminism alone
may be too narrow because JS can mutate external state, perform I/O, retain
references, invoke callbacks or throw. `%jsImport` initialization and other host
boundaries also need consideration. A hypothetical unknown or host effect could
conservatively include such behavior; its exact meaning is open. An explicitly
unchecked assumption may be explored separately, but checker results that depend
on it should not be represented as unconditional proofs. Such assumptions must
not silently justify transformations that change program behavior; whether any
optimization may use them is a separate decision. Flix itself documents
[unchecked effect casts](https://doc.flix.dev/unchecked-casts.html) as an unsafe
facility.

## Generator experiment: nested handlers

Run `node experiments/effects-one-shot.mjs` to exercise an isolated JavaScript
generator model. It verifies resumption returning the protected result to the
case, cleanup before the case continues, nested case abandonment with inner to
outer cleanup, and repeated or expired resume rejection. The generator handler
and every participating call cooperate explicitly using `yield*`.

This is not generated Toss code and does not establish integration feasibility.
It does not implement dynamic Object/prototype lookup, `self`/`%super`, module
caching, locations, error aggregation, or async or JS boundaries. In particular
native `finally` failure can replace an earlier exception, contrary to the
agreed error aggregation rules; a production implementation needs explicit
handling. Cleanup that yields is rejected by this experiment. Compare this
approach with other continuation representations before drawing performance
conclusions.

## Experiment: existing Toss `map:` boundary

Run `deno run --allow-run experiments/effects-codegen-boundary.mjs`. The probe
compiles a real Toss `map:` program and runs the generated JavaScript. The
unmodified output prints the two callback values and then the first result.
Changing only that generated Block to a generator causes neither callback body
to run and prints `[object Object]` for the iterator stored as the first result.
The probe patches only an in-memory experimental artifact; it does not change
the compiler or runtime. It demonstrates silent incorrect behavior, not merely a
type mismatch or a failure diagnostic.

The current path is generated Block -> `invokeBlock` (`Reflect.apply`) -> `send`
-> generated expression; `map:`, `filter:`, `reduce:with:`, Boolean branches and
other Prelude operations invoke Blocks and immediately consume their returned
values. A generator approach must propagate suspension through all participating
callers and these Prelude operations, preserving evaluation order, exact arity,
method receiver and parent-call context, source positions, cleanup and module
initialization. A synchronous generator cannot directly capture and resume an
arbitrary intervening JavaScript stack. Supporting a separately compiled runtime
and REPL also requires a coherent protocol at those boundaries. These are
implementation obligations, not proof of a specific transformation strategy.

Selective CPS or a state-machine translation could instead represent the rest of
each computation explicitly and cooperate with message dispatch and Prelude
callbacks. It shares the need to propagate suspension through participating
calls and to delimit host/async boundaries; it does not gain static knowledge of
dynamic calls for free. Whole-program conversion may be simpler to reason about
but could affect code size, runtime overhead and interop. Selective conversion
needs a sound way to handle dynamically selected methods and Blocks without
silently treating a suspending result as an ordinary Toss value.

The next experiment should drive the same callback-under-`map:` scenario with an
actual effect through a transformed call path, then test a dynamically selected
inherited method and cleanup on abandonment. Compare generated size, ordinary
no-effect behavior and overhead with the baseline. Neither generator nor CPS is
selected by this investigation.

The generator model also includes a manually transformed analogue of `map:`: it
snapshots the input and delegates to each callback. The experiment confirms that
requests can resume twice on separate iterations with left-to-right order, and
that abandonment on the first iteration prevents the second callback and runs
enclosing cleanup. This is not the existing Prelude implementation and it does
not yet translate Toss expressions or dynamically dispatched methods.

A further manually transformed dynamic-send probe selects a Symbol-keyed
inherited generator method with `Reflect.get`, preserves the child receiver via
`Reflect.apply`, and resumes an effect inside the method. It checks the receiver
idea only: it does not exercise Toss method lookup, `%super`, error locations or
the actual runtime.

## Experiment: cooperative map in generated Toss output

Run `deno run --allow-run experiments/effects-codegen-map.mjs`. This probe
compiles a real Toss `map:` program and patches the generated JavaScript in
memory: it changes the callback and `map:` to generators, injects a synthetic
request into the callback, and adds a fixed experimental driver around `map:`.
The driver resumes each request with twice its payload. The generated program
prints `2`, `4`, `2`, demonstrating the cooperative callback path.

The same patch fails for an ordinary callback because the generator `map:` tries
to delegate to a plain value. A further experiment explicitly marks the
transformed callback in a WeakSet and branches in `map:`; both the transformed
and ordinary callback then produce their expected output. The explicit marker
avoids identifying an arbitrary Toss result as a generator by its properties.

This hard-coded driver is not `handleWith:` and does not propagate a request
through the caller of `map:`. The probe injects a JavaScript yield, not a Toss
`raise:with:`. It does not solve dynamic methods, callbacks captured in Objects,
parent calls, cleanup, errors, module initialization, host boundaries, or effect
propagation through other Prelude operations. Its string patches deliberately
assert their expected shape, so compiler changes cause the probe to fail rather
than silently changing the experiment. No compiler or runtime source is changed.

## Experiment: suspended handler lifetime

The generator model initially permitted an outer handler to invoke the resume
capability of an inner case suspended by another request. A negative assertion
reproduced the violation. The model now tracks whether each case is suspended
while relaying a request and rejects use of its resume until that case is
resumed. The experiment checks both rejection while suspended and successful use
after the outer handler resumes the case. This bookkeeping remains isolated
experimental machinery, not a Toss runtime implementation.

## Experiment: preserving cleanup failures

Run `node experiments/effects-cleanup-errors.mjs`. A naive JavaScript
`try/finally` demonstrably replaces a body failure with a cleanup failure. An
isolated generator experiment explicitly retains cleanup failures alongside the
original Error object and confirms inner-to-outer ordering; it also confirms
that abandonment with two cleanup failures reports the first and retains the
second.

The experiment accepts Error objects only and associates metadata using a
WeakMap. That is not an adequate production error model: JavaScript can throw
arbitrary values, the same Error object can be reused across separate failures,
and Toss diagnostics, causes and external runtime interfaces need defined
behavior. It does not integrate with the handler prototype, module caching or
CLI/REPL diagnostics. A per-failure representation and treatment of foreign
thrown values must be designed before integrating this technique.

The cleanup probe also compares a per-failure envelope. It keeps separate
cleanup records when the identical Error object is thrown in two independent
executions, and can retain primitive thrown values including `undefined`. Unlike
attaching metadata to a reused Error, this models a failure occurrence. The
experiment throws the envelope internally, however, so it is not drop-in
compatible with Toss: ADR-37 requires later imports to rethrow the same cached
error, while ADR-38 and JS callback tests preserve the original JS thrown value
as `cause`. A future boundary design must preserve these observable identities
and diagnostic data. The experiment does not establish how to expose associated
cleanup failures without losing either identity or failure-specific metadata.

## Experiment: module initialization boundary

Run `deno run --allow-run experiments/effects-module-boundary.mjs`. A real
compiled two-module program imports the same module twice; normally it prints
its initialization side effect once and returns the cached export twice. When
only the generated imported-module initializer is changed into a generator, the
actual initializer body never executes: the existing `initializeModule` caches
the iterator as a successful export. Both imports receive that iterator.

Therefore transforming module bodies alone silently breaks the existing cache
contract. A cooperative implementation must retain the `running` state while
suspended, commit the export only after successful completion, and record
failure or interruption on the appropriate exits, including cleanup failure.
This experiment does not implement those transitions, test module re-entry while
suspended, or choose a continuation representation.

## Experiment: module state while suspended

Run `node experiments/effects-module-state.mjs`. This isolated cooperative state
model verifies that an initializer remains running during suspension, rejects
re-entry, caches the completed export, records abandonment as an interruption,
and rethrows the same original error after an ordinary failure.

An additional test first exposed a distinction lost by a naive generator
`catch`: if cleanup fails during generator `return()`, the cache incorrectly
records that cleanup failure as an ordinary initialization failure. The model
now explicitly marks a delegated `return()` as abandonment: it propagates the
cleanup failure to the current caller but caches a separate interruption with
that failure attached. The delegated-caller case is also tested.

This mechanism is only a small state model. It does not integrate with generated
Toss modules or handlers, represent multiple cleanup failures, implement the
full error-envelope design, handle arbitrary iterator protocols or verify
async/JS boundaries. It assumes cleanup itself cannot suspend and does not
establish a production API.

## Experiment: cooperative generated module initialization

Run `deno run --allow-run experiments/effects-codegen-module.mjs`. This patches
an actual compiled two-module artifact in memory: both initializers, import
calls and `initializeModule` cooperate as generators, and a fixed test driver
handles one synthetic request in the imported initializer. The test checks that
while suspended the imported module is running, a re-entrant import fails, and
after resumption the module initializes once and both imports obtain its export.

A second execution makes the driver abandon the suspended computation. The
naively transformed real module runtime incorrectly keeps the module marked
running, so a later import reports re-entry instead of interruption. This
negative result motivates an explicit abandonment transition such as the
isolated state-model experiment, but that model has not been integrated here.
The probe does not implement Toss effect syntax, handlers, cleanup error
aggregation, async/JS boundaries or a general compiler transformation.

The generated-module probe additionally patches `initializeModule` with a
`finally` transition from running to a cached interruption on abandonment. For
an initializer with no failing cleanup, the subsequent import then reports an
interruption, while the same patch preserves normal completion and caching. This
is not a complete solution: an initializer cleanup failure enters the existing
`catch` before `finally` and still needs explicit abandonment context and error
aggregation. No production generator transform is introduced.

The same generated-module probe now also tries an explicit abandonment-aware
iterator adapter. With one synthetic cleanup failure in the imported module, the
original caller receives that cleanup error and a later import receives a cached
interruption carrying the cleanup failure. This is a patched generated artifact,
not a general compiler or runtime implementation. The experiment uses one
JavaScript Error and does not implement nested cleanup aggregation, stable
public diagnostics, actual Toss handlers, or async and JS boundary enforcement.
A no-cleanup-failure run also confirms normal completion with this adapter.

## Experiment: explicit JS and async boundaries

Run `node experiments/effects-boundaries.mjs`. A small lookup-only model resets
its dynamic handler context on entry to an explicit boundary and restores it on
return. The tests check that an outer handler is unavailable inside the
boundary, a handler installed locally is available, and the outer context is
restored afterward. An async Block analogue checks the boundary both before and
after its first await, including a locally installed synchronous handler.

This is not a continuation implementation or Toss integration. The boundary is
called manually, so it does not establish that all JS callback, async Block,
REPL and host entry points can be identified or instrumented. The toy process
uses global mutable state and provides no guarantee for overlapping execution,
multiple runtime instances, or arbitrary host re-entry. Effects intentionally
fail as unhandled in this model; the agreed distinct boundary diagnostics and
resume restrictions remain unimplemented.

The abandonment-aware generated-module adapter was also exercised with a failure
after resumption: the first caller receives the original Error and a later
import rethrows the same Error object. This checks the existing ordinary
module-failure identity contract for that synthetic path only; it does not
resolve failure-specific cleanup metadata or JavaScript boundary conversion.

## Experiment: generated inherited method and parent call

Run `deno run --allow-run experiments/effects-codegen-super.mjs`. A real Toss
program defines a child override that invokes `%super`, and its inherited parent
method reads `$self` from the actual child receiver. The baseline prints 10. The
in-memory patch transforms those two Blocks, explicitly delegates the parent
call, injects a synthetic request in the parent and drives it at the top-level
send. Resuming with twice the argument produces 13, confirming receiver and
parent lookup on this one generated path. Removing delegation at `%super` causes
the returned iterator to be treated as a normal Object and fails.

This is a fixed source-specific patch, not a general effect transformation. It
does not cover Symbol-keyed handler cases, selected-slot-owner changes during
suspension, all dynamic sends, cleanup, async/JS boundaries, or handler lookup.
The handler is a fixed test driver, not Toss `handleWith:`.

## Experiment: case mutation while suspended

The one-shot generator model now checks a handler case that suspends while an
outer case replaces its registration. When the outer case resumes it, the
already-selected case finishes; a subsequent request selects the new case. This
exercises live case lookup and preserves the selected callable in a Map-based
model. It does not test Toss Object prototype mutation or actual generated
handler dispatch.

## Experiment: generated Toss Block as a handler case

Run `deno run --allow-run experiments/effects-codegen-handler.mjs`. A real Toss
source creates a handler Object inheriting a Symbol-keyed case Block. In a
fixed-shape in-memory rewrite, `map:` and its callback cooperate with a
synthetic request, and a small experimental driver selects the case through
Toss's actual `slotOwner` and `invokeSlot`. The case receives payload and
resume, reads `$self` from the actual child handler Object, and resumes. The
resulting mapped values are 11 and 12.

The source does not use implemented `raise:with:` or `handleWith:`: the test
inserts a JavaScript yield and automatically installs one hard-coded handler
around the `map:` dispatch. Both relevant Toss Blocks and the `resume` call are
specifically rewritten. The original driver handles synchronous resumption only;
it does not support outward requests from a case, unhandled-effect diagnostics,
async/JS boundaries or general dispatch. Its recursive driver has no proven
stack or performance properties. This is one concrete integration path, not an
accepted implementation strategy.

The generated handler probe additionally constructs an alternate case that
returns without resuming. A synthetic `finally` around the patched `map:` runs
when the driver explicitly closes the suspended iterator, and the handler value
is returned afterward. A failing cleanup propagates instead of that value. This
is one synthetic cleanup; it does not implement Toss `ensure:`, failure
aggregation, cleanup during handler failure, or interruption of an imported
module. The initial success path and the alternate abandonment path use separate
in-memory patches.

## Experiment: stack use across repeated resumptions

The generated-handler probe includes a stress case with 10,000 sequential
requests. On the tested Deno runtime, its recursive driver overflows the JS call
stack. A separate in-memory driver for cases that resume exactly once stores
pending case generators in an explicit Array and completes the same case. A
second check confirms that code after resume runs in nested order before the
final mapped values are returned.

This is a feasibility comparison, not a benchmark or a general implementation.
The iterative driver does not implement cases that abandon, cleanup, case-raised
effects, expired capabilities, module initialization, boundaries or diagnostic
rules; it uses a synthetic request protocol that would need robust internal
identity and validation. It allocates pending case frames and no memory or
performance measurements have been made. The observed stack limit is specific to
the tested runtime, not a language guarantee.

The generated-handler probe extends the explicit pending-case stack with a
limited non-suspending abandonment path. It tests immediate abandonment,
abandonment on a later request while an earlier case is waiting, cleanup
execution, and 10,000 successful resumptions. A negative case showed that a
cleanup failure originally skipped cleanup of an earlier suspended case. A
further experimental variant throws that failure into the pending case
iterators, causing their synthetic `finally` blocks to run in order.

A remaining negative case has both the abandoned computation's cleanup and an
outer handler cleanup fail: native generator unwinding replaces the first error
with the second, contradicting the agreed primary-error rules. The variant does
not integrate the separate per-failure error model and is not production-ready.
It also does not cover handler-originated effects, arbitrary errors while a
handler is running, invalid/expired resume calls, real Toss `ensure:`, module
state, or JS/async boundaries. These tests use synthetic JavaScript `finally`
and source-specific in-memory rewrites.

The generated-handler probe combines the explicit pending-case unwind with a
per-failure envelope for the synthetic two-cleanup failure. It retains the
original cleanup failure and the outer handler cleanup failure, and the 10,000
request success case still completes. The probe prints the associated error
separately to prove retention; its output order is not the agreed diagnostic
format.

This narrow technique treats a new error produced while injecting an earlier
failure as an associated cleanup error. That assumption is only justified by the
synthetic test and is not generally established for arbitrary handler code or
host callbacks. The temporary envelope also changes the thrown value within the
experiment. It does not establish JS cause identity, per-module caching, actual
Toss `ensure:`, exact source locations or a supported error interface.

The generated-handler probe also compiles a second Toss source where a child
handler overrides the Symbol-keyed case and calls `%super($payload, $resume)`.
With both cases and the parent call patched to cooperate, the inherited case
still sees the child as `$self`, resumes each request and produces 11 and 12.
This uses existing runtime `invokeSlot` and `parentSend` behavior; it remains a
source-specific patch with a fixed handler driver, not the public feature.

## Experimental AST compiler and runtime slice

`experiments/effects-compiler.ts` uses the actual Toss syntax reader and macro
expander and generates a cooperative generator program from a restricted set of
AST forms. It reuses the existing emitted runtime for lexical Environments,
Object slots, Block arity, method receiver and parent-call context, while an
experimental adapter in `experiments/effects-runtime.ts` handles effect
requests, `handleWith:`, Block calls, Boolean branches, repetition, Array
`map:`, `filter:` and `reduce:with:`, `%extend` and synchronous `ensure:`. It
introduces no public compiler option or production Prelude. Run
`deno run --allow-run experiments/effects-compiler-test.mjs`, or the
`effects:probe` task, to check actual Toss source for dynamic method calls, map,
nested handlers, resumption and abandonment, inherited handler cases, `%super`,
invalid resume lifetimes, source position, evaluation order and unhandled
effects.

This is a vertical slice, not the complete agreed design. It deliberately
rejects quotation at runtime and unsupported AST forms. It permits only a small
set of Prelude messages; unsupported messages fail rather than silently invoking
a callback without propagating suspension. Cleanup failures are recorded
experimentally using a WeakMap keyed by Error, which cannot correctly
distinguish independent failures that reuse the same Error and does not handle
arbitrary thrown values. Its diagnostic formatting is provisional. JS and async
boundary behavior is experimental; it does not yet implement REPL integration,
separate runtimes, tree-shaking, or a full set of diagnostics. The `Effect`
binding and syntax are experimental and must not be treated as released
behavior. These limits are deliberate until the runtime protocol and failure
representation are integrated and verified.

The AST compiler slice now uses an explicit pending-case stack within each
handler rather than recursively invoking the driver on resume. Its Toss-source
scenarios include 10,000 sequential resumptions, a later handler abandoning
through an earlier resumed case, cleanup of a suspended case and body, and
nested cleanup failures. This does not establish bounded stack use for deeply
nested Blocks or nested `handleWith:` scopes, nor does it solve the weakly keyed
error metadata, module, interop or unsupported syntax limitations above.

`experiments/effects-compiler-conformance.mjs` compares 32 supported programs
without effect requests against the production compiler, including lexical
bindings, evaluation order, collection snapshots, inherited methods, `%super`,
extension, and selected runtime failures with their source locations. It checks
observable output and diagnostics for those cases only, not general equivalence.
It is included in `deno task effects:probe`.

The AST/runtime slice now constructs an unhandled-effect error before closing
the suspended computation, retains effect identity and payload on that error,
and reports cleanup failures after the primary error without displaying the
payload. A regression test also covers nested cleanup failures; provisional
formatting walks nested cleanup records in execution order. The existing WeakMap
and Error-only representation limitations still apply.

## Experimental module compilation and runtime

`compileExperimentalEffectsSources` accepts a virtual source map, uses existing
Toss import analysis and graph validation, and emits generator-based module
initializers. Its experimental module runtime maintains running, completed,
failed and interrupted states across effect suspension. The module test runs
real Toss sources through resumption and cached imports, abandonment,
initialization re-entry, cleanup failure, missing dependencies and static
cycles. It instruments generated test artifacts to confirm cached identity for
handler failure and unhandled effects, and interruption metadata after a cleanup
failure; there is not yet a language-level catch to observe those cases.

The slice rejects unsupported messages. It does not implement filesystem module
resolution, REPL module loading, JS module output, an external runtime,
source-map support, or production compilation. Error metadata is still
Error-keyed and experimental. Static dependency collection and validation reuse
existing modules, but the prototype does not claim parity across every loader
edge case.

The AST slice now registers the actual built-in `generateUnique` method for each
module root rather than treating it as an unsupported native method. Tests cover
matching a unique effect Symbol, rejecting a different unique Symbol without
displaying its payload, and sharing a unique Symbol through a module export.
Arbitrary native methods remain unsupported in this experimental path.

The experimental runtime also records handler request context on errors: the
original failure remains primary, and default output identifies the handled
effect and request location without printing payloads. Toss-source tests cover
nested handler contexts and ordering. The context table currently shares the
same Error-keying and repeat-reporting limitations as cleanup metadata; it is
not a final diagnostic representation.

`deno task effects:demo` runs `experiments/effects-demo.toss` with the isolated
experimental compiler. It demonstrates two handled requests and cleanup using
simulated time and file contents; it does not access a real clock or file
through an effect library. The same demo is checked by `effects:probe`.

The experimental runtime supports `perform:` and `perform:withArguments:`
through cooperative dispatch, including Symbol and unique-Symbol method keys.
Tests compare ordinary dynamic dispatch and error validation with the standard
compiler, and exercise an effect raised by the dynamically selected method.
Prelude fallbacks remain subject to the slice's explicit supported-message
restrictions; not all runtime messages have been adapted.

## Experimental JavaScript boundary

The AST slice compiles `%js` using the existing ahead-of-time evaluator
collection and supports synchronous `asJSCallback` adapters for effect-aware
Blocks. A fresh boundary is installed for each JavaScript entry and callback.
Requests that escape a callback fail at that boundary; a handler entirely inside
the callback can handle its own requests. Resuming across the boundary and
converting a resume capability to a JS callback are rejected. A boundary token
also guards a resume hidden inside an Object passed to `%js`.

`experiments/effects-js-boundary-test.mjs` tests these paths, callback identity
and argument conversion, errors during cleanup, and preservation of a JS thrown
value as `cause`. Callback errors are formatted before being passed into JS so
that cleanup information is retained if the existing JS-expression wrapper adds
a cause. The underlying error records are still Error-keyed; arbitrary host
re-entry, broader async host behavior and public runtime integration remain
unverified. `%js` still executes arbitrary host JavaScript, and passing nested
Toss Blocks through object properties has no supported callback contract under
ADR-38.

The experimental compiler now passes the execution boundary through Block
invocation context as well as through the synchronous host-entry guard.
Generator steps restore their caller's boundary after each delegation. This
supports the experimental async boundary described below, where a single mutable
global cannot identify the invocation after another task runs. General
concurrency guarantees remain unverified. The existing JS boundary, nested
resume, ordinary-program and module probes continue to pass.

## Experimental async boundary

The AST slice emits async Blocks as ordinary async functions, using the existing
async-result envelope and `awaitToss` conversion. Synchronous effect operations
inside those Blocks run under a fresh async boundary. A handler installed wholly
within the async Block can handle its own requests; requests and resume
capabilities cannot cross from the async Block to an outer synchronous handler,
even before the first await. Async Blocks are rejected as synchronous handlers,
`handleWith:` bodies, and `ensure:` bodies or cleanups. Synchronous Blocks may
return async results without implicitly waiting, as specified above.

`experiments/effects-async-boundary-test.mjs` covers startup and wait ordering,
handlers before and after await, simultaneous async invocations,
non-assimilation of Toss Objects with a `then` slot, promise identity and
rejection causes, cleanup timing, and boundary errors with cleanup details.
Async generator compilation was rejected in this experiment because delegation
can assimilate a Toss Object's `then` slot. The implementation still lacks JS
module imports, full host/re-entrant concurrency validation, async effect
handlers, cancellation, REPL integration and production runtime integration.

The experimental compiler also emits static `%jsImport` namespace imports using
the standard compiler's collection and alias logic. Tests cover eager
initialization from an otherwise unused Toss module, failure before Toss side
effects, shared namespace identity, an imported JavaScript function calling back
into Toss, and ordinary behavior against the standard compiler. Relative JS
specifiers remain rejected according to the existing parser rules. Static host
initialization is outside the synchronous Toss handler scope.

## Experimental cached-error metadata isolation

The module/runtime slice snapshots cleanup failures and handler contexts when a
module initialization fails, and restores that snapshot when the cached error is
re-thrown. This prevents cleanup or handler context added by a later caller from
being inherited by the next caller, while preserving the same Error identity and
retaining cleanup that actually occurred during module initialization. Tests
exercise repeated JS callbacks, module-local plus caller-local cleanup, and
handler contexts. They also verify that a read-only or throwing `stack` property
cannot replace the original cached error during formatting.

This is a targeted cache fix, not a complete occurrence-based error model.
Metadata is still keyed by Error, snapshots contain references to nested error
records, and re-entrant/concurrent reuse needs further study. If a host makes
`stack` unwritable or unreadable, the runtime preserves the original error and
its internal records but cannot reliably rewrite that host-visible stack; the
stack may be stale or omit associated failures. A non-mutating diagnostics
interface is required before claiming general error-reporting guarantees.

The experimental runtime now has an internal non-mutating failure-details
operation that returns the original error, a fresh list of associated cleanup
errors in execution order, and a fresh list of handler contexts. A test exposes
it only in a generated test artifact and verifies that a read-only frozen stack
still permits the current module and caller cleanup details to be inspected
without changing error identity. This is not a public Toss or JS API; lifetime,
concurrent access and presentation need further design. Normal stack formatting
remains best-effort when the host prevents reading or writing `stack`.

The production virtual-source compiler and the experimental compiler now share
the same internal source-graph preparation, including macro-library imports. The
experimental module probe checks that shared macros can generate an effect
request, that consumer roots remain independent, and that missing macro
libraries fail during compilation. The production compiler retains its existing
public API and generation path; this does not enable effects in that compiler.

A further module probe checks nested failed-module caches that share the same
Error object: re-importing the inner module retains its own cleanup record but
not cleanup added by the outer module. This validates that pair of cache
snapshots; it does not establish correctness for arbitrary host re-entry or
concurrent failure propagation.
