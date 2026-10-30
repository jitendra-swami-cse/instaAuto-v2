// const config = require("./ConfigManager");
const ConfigManager = require("./ConfigManager");
const AppLogger = require("./AppLogger");
const { getBrowser } = require("../utils/getBrowser");
const EnhancedPage = require("./EnhancedPage");
// const hookMethodsOnPage = require("../uncategorized/pageHookFunctions");

class Browser {
  constructor() {
    this.browser = null;
    this.page = null;
    this.profileTarget = null;
    this.EnhancedPage = null;
  }
  initialize = async (profileTarget) => {
    try {
      AppLogger.logMSG(
        `Initializing browser for profile target: ${profileTarget}`,
      );

      this.profileTarget = profileTarget;

      const browserOptions = {
        profileTarget: profileTarget,
        headless: ConfigManager.browserConfig.headless || false,
      };

      const result = await getBrowser(browserOptions);
      this.browser = result.browser;
      this.page = result.page;

      // Hook custom methods to page
      // hookMethodsOnPage.call(
      //   {
      //     browser: this.browser,
      //     page: this.page,
      //     utils: require("../utils/utils"),
      //     appLogger: this.appLogger,
      //   },
      //   this.page,
      // );
      this.EnhancedPage = await EnhancedPage.attachPage(this.page);

      // Set permissions
      // const context = this.browser.defaultBrowserContext();
      // await context.overridePermissions("https://www.youtube.com/", []);
      // Check Developer Helper.md have the reason why above 3 lines are commented as flag ---deny-permission-prompts added in getBrowser.js .
      AppLogger.logMSG(
        `Browser initialized successfully for profile: ${profileTarget}`,
      );
      return true;
    } catch (error) {
      AppLogger.logMSG(`Failed to initialize browser: ${error}`);
      throw error;
    }
  };

  reconnect = async () => {
    try {
      AppLogger.logMSG("Reconnecting browser...");

      if (this.browser) {
        await this.close();
      }

      await this.initialize(this.profileTarget);
      return true;
    } catch (error) {
      AppLogger.logMSG(`Failed to reconnect browser: ${error}`);
      throw error;
    }
  };

  close = async () => {
    try {
      if (this.browser) {
        await this.browser.close();
        AppLogger.logMSG("Browser closed successfully");
      }
      this.browser = null;
      this.page = null;
    } catch (error) {
      AppLogger.logMSG(`Error closing browser: ${error}`);
      throw error;
    }
  };
  // Check if browser is ready
  isReady = () => {
    return this.browser !== null && this.page !== null;
  };

  // Get all open pages URLs (for debugging)
  getAllPagesUrls = async () => {
    if (!this.browser) return [];
    const pages = await this.browser.pages();
    return await Promise.all(pages.map((page) => page.url()));
  };

  // ==== 👇🏻 for Testing & Debugging 👇🏻 ====

  listAllPages = async () => {
    const pages = await this.browser.pages();
    for (const page of pages) {
      AppLogger.logMSG(`Page URL: ${page.url()}`);
    }
  };

  // -------- Move Given Below Methods to Enhanced Page class.
  getCurrentUrl = async () => {
    if (!this.page) throw new Error("Browser not initialized");
    return await this.page.url();
  };

  // Instagram specific navigation methods
  goToInstagramHome = async () => {
    try {
      const currentUrl = await this.getCurrentUrl();
      if (
        currentUrl.includes("https://www.instagram.com") &&
        !currentUrl.includes("graphql")
      ) {
        await this.page.clickNotClickable(`[aria-label="Home"]`);
      } else {
        await this.navigateTo("https://www.instagram.com/");
      }
      AppLogger.logMSG("Navigated to Instagram home");
    } catch (error) {
      AppLogger.logMSG(
        "Home button not available, navigating directly to home page",
      );
      await this.navigateTo("https://www.instagram.com/");
    }
  };

  goToProfile = async (userName) => {
    const profileUrl = `https://www.instagram.com/${userName}/`;
    await this.navigateTo(profileUrl);
    AppLogger.logMSG(`Navigated to profile: ${userName}`);
  };

  searchUser = async (userName) => {
    AppLogger.logMSG(`Searching for user: ${userName}`);

    // Click search button
    await this.page.clickNotClickable('[aria-label="Search"]');

    // Click search input
    await this.page.clickNotClickable('input[aria-label="Search input"]');

    // Type username
    await this.page.typeHuman('input[aria-label="Search input"]', userName);

    // Wait for search results
    await this.randomDelay(3, 2);

    // Click on the user
    await this.page.clickNotClickable(`span ::-p-text(${userName})`);
    AppLogger.logMSG(`Selected user: ${userName} from search results`);
  };

  clickFollow = async () => {
    const followBtn = await this.page
      .locator(`button ::-p-text(Follow)`)
      .waitHandle();

    // Scroll button into view
    await this.page.evaluate(
      (element) =>
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        }),
      followBtn,
    );

    await this.randomDelay(1.5, 0.5);

    // Check current button text
    const buttonText = await this.page.getText(followBtn);
    if (buttonText === "Following") {
      AppLogger.logMSG("Already following this user");
      return { alreadyFollowing: true };
    }

    // Click follow
    await this.page.clickNotClickable("::-p-text(Follow)");

    // Wait for follow to complete
    const waitForFollow = async () => {
      const newButtonText = await this.page.getText(followBtn);
      return newButtonText === "Following";
    };

    // You'll need to add the monitor utility here or pass it as dependency
    // For now, let's use a simple polling approach
    let attempts = 0;
    while (attempts < 10) {
      if (await waitForFollow()) {
        AppLogger.logMSG("Follow action completed successfully");
        return { success: true };
      }
      await this.randomDelay(1, 0.5);
      attempts++;
    }

    throw new Error("Follow action did not complete within expected time");
  };

  likePost = async (postElement) => {
    // Scroll post into view
    await this.page.evaluate(
      (element) =>
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        }),
      postElement,
    );

    await this.randomDelay(1, 0.5);

    // Click on post to open it
    await this.page.clickNotClickable(postElement);
    await this.randomDelay(1, 0.5);

    // Find and click like button
    const likeButton = await this.page
      .locator(`[aria-label$="ike"][height="24"][width="24"]`)
      .waitHandle();
    const ariaLabel = await this.page.evaluate(
      (element) => element.ariaLabel,
      likeButton,
    );

    if (ariaLabel === "Like") {
      await this.page.clickNotClickable(likeButton);
      AppLogger.logMSG("Post liked successfully");
      return { liked: true };
    } else {
      AppLogger.logMSG("Post already liked");
      return { alreadyLiked: true };
    }
  };

  getPostElements = async (userName) => {
    const selector = `a[href^="/${userName}/reel/"], a[href^="/${userName}/p/"]`;
    return await this.page.$$(selector);
  };

  // Utility method for random delays
  randomDelay = async (maxSeconds, minSeconds = 0) => {
    const delay =
      (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  };
}

module.exports = new Browser();

// ====== HelpFull Explainations for Nodes Like Me =====
