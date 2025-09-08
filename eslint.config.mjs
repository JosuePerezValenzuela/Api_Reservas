// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['eslint.config.mjs', 'src/migrations/**', 'src/seeds/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
            sourceType: 'commonjs',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unused-vars': 'off',
            'prettier/prettier': [
                'off',
                {
                    tabWidth: 4,
                    bracketSpacing: true,
                    bracketSameLine: true,
                    arrowParens: 'avoid',
                    spaceBeforeFunctionParen: true,
                    proseWrap: 'preserve',
                    endOfLine: 'auto',
                    semi: true,
                    trailingComma: 'es5',
                    printWidth: 100
                },
            ],
            'quotes': ['off'],
        },
    }
);
