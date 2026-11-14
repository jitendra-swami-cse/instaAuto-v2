const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const EnhancedPage = require("../CoreModules/EnhancedPage.js");

class Instagram {
  constructor() {
    this.currentProfile = null;
  }

  init = async (profile) => {
    if (!Browser.browser) await Browser.initialize(profile?.profileTarget);
    if (!Browser.EnhancedPage) Browser.EnhancedPage = await EnhancedPage.attachPage(Browser.page);

    await Logger.logMSG(`InstaScraper initialized for profile: ${Browser.profileTarget}`);
  };

  /**
   * Navigate to a specific Instagram profile
   * @param {Object} page - Puppeteer page instance
   * @param {string} username - Target username
   */
  navigateToProfile = async (username) => {
    try {
      const url = `https://www.instagram.com/${username}/`;

      if (!Browser.page) await Browser.initialize();
      if (Browser.page.url() === url) {
        await Browser.EnhancedPage.waitForPageLoad();
        Logger.logMSG(`Already on profile: ${url}, But waiting for page load.`);
        return true;
      }

      Logger.logMSG(`Navigating to profile: ${url}`);
      await Browser.EnhancedPage.navigateTo(url);

      await Browser.EnhancedPage.waitForPageLoad();

      const pageTitle = await Browser.page.title();
      const isLoggedIn = pageTitle === "Instagram";
      const isProfileExists =
        !pageTitle.includes("Profile isn't available") &&
        isLoggedIn &&
        !(await Browser.EnhancedPage.pageHasText("Sorry, this page isn't available.", ["span", "h2"]));

      if (!isProfileExists) {
        Logger.logMSG(`Profile ${username} not found`);
        return false;
      }
      if (!isLoggedIn) Logger.logMSG(`User is not logged in while trying to access profile ${username}`);

      if (!isLoggedIn && isProfileExists) await Browser.EnhancedPage.clickNotClickable('svg[aria-label="Close"]');

      return true;
    } catch (error) {
      await Logger.logMSG(`Failed to navigate to profile ${username}:`, error);
      throw error;
    }
  };

  // -=-=-=-=-=-=- Scraping Functions -=-=-=-=-=-=-
}

module.exports = new Instagram();
