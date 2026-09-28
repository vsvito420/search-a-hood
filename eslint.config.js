// Schlanke Lint-Konfiguration ohne Plugins: `npx eslint@9 .` (läuft auch in der CI)
const browser = Object.fromEntries(
  'window document L localStorage indexedDB navigator location history performance requestAnimationFrame cancelAnimationFrame FormData Blob DOMParser MouseEvent Event TextEncoder TextDecoder btoa atob prompt'
    .split(' ')
    .map((g) => [g, 'readonly']),
);
const shared = Object.fromEntries(
  'console setTimeout clearTimeout setInterval clearInterval fetch URL URLSearchParams AbortSignal Buffer process globalThis'.split(' ').map((g) => [g, 'readonly']),
);

export default [
  { ignores: ['node_modules/**', '_site/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...browser, ...shared } },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': 'error',
      'no-unsafe-finally': 'error',
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
