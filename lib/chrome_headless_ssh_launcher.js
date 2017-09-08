var CDP = require('chrome-remote-interface');
var tunnel = require('reverse-tunnel-ssh');

var ChromeHeadlessSSHLauncher = function (
  args,
  /* config.chromeHeadlessSSH */ config,
  logger, helper,
  baseLauncherDecorator, captureTimeoutLauncherDecorator, retryLauncherDecorator,
) {
  var log = logger.create('launcher.chromeheadlessssh')
  var self = this

  var browser;
  var Target;
  var sshTunnel;

  baseLauncherDecorator(self)
  captureTimeoutLauncherDecorator(self)
  retryLauncherDecorator(self)

  self.name = 'ChromeHeadless on ' + config.host

  var action = async function(client, url) {
    const { Network, Page } = client;
    // setup handlers
    Network.requestWillBeSent((params) => {
      log.debug(params.request.url);
    });
    // enable events then start!
    await Promise.all([Network.enable(), Page.enable()]);
    await Page.navigate({ url });
    log.info(`Opening ${url} on headless browser`);
    await Page.loadEventFired();
  }

  var start = async function (url) {
    const fullUrl = `${config.host}:${config.port}`
    const karmaPort = +url.replace(/.*:([\d]{4})\/.*/, '$1');

    try {
      log.info(`Creating ssh tunnel from ${config.ssh.host}:${karmaPort} to localhost:${karmaPort}`)
      var server = tunnel(Object.assign({}, config.ssh, { dstPort: karmaPort }), async function (error, server) {
        if (error) { log.error(error) }
      });

      server.on('forward-in', async function (port) {
        log.info(`Forwarding from ${config.ssh.host}:${karmaPort} to localhost:${karmaPort}`);

        const cdpTarget = `ws://${fullUrl}/devtools/browser`;
        log.info(`Connecting to remote dev tools via ${cdpTarget}`);
        browser = await CDP({
          target: cdpTarget,
        })

        // create a new context
        log.info(`Creating new context on remote browser`)
        Target = browser.Target;
        const { browserContextId } = await Target.createBrowserContext();
        ({ targetId } = await Target.createTarget({
            url: 'about:blank',
            browserContextId
        }));

        // connect to the new context
        log.info(`Connecting client to new browser context`)
        const client = await CDP({ host: config.host, port: config.port, target: targetId });

        // perform user actions on it
        await action(client, url);
      });

     // Use a listener to handle errors outside the callback
     server.on('error', function(err) {
      console.error('Something bad happened:', err);
     });

    } catch (error) {
      log.error(error);
    }
  }

  self.on('start', async function (url) {
    await start(url)
  })

  self.on('kill', async function (done) {
    try {
      await Target.closeTarget({ targetId });
      await browser.close();
    } catch (error) {
      log.error(error);
    } finally {
      done();
    }
  })
}

module.exports = ChromeHeadlessSSHLauncher
