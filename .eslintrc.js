module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: [
    'android/',
    'ios/',
    'backend/',
    'build/',
    'dist/',
    'node_modules/',
  ],
  rules: {
    'import/no-unresolved': 'off',
    'react/react-in-jsx-scope': 'off',
  },
};
