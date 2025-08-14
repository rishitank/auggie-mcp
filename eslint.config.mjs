import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import pluginTs from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: { console: true, process: true, Buffer: true, setTimeout: true },
    },
    rules: {
      'func-style': ['error', 'expression', { allowArrowFunctions: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration',
          message: 'Use arrow functions assigned to const instead of function declarations.',
        },
        {
          selector: 'FunctionExpression',
          message: 'Use arrow functions instead of the function keyword.',
        },
      ],
      'arrow-body-style': 'off',
      'no-undef': 'off',
    },
  },

  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser,
      globals: {
        console: true,
        process: true,
        Buffer: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        __dirname: true,
      },
    },
    plugins: {
      '@typescript-eslint': pluginTs,
    },
    rules: {
      'func-style': ['error', 'expression', { allowArrowFunctions: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration',
          message: 'Use arrow functions assigned to const instead of function declarations.',
        },
        {
          selector: 'FunctionExpression',
          message: 'Use arrow functions instead of the function keyword.',
        },
      ],
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false, allowUnboundThis: true }],
      // Keep elegant where practical; avoid blocking on cosmetic transforms in TS code
      'arrow-body-style': 'off',
      'no-undef': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'prefer-destructuring': [
        'error',
        { array: true, object: true },
        { enforceForRenamedProperties: false },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];
