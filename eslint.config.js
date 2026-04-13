const js = require('@eslint/js');
const ts = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'dashboard/**',
      'public/**',
      '**/*.d.ts',
      '**/*.js',
      '!.eslintrc.js',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2020,
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      prettier: prettier,
    },
    rules: {
      ...ts.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-undef': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        mockFn: 'readonly',
      },
    },
  },
];
