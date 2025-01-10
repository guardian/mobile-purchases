const departmentalPrettierConfig = require("@guardian/prettier");

/**
 * This is the only way to extend shared configuration, _and_ overwrite some properties.
 *
 * @see https://prettier.io/docs/en/configuration.html
 * @see https://prettier.io/docs/en/configuration.html#sharing-configurations
 * @type {import("prettier").Config}
 */
const config = {
  ...departmentalPrettierConfig,

  // Overwrite some properties defined in the departmental config to achieve a consistent style across this repository.
  // See `.editorconfig` at the root of the repository.
  useTabs: false,
  tabWidth: 2
};

module.exports = config;