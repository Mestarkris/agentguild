// Central rate-limiting queue for all LLM calls in this process/lambda invocation.
// Enforces MAX_CONCURRENT simultaneous in-flight requests and MIN_SPACING_MS
// minimum gap between consecutive dispatches.

const MAX_CONCURRENT = 3;
const MIN_SPACING_MS = 400;

let _inFlight = 0;
let _queueSize = 0;
let _totalDispatched = 0;
let _lastDispatchAt = 0;
const _queue: { fn: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void; label: string }[] = [];

function _drain() {
  while (_inFlight < MAX_CONCURRENT && _queue.length > 0) {
    const now = Date.now();
    const gap = MIN_SPACING_MS - (now - _lastDispatchAt);
    if (gap > 0) {
      setTimeout(_drain, gap);
      return;
    }

    const item = _queue.shift()!;
    _queueSize--;
    _inFlight++;
    _lastDispatchAt = Date.now();
    const seq = ++_totalDispatched;
    console.log(`[LLMQueue] dispatch #${seq}  label=${item.label}  in-flight=${_inFlight}  queued=${_queueSize}`);

    Promise.resolve()
      .then(() => item.fn())
      .then(result => {
        _inFlight--;
        console.log(`[LLMQueue] done     #${seq}  label=${item.label}  in-flight=${_inFlight}`);
        item.resolve(result);
        _drain();
      })
      .catch(err => {
        _inFlight--;
        console.log(`[LLMQueue] error    #${seq}  label=${item.label}  in-flight=${_inFlight}  err=${(err as Error).message}`);
        item.reject(err);
        _drain();
      });
  }
}

export function enqueue<T>(fn: () => Promise<T>, label: string): Promise<T> {
  _queueSize++;
  console.log(`[LLMQueue] queued   label=${label}  in-flight=${_inFlight}  queued=${_queueSize}`);
  return new Promise<T>((resolve, reject) => {
    _queue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject, label });
    _drain();
  });
}
