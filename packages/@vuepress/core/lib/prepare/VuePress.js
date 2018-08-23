const path = require('path')
const createMarkdown = require('../markdown/index')
const loadConfig = require('./loadConfig')
const { fs, logger, chalk } = require('@vuepress/shared-utils')
const { globby } = require('@vuepress/shared-utils')
const { sort } = require('./util')
const Page = require('./Page')

const PluginAPI = require('../plugin-api/index')

module.exports = class VuePress {
  /**
   *
   * @param { string } sourceDir
   * @param { isProd, plugins, theme } options
   */
  constructor (sourceDir, options) {
    this.sourceDir = sourceDir
    this._options = options
    this.isProd = options.isProd
    this.vuepressDir = path.resolve(sourceDir, '.vuepress')
    this.siteConfig = loadConfig(this.vuepressDir)
    this.themeConfig = this.siteConfig.themeConfig || {}
    this.outDir = this.siteConfig.dest
      ? path.resolve(this.siteConfig.dest)
      : path.resolve(sourceDir, '.vuepress/dist')
    this.base = this.siteConfig.base || '/'
    this.markdown = createMarkdown(this.siteConfig)
    this.pluginAPI = new PluginAPI(this)
    this.pages = [] // Array<Page>
  }

  async process () {
    this.normalizeHeadTagUrls()
    await this.resolveTheme()
    this.applyPlugins()

    this.pluginAPI.options.additionalPages.values.forEach(({ route, path }) => {
      this.addPage(path, { routePath: route })
    })

    await this.resolvePages()
    const { pluginAPI } = this

    await pluginAPI.options.ready.apply()
    pluginAPI.options.extendMarkdown.syncApply(this.markdown)
    await pluginAPI.options.clientDynamicModules.apply()
    await pluginAPI.options.globalUIComponents.apply()
    await pluginAPI.options.enhanceAppFiles.apply()
  }

  applyPlugins () {
    const themeConfig = this.themeConfig
    const siteConfig = this.siteConfig

    const shouldUseLastUpdated = (
      themeConfig.lastUpdated ||
      Object.keys(siteConfig.locales && themeConfig.locales || {})
        .some(base => themeConfig.locales[base].lastUpdated)
    )

    this.pluginAPI
      // internl core plugins
      .use(require('../internal-plugins/siteData'))
      .use(require('../internal-plugins/routes'))
      .use(require('../internal-plugins/rootMixins'))
      .use(require('../internal-plugins/importAsyncComponent'))
      .use(require('../internal-plugins/enhanceApp'))
      .use(require('../internal-plugins/overrideCSS'))
      .use(require('../internal-plugins/data-mixins'))
      // user plugin
      .useByPluginsConfig(this._options.plugins)
      .useByPluginsConfig(this.siteConfig.plugins)
      .useByPluginsConfig(this.themeplugins)
      // built-in plugins
      .use('@vuepress/last-updated', shouldUseLastUpdated)
      .use('@vuepress/register-components', {
        componentsDir: [
          path.resolve(this.sourceDir, '.vuepress/components'),
          path.resolve(this.themePath, 'components')
        ]
      })
      .apply()
  }

  normalizeHeadTagUrls () {
    // normalize head tag urls for base
    if (this.base !== '/' && this.siteConfig.head) {
      this.siteConfig.head.forEach(tag => {
        const attrs = tag[1]
        if (attrs) {
          for (const name in attrs) {
            if (name === 'src' || name === 'href') {
              const value = attrs[name]
              if (value.charAt(0) === '/') {
                attrs[name] = this.base + value.slice(1)
              }
            }
          }
        }
      })
    }
  }

  async addPage (filePath, { relative, routePath }) {
    const page = new Page(filePath, { relative, routePath })
    await page.process(this.markdown)
    await this.pluginAPI.options.extendPageData.apply(page)
    this.pages.push(page)
  }

  async resolvePages () {
    // resolve pageFiles
    const patterns = ['**/*.md', '!.vuepress', '!node_modules']
    if (this.siteConfig.dest) {
      // #654 exclude dest folder when dest dir was set in
      // sourceDir but not in '.vuepress'
      const outDirRelative = path.relative(this.sourceDir, this.outDir)
      if (!outDirRelative.includes('..')) {
        patterns.push('!' + outDirRelative)
      }
    }
    const pageFiles = sort(await globby(patterns, { cwd: this.sourceDir }))

    await Promise.all(pageFiles.map(async (relative) => {
      const filePath = path.resolve(this.sourceDir, relative)
      await this.addPage(filePath, { relative })
    }))
  }

  async resolveTheme () {
    const theme = this.siteConfig.theme || this._options.theme
    const requireResolve = (target) => {
      return require.resolve(target, {
        paths: [
          path.resolve(__dirname, '../../node_modules'),
          path.resolve(this.sourceDir)
        ]
      })
    }

    // resolve theme
    const localThemePath = path.resolve(this.vuepressDir, 'theme')
    const useLocalTheme = await fs.exists(localThemePath)

    let themePath = null
    let themeLayoutPath = null
    let themeNotFoundPath = null
    let themeIndexFile = null
    let themePlugins = []

    if (useLocalTheme) {
      logger.tip(`\nApply theme located at ${localThemePath}...`)

      // use local custom theme
      themePath = localThemePath
      themeLayoutPath = path.resolve(localThemePath, 'Layout.vue')
      themeNotFoundPath = path.resolve(localThemePath, 'NotFound.vue')
      if (!fs.existsSync(themeLayoutPath)) {
        throw new Error(`[vuepress] Cannot resolve Layout.vue file in .vuepress/theme.`)
      }
      if (!fs.existsSync(themeNotFoundPath)) {
        throw new Error(`[vuepress] Cannot resolve NotFound.vue file in .vuepress/theme.`)
      }
    } else if (theme) {
      // use external theme
      try {
        // backward-compatible 0.x.x.
        themeLayoutPath = requireResolve(`vuepress-theme-${theme}/Layout.vue`)
        themePath = path.dirname(themeLayoutPath)
        themeNotFoundPath = path.resolve(themeLayoutPath, 'NotFound.vue')
      } catch (e) {
        try {
          themeIndexFile = requireResolve(`vuepress-theme-${theme}/index.js`)
        } catch (e) {
          try {
            themeIndexFile = requireResolve(`@vuepress/theme-${theme}`)
            themePath = path.dirname(themeIndexFile)
            themeIndexFile = require(themeIndexFile)
            themeLayoutPath = themeIndexFile.layout
            themeNotFoundPath = themeIndexFile.notFound
            themePlugins = themeIndexFile.plugins
          } catch (e) {
            throw new Error(`[vuepress] Failed to load custom theme "${theme}". File vuepress-theme-${theme}/Layout.vue does not exist.`)
          }
        }
      }
      logger.tip(`\nApply theme ${chalk.gray(theme)}`)
    } else {
      throw new Error(`[vuepress] You must specify a theme, or create a local custom theme. \n For more details, refer to https://vuepress.vuejs.org/guide/custom-themes.html#custom-themes. \n`)
    }

    this.themePath = themePath
    this.themeLayoutPath = themeLayoutPath
    this.themeNotFoundPath = themeNotFoundPath
    this.themeplugins = themePlugins
  }

  getSiteData () {
    return {
      title: this.siteConfig.title || '',
      description: this.siteConfig.description || '',
      base: this.base,
      pages: this.pages.map(page => page.toJson()),
      themeConfig: this.siteConfig.themeConfig || {},
      locales: this.siteConfig.locales
    }
  }
}

