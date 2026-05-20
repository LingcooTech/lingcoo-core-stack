/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
  endOfLine: 'lf',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'clsx', 'cva', 'tw'],
  overrides: [
    {
      files: 'admin-ui/**/*.{ts,tsx,js,jsx,css}',
      options: {
        tailwindConfig: './admin-ui/tailwind.config.ts',
      },
    },
  ],
};
