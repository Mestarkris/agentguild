'use strict';
// Central rate-limiting queue for all LLM calls in this process.
// Enforces MAX_CONCURRENT simultaneous in-flight requests and MIN_SPACING_MS
// minimum gap between consecutive dispatches, so burst traffic from multiple
// simultaneous jobs or fast sequential subtasks cannot pile onto the same key window.

const MAX_CONCURRENT = 3;
const MIN_SPACING_MS = 400;

let _inFlight = 0;
let _queueSize = 0;
let _totalDispatched = 0;
let _lastDispatchAt = 0;
let _drainTimer = null;        // deduplicated pending drain callback
const _queue = [];

function _scheduleDrain(ms) {
  if (_drainTimer !== null) return;  // already a drain scheduled — don't stack
  _drainTimer = setTimeout(() => {
    _drainTimer = null;
    _drain();
  }, ms);
}

function _drain() {
  while (_inFlight < MAX_CONCURRENT && _queue.length > 0) {
    const now = Date.now();
    const gap = MIN_SPACING_MS - (now - _lastDispatchAt);
    if (gap > 0) {
      _scheduleDrain(gap);
      return;
    }

    const { fn, resolve, reject, label } = _queue.shift();
    _queueSize--;
    _inFlight++;
    _lastDispatchAt = Date.now();
    const seq = ++_totalDispatched;
    console.log(`[LLMQueue] dispatch #${seq}  label=${label}  in-flight=${_inFlight}  queued=${_queueSize}`);

    Promise.resolve()
      .then(() => fn())
      .then(result => {
        _inFlight--;
        console.log(`[LLMQueue] done     #${seq}  label=${label}  in-flight=${_inFlight}`);
        resolve(result);
        _drain();
      })
      .catch(err => {
        _inFlight--;
        console.log(`[LLMQueue] error    #${seq}  label=${label}  in-flight=${_inFlight}  err=${err.message}`);
        reject(err);
        _drain();
      });
  }
}

function enqueue(fn, label) {
  const lbl = label ?? '?';
  _queueSize++;
  console.log(`[LLMQueue] queued   label=${lbl}  in-flight=${_inFlight}  queued=${_queueSize}`);
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject, label: lbl });
    _drain();
  });
}

function stats() {
  return { inFlight: _inFlight, queued: _queueSize, totalDispatched: _totalDispatched };
}

module.exports = { enqueue, stats };
