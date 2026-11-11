const Browser = require("../coreModules/Browser.js");
const ConfigManager = require("../coreModules/ConfigManager.js");
const AppLogger = require("../coreModules/AppLogger.js");
const EnhancedPage = require("../coreModules/EnhancedPage.js");

class Instagram {
  constructor() {
    this.currentProfile = null;
  }

  init = async (profile) => {
    if (!Browser.browser) await Browser.initialize(profile?.profileTarget);
    if (!Browser.EnhancedPage) Browser.EnhancedPage = await EnhancedPage.attachPage(Browser.page);

    await AppLogger.logMSG(`InstaScraper initialized for profile: ${Browser.profileTarget}`);
  };

  /**
   * Navigate to a specific Instagram profile
   * @param {Object} page - Puppeteer page instance
   * @param {string} username - Target username
   */
  navigateToProfile = async (username) => {
    try {
      const url = `https://www.instagram.com/${username}/`;
      AppLogger.logMSG(`Navigating to profile: ${url}`);
      await Browser.EnhancedPage.navigateTo(url);

      // Check if profile exists
      // Ask chat GPT to check that some time ago the selector 'h2:contains("Sorry, this page isn\'t available.")' was working but not now and the error is -> Error: SyntaxError: Failed to execute 'querySelector' on 'Document': 'span:contains("Sorry, this page isn't available.")' is not a valid selector.
      // const notFound = await Browser.page.$('h2:contains("Sorry, this page isn\'t available.")');
      const notFound = await Browser.page.$('span:contains("Sorry, this page isn\'t available.")');
      if (notFound) {
        AppLogger.logMSG(`Profile ${username} not found`);
        throw new Error(`Profile ${username} not found`);
      }

      return true;
    } catch (error) {
      await AppLogger.logError(`Failed to navigate to profile ${username}:`, error);
      throw error;
    }
  };
}

module.exports = new Instagram();
