const launcher = require('./lib/chrome_headless_ssh_launcher')

// PUBLISH DI MODULE
module.exports = {
  'launcher:ChromeHeadlessSSH': ['type', launcher],
}
