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

      if (Browser.page.url() === url) {
        AppLogger.logMSG(`Already on profile: ${url}`);
        return true;
      }

      AppLogger.logMSG(`Navigating to profile: ${url}`);
      await Browser.EnhancedPage.navigateTo(url);

      await Browser.EnhancedPage.waitForPageLoad();

      const pageTitle = await Browser.page.title();
      const isLoggedIn = pageTitle === "Instagram";
      const isProfileExists =
        !pageTitle.includes("Profile isn't available") &&
        isLoggedIn &&
        !(await Browser.EnhancedPage.pageHasText(
          "Sorry, this page isn't available.",
          ["span", "h2"],
        ));

      if (!isProfileExists) {
        AppLogger.logMSG(`Profile ${username} not found`);
        return false;
      }
      if (!isLoggedIn)
        AppLogger.logMSG(
          `User is not logged in while trying to access profile ${username}`,
        );

      if (!isLoggedIn && isProfileExists)
        await Browser.EnhancedPage.clickNotClickable('svg[aria-label="Close"]');

      return true;
    } catch (error) {
      await AppLogger.logMSG(
        `Failed to navigate to profile ${username}:`,
        error,
      );
      throw error;
    }
  };

  // -=-=-=-=-=-=- Scraping Functions -=-=-=-=-=-=-
}

module.exports = new Instagram();
