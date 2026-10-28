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
  }

  async initialize(profileTarget) {
    try {
      console.log(`Initializing browser for profile target: ${profileTarget}`);

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
      await EnhancedPage.attachPage(this.page);

      // Set permissions
      // const context = this.browser.defaultBrowserContext();
      // await context.overridePermissions("https://www.youtube.com/", []);
      // Check Developer Helper.md have the reason why above 3 lines are commented as flag ---deny-permission-prompts added in getBrowser.js .
      console.log(
        `Browser initialized successfully for profile: ${profileTarget}`,
      );
      return true;
    } catch (error) {
      console.error("Failed to initialize browser:", error);
      throw error;
    }
  }

  async reconnect() {
    try {
      console.log("Reconnecting browser...");

      if (this.browser) {
        await this.close();
      }

      await this.initialize(this.profileTarget);
      return true;
    } catch (error) {
      console.error("Failed to reconnect browser:", error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log("Browser closed successfully");
      }
      this.browser = null;
      this.page = null;
    } catch (error) {
      console.error("Error closing browser:", error);
      throw error;
    }
  }
  // Check if browser is ready
  isReady() {
    return this.browser !== null && this.page !== null;
  }

  // Get all open pages URLs (for debugging)
  async getAllPagesUrls() {
    if (!this.browser) return [];
    const pages = await this.browser.pages();
    return await Promise.all(pages.map((page) => page.url()));
  }

  // ==== 👇🏻 for Testing & Debugging 👇🏻 ====

  async listAllPages() {
    const pages = await this.browser.pages();
    for (const page of pages) {
      console.log(`Page URL: ${page.url()}`);
    }
  }

  // -------- Move Given Below Methods to Enhanced Page class.
  async getCurrentUrl() {
    if (!this.page) throw new Error("Browser not initialized");
    return await this.page.url();
  }

  // Instagram specific navigation methods
  async goToInstagramHome() {
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
      console.log("Navigated to Instagram home");
    } catch (error) {
      console.log(
        "Home button not available, navigating directly to home page",
      );
      await this.navigateTo("https://www.instagram.com/");
    }
  }

  async goToProfile(userName) {
    const profileUrl = `https://www.instagram.com/${userName}/`;
    await this.navigateTo(profileUrl);
    console.log(`Navigated to profile: ${userName}`);
  }

  async searchUser(userName) {
    console.log(`Searching for user: ${userName}`);

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
    console.log(`Selected user: ${userName} from search results`);
  }

  async clickFollow() {
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
      console.log("Already following this user");
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
        console.log("Follow action completed successfully");
        return { success: true };
      }
      await this.randomDelay(1, 0.5);
      attempts++;
    }

    throw new Error("Follow action did not complete within expected time");
  }

  async likePost(postElement) {
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
      console.log("Post liked successfully");
      return { liked: true };
    } else {
      console.log("Post already liked");
      return { alreadyLiked: true };
    }
  }

  async getPostElements(userName) {
    const selector = `a[href^="/${userName}/reel/"], a[href^="/${userName}/p/"]`;
    return await this.page.$$(selector);
  }

  // Utility method for random delays
  async randomDelay(maxSeconds, minSeconds = 0) {
    const delay =
      (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

module.exports = new Browser();

// ====== HelpFull Explainations for Nodes Like Me =====
