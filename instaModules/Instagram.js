const Browser = require("../coreModules/Browser.js");
const ConfigManager = require("../coreModules/ConfigManager.js");
const AppLogger = require("../coreModules/AppLogger.js");
const EnhancedPage = require("../coreModules/EnhancedPage.js");

class Instagram {
  constructor() {
    this.currentProfile = null;
  }

  init = async (profile) => {
    if (Browser.browser === null) await Browser.initialize(profile?.profileTarget);
    await AppLogger.logMSG(`InstaScraper initialized for profile: ${Browser.profileTarget}`);
  };

  /**
   * Navigate to a specific Instagram profile
   * @param {Object} page - Puppeteer page instance
   * @param {string} username - Target username
   */
  navigateToProfile = async (page, username) => {
    const page = page || Browser.EnhancedPage;

    const url = `https://www.instagram.com/${username}/`;

    try {
      AppLogger.logMSG(`Navigating to profile: ${username}`);
      // await page.navigateTo(url, { waitUntil: "networkidle2" });
      await page.navigateTo(url);

      // Check if profile exists
      const notFound = await page.$('h2:contains("Sorry, this page isn\'t available.")');
      if (notFound) {
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
