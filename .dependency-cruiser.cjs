/**
 * PR2 — architectural fitness functions for axios lib/ (variant 9).
 * error = rule the current code already satisfies (guards against regressions)
 * warn  = known architectural debt found in PR2 (must go to zero after refactoring)
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Module-level dependency cycles are forbidden (main Big Ball of Mud indicator).',
      from: { path: '^lib' },
      to: { circular: true },
    },
    {
      name: 'adapters-are-independent',
      severity: 'error',
      comment: 'Transport adapters must not import each other; shared logic goes to a common module.',
      from: { path: '^lib/adapters/(http|xhr|fetch)\\.js$' },
      to: { path: '^lib/adapters/(http|xhr|fetch)\\.js$' },
    },
    {
      name: 'browser-adapters-no-node-builtins',
      severity: 'error',
      comment: 'xhr/fetch adapters run in browsers and must not depend on Node.js core modules.',
      from: { path: '^lib/adapters/(xhr|fetch)\\.js$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Lava Flow: modules nobody imports. Entry point and package.json "browser" substitutions are excluded.',
      from: {
        orphan: true,
        pathNot: [
          '^lib/axios\\.js$',
          '^lib/helpers/null\\.js$',
          '^lib/platform/browser/index\\.js$',
          '\\.d\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'utils-must-be-leaf',
      severity: 'warn',
      comment: 'utils.js is imported by 30 modules, so it must not depend on anything in lib/ (breaks helpers<->utils cycle).',
      from: { path: '^lib/utils\\.js$' },
      to: { path: '^lib/', pathNot: '^lib/utils\\.js$' },
    },
    {
      name: 'helpers-not-to-core',
      severity: 'warn',
      comment: 'helpers/ is a lower layer than core/; upward dependencies create core<->helpers package cycles.',
      from: { path: '^lib/helpers/' },
      to: { path: '^lib/core/' },
    },
    {
      name: 'platform-not-to-helpers',
      severity: 'warn',
      comment: 'platform/ is the lowest layer and must not depend on helpers/.',
      from: { path: '^lib/platform/' },
      to: { path: '^lib/helpers/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^lib',
    moduleSystems: ['es6'],
    reporterOptions: {
      dot: { collapsePattern: '^lib/(helpers|platform|cancel|defaults|env)/' },
    },
  },
};
