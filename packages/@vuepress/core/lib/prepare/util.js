const indexRE = /(^|.*\/)(index|readme)\.md$/i
const extRE = /\.(vue|md)$/

exports.fileToPath = function (file) {
  if (exports.isIndexFile(file)) {
    // README.md -> /
    // foo/README.md -> /foo/
    return file.replace(indexRE, '/$1')
  } else {
    // foo.md -> /foo.html
    // foo/bar.md -> /foo/bar.html
    return `/${file.replace(extRE, '').replace(/\\/g, '/')}.html`
  }
}

exports.isIndexFile = function (file) {
  return indexRE.test(file)
}

exports.sort = function (arr) {
  return arr.sort((a, b) => {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })
}

exports.encodePath = function (userpath) {
  return userpath.split('/').map(item => encodeURIComponent(item)).join('/')
}

exports.getPermalink = function (permalinkPattern, slug, { date, type } = {}) {
  slug = encodeURI(slug)

  if (type === 'post' || type === 'page') {
    const d = new Date(date)
    const year = d.getFullYear()
    const iMonth = d.getMonth() + 1
    const iDay = d.getDate()
    const minutes = d.getMinutes()
    const seconds = d.getSeconds()
    const month = iMonth < 10 ? `0${iMonth}` : iMonth
    const day = iDay < 10 ? `0${iDay}` : iDay

    let langPrefix = ''

    if (this.api.config.localeNames) {
      for (const name of this.api.config.localeNames) {
        const RE = new RegExp(`^${name}[/$]`)
        if (RE.test(slug)) {
          slug = slug.replace(RE, '')
          // Do not add lang prefix for default locale
          // eslint-disable-next-line max-depth
          if (name !== this.api.config.locale) {
            langPrefix = `${name}/`
          }
          break
        }
      }
    }

    permalinkPattern = permalinkPattern || this.api.config.permalink[type]
    // Remove leading slash
    permalinkPattern = permalinkPattern.replace(/^\//, '')

    const link =
      langPrefix +
      permalinkPattern
        .replace(/:year/, year)
        .replace(/:month/, month)
        .replace(/:i_month/, iMonth)
        .replace(/:i_day/, iDay)
        .replace(/:day/, day)
        .replace(/:minutes/, minutes)
        .replace(/:seconds/, seconds)
        .replace(/:slug/, slug)

    return link.replace(/^\/?/, '/')
  }

  const removeIndexSuffix = route => {
    if (route === '/index') {
      return '/'
    }
    if (route.endsWith('/index')) {
      return route.replace(/\/index$/, '')
    }
    return route
  }

  return removeIndexSuffix('/' + slug)
}
