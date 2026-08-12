import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useAuth',
            'usePermissions',
            'useTheme',
            'useScanLiveState',
            'useScanProgress',
            'buttonVariants',
            'getSourceControl',
            'getSensitivityStyle',
          ],
        },
      ],
      // Many dropdowns and auth flows intentionally sync local state on open/prop change.
      'react-hooks/set-state-in-effect': 'off',
      // Radio rows nest their text one level deeper than the default: <label><input/><div><span/></div></label>
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      // Moving focus to a dialog's first field on open is the WAI-ARIA dialog pattern, not a violation.
      'jsx-a11y/no-autofocus': 'off',
      // Scrollable log panes must be keyboard-reachable (WCAG 2.1.1); they carry role="region".
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'better-tailwindcss': eslintPluginBetterTailwindcss,
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/index.css',
      },
    },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'warn',
    },
  },
])
