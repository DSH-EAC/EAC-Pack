import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function clientHarness() {
  const effects = [], updates = []
  let stateIndex = 0, exported
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }), Fragment: Symbol('Fragment'),
    useState: initial => { const index = stateIndex++; return [typeof initial === 'function' ? initial() : initial, update => updates.push({ index, update })] },
    useEffect: fn => effects.push(fn), useLayoutEffect() {}, useMemo: fn => fn(),
    useRef: current => ({ current }), useCallback: fn => fn,
  }
  class Events { constructor() { Events.instance = this } close() {} }
  const context = { window: { __ModuleLoader__: { load({ factory }) { exported = factory(() => React) } } },
    document: { createElement: () => ({ style: {} }), head: { appendChild() {} } },
    EventSource: Events, fetch: async () => ({ ok: true, json: async () => ({ events: [] }) }),
    setTimeout, clearTimeout, console,
  }
  const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    .replace('    return module.exports', '    exports.__test = { Timeline, SuiteTab };\n    return module.exports')
  vm.runInNewContext(source, context)
  return { exported, effects, updates, Events }
}

test('activity timeline ignores resource events instead of updating component state', () => {
  const { exported } = clientHarness()
  assert.doesNotThrow(() => exported.__test.Timeline({
    events: [{ type: 'resources', resources: { state: 'checking' } }, { type: 'job-start', jobId: 'test', ts: Date.now() }],
    t: key => key,
  }))
})

test('real SSE resources event updates root state without creating an install job', () => {
  const { exported, effects, updates, Events } = clientHarness()
  exported.__test.SuiteTab()
  const cleanups = effects.map(fn => fn())
  assert.ok(Events.instance, 'root subscribes to SSE')
  const before = updates.length
  const resources = { state: 'downloading', total: 72, completed: 2 }
  Events.instance.onmessage({ data: JSON.stringify({ type: 'resources', resources }) })
  const changes = updates.slice(before)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].index, 0, 'only root state changes')
  const next = changes[0].update({ phase: 'ready', data: { suiteVersion: '0.2.2' } })
  assert.deepEqual(JSON.parse(JSON.stringify(next.data.resources)), resources)
  assert.equal(next.data.suiteVersion, '0.2.2')
  cleanups.forEach(fn => typeof fn === 'function' && fn())
})
