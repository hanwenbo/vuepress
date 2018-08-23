const path = require('path')

module.exports = (pluginOptions = {}, context) => ({
  name: 'i18n-ui',

  // This plugin will be enabled only at development mode.
  enabled: !context.isProd,

  enhanceAppFiles: [
    path.resolve(__dirname, 'client.js')
  ],

  additionalPages: [
    {
      override: false,
      route: pluginOptions.route || '/i18n/',
      path: path.resolve(__dirname, 'index.md')
    }
  ]
})
