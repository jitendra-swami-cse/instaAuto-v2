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
    if (!Browser.EnhancedPage)
      Browser.EnhancedPage = await EnhancedPage.attachPage(Browser.page);

    await AppLogger.logMSG(
      `InstaScraper initialized for profile: ${Browser.profileTarget}`,
    );
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

      await Browser.EnhancedPage.waitForPageLoad();

      const profileNotFound = await Browser.EnhancedPage.pageHasText(
        // "Sorry, this page isn't available.",
        "Profile isn't available",
        ["span", "h2"],
      );

      if (profileNotFound) {
        AppLogger.logMSG(`Profile ${username} not found`);
        throw new Error(`Profile ${username} not found`);
      }

      await Browser.EnhancedPage.clickNotClickable('svg[aria-label="Close"]');

      // const loginModel = await Browser.EnhancedPage.waitForElement(
      //   '[role="dialog"] [aria-label="Log in"]',
      //   { timeout: 5000 }
      // );

      return true;
    } catch (error) {
      await AppLogger.logMSG(
        `Failed to navigate to profile ${username}:`,
        error,
      );
      throw error;
    }
  };
}

module.exports = new Instagram();
