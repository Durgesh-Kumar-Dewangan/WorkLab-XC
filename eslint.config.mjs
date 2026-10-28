import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // names starting with _ are deliberate "leave this one out" destructures
      '@typescript-eslint/no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // React Compiler advice. The 3D scene must change three.js objects (camera, renderer) in place, and a few effects set state on
      // purpose, so these are shown as warnings to review, not as build-stopping errors.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'public/**']),
]);

export default eslintConfig;
