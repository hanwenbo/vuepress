const VuePress = require('./VuePress')

module.exports = async function prepare ({
  sourceDir,
  isProd,
  cliOptions: {
    plugins,
    theme
  }
}) {
  const app = new VuePress(sourceDir, { plugins, theme, isProd })
  await app.process()
  return app
}
