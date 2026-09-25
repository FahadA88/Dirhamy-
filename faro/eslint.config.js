import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Item 24/98 of the audit pass: the accessibility work this project has done — focus rings,
// live regions, keyboard paths, aria labels — had nothing checking it stays that way. This is
// scoped to exactly that: jsx-a11y's recommended rules over the .tsx UI, wired into `npm test`
// so a future PR that drops an aria-label or a keyboard handler fails the build, not a screen
// reader. It is not a general style/lint pass — that's a separate, much larger undertaking.
export default tseslint.config(
  { ignores: ['dist/**', 'dist-artifact/**', 'node_modules/**'] },
  {
    files: ['src/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
);
