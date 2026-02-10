const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Tells Puppeteer to install Chrome in a local folder we can control
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'), 
};