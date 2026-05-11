import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.agents/', '.claude/', 'node_modules/', 'attached_assets/', 'test_anthropic.js'] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
