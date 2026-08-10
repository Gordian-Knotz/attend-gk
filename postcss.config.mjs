/** @type {import('postcss-load-config').Config} */
const config = {
  // Object form rather than the bare array: it is the shape PostCSS
  // documents, and it leaves somewhere to put plugin options later without
  // restructuring the file.
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
