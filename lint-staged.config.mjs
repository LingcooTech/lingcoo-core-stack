/**
 * lint-staged 配置：根目录跑，根据文件路径分发到正确的 ESLint config
 * - 根 src/**: 用根 eslint.config.mjs
 * - admin-ui/src/**: cd 到 admin-ui 用子项目的 eslint.config.mjs
 * - 其他文本文件：只跑 Prettier
 */

const adminUiEslint = (files) => {
  const relPaths = files.map((f) => f.replace(/^.*\/admin-ui\//, ''));
  return [
    `bash -c "cd admin-ui && npx eslint --fix --no-warn-ignored ${relPaths.join(' ')}"`,
    `prettier --write ${files.join(' ')}`,
  ];
};

const backendEslint = (files) => [
  `eslint --fix --no-warn-ignored ${files.join(' ')}`,
  `prettier --write ${files.join(' ')}`,
];

/** @type {import('lint-staged').Configuration} */
export default {
  'src/**/*.{ts,js}': backendEslint,
  'admin-ui/src/**/*.{ts,tsx,js,jsx}': adminUiEslint,
  '*.{json,md,yml,yaml,css,html}': 'prettier --write',
  'admin-ui/*.{json,md,yml,yaml,css,html}': 'prettier --write',
};
