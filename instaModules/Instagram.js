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

      await Browser.EnhancedPage.waitForPageLoad();

      const pageTitle = await Browser.page.title();
      const isLoggedIn = pageTitle === "Instagram";
      const isProfileExists =
        !pageTitle.includes("Profile isn't available") &&
        isLoggedIn &&
        !(await Browser.EnhancedPage.pageHasText("Sorry, this page isn't available.", ["span", "h2"]));

      if (!isProfileExists) {
        AppLogger.logMSG(`Profile ${username} not found`);
        return false;
      }
      if (!isLoggedIn) AppLogger.logMSG(`User is not logged in while trying to access profile ${username}`);

      if (!isLoggedIn && isProfileExists) await Browser.EnhancedPage.clickNotClickable('svg[aria-label="Close"]');

      return true;
    } catch (error) {
      await AppLogger.logMSG(`Failed to navigate to profile ${username}:`, error);
      throw error;
    }
  };

  // -=-=-=-=-=-=- Scraping Functions -=-=-=-=-=-=-
  /**
   * Extract profile information from current page
   * NOTE - This Work only when windowSize is = [815, 789] and screen zoom is 90% .
   * @param {Object} page - Puppeteer page instance
   * @returns {Object} Profile data
   */
  extractProfileInfo = async () => {
    try {
      return await Browser.page.evaluate(() => {
        // Extract profile data
        // const fullName = document.querySelector("h1").textContent.trim();
        const username = document.querySelector("h2").textContent.trim();

        const contentMeta = document.querySelectorAll('meta[name="description"]')[0]?.content;
        const bio = contentMeta?.split("Instagram:")[1]?.trim();

        // Extract counts
        const followersCountText = contentMeta.substring(0, contentMeta.indexOf("Followers")).trim();
        const followingCountText = contentMeta.split("Followers,")[1].split("Following")[0].trim();
        const postsCountText = contentMeta.split("Following,")[1].split("Posts")[0].trim();

        const profilePicUrl = document.querySelectorAll(`a[href="/${username}/"] img`)[0].src;

        // Parse counts (handle K, M suffixes)
        const parseCount = (text) => {
          if (!text) return 0;
          const cleanText = text.replace(/,/g, "");
          if (cleanText.includes("K")) {
            return Math.floor(parseFloat(cleanText) * 1000);
          } else if (cleanText.includes("M")) {
            return Math.floor(parseFloat(cleanText) * 1000000);
          }
          return parseInt(cleanText) || 0;
        };

        return {
          // fullName,
          username: username.replace("@", ""),
          bio,
          profilePicUrl,
          postsCount: parseCount(postsCountText),
          followersCount: parseCount(followersCountText),
          followingCount: parseCount(followingCountText),
          isPrivate: !![document.body].find((element) => element.textContent?.toLowerCase().includes("profile is private")),
          isVerified: !!document.querySelector('svg[aria-label="Verified"]'),
          scrapedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      await AppLogger.logError("Failed to extract profile info:", error);
      return null;
    }
  };

  /**
   * Scrape posts from a profile
   * @param {string} username - Target username
   * @param {Object} options - Scraping options
   * @returns {Array} Array of post data
   */
  scrapePosts = async (username, options = {}) => {
    try {
      const { limit = 50, scrolls = 10 } = options;

      await AppLogger.logMSG(`Scraping posts from: ${username}`);

      await this.navigateToProfile(username);

      // Check if profile is private
      const isPrivate = await Browser.page.evaluate(
        () => !![document.body].find((element) => element.textContent?.toLowerCase().includes("profile is private")),
      );

      if (isPrivate) {
        await AppLogger.logMSG(`Profile ${username} is private`);
        return [];
      }

      // Click on any post to open the modal
      // await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"]'); // Only posts
      // await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"], a[href*="/reel/"]'); // Either post or reel

      // Scroll to load posts
      await scrollToLoadMore(Browser.page, scrolls, "article a");

      // Extract post data
      const posts = await Browser.page.evaluate((limit) => {
        const postLinks = Array.from(document.querySelectorAll("article a"));
        const posts = [];

        for (let i = 0; i < Math.min(postLinks.length, limit); i++) {
          const link = postLinks[i];
          const img = link.querySelector("img");

          if (img) {
            posts.push({
              url: link.href,
              imageUrl: img.src,
              alt: img.alt || "",
              scrapedAt: new Date().toISOString(),
            });
          }
        }

        return posts;
      }, limit);

      await AppLogger.logMSG(`Scraped ${posts.length} posts from ${username}`);
      return posts;
    } catch (error) {
      await AppLogger.logMSG(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  };
}

module.exports = new Instagram();
