const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function start(session = new Map(), unavailable = false) {
  const root = { dataset: {} };
  const context = vm.createContext({
    sessionStorage: { getItem: k => { if (unavailable) throw Error(); return session.get(k); }, setItem: (k,v) => { if (unavailable) throw Error(); session.set(k,v); } },
    localStorage: { getItem: () => 'light', setItem: () => { throw Error('Must not persist theme across sessions'); } },
    document: { documentElement: root, getElementById: () => ({}), querySelectorAll: () => [], readyState: 'loading', addEventListener: () => {} },
  });
  const source = fs.readFileSync(require.resolve('../theme.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'globalThis.chooseTheme = applyTheme; })();');
  vm.runInContext(source, context);
  return { root, choose: context.chooseTheme };
}
test('dark default ignores old persisted light theme, keeps explicit choice within session', () => {
  const session = new Map();
  const first = start(session); assert.equal(first.root.dataset.theme, 'dark');
  first.choose('light'); assert.equal(start(session).root.dataset.theme, 'light');
  assert.equal(start().root.dataset.theme, 'dark');
});
test('blocked storage does not break the theme switch', () => {
  const page = start(new Map(), true); assert.equal(page.root.dataset.theme, 'dark');
  page.choose('light'); assert.equal(page.root.dataset.theme, 'light');
});
