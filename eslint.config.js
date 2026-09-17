// ESLint — مقصور على وحدة SWEET COST فقط.
// بقية المستودع (JSX قديم) خارج النطاق عمداً حتى لا نغيّر شيئاً يعمل.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'api/**', 'src/**/*.jsx', 'src/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/sweetcost/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: 'readonly', document: 'readonly', console: 'readonly', localStorage: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', HTMLTextAreaElement: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
]
