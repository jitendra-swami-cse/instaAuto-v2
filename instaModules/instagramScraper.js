// -=-=-=-=-=-=-=-=- Available Methods -=-=-=-=-=-=-=-=-
// async initialize(profile)
// async cleanup()
// // =============== PROFILE SCRAPING ===============
// async scrapeUserProfile(targetUserName, options = {})
// async scrapeProfileMetadata(userName
// async scrapeUserPosts(userName, maxPosts = 50)
// async scrapeUserFollowers(userName, maxFollowers = 1000)
// async scrapeUserFollowings(userName, maxFollowings = 1000)
// // =============== HELPER METHODS ===============
// async extractPostsFromPage(maxPosts)
// async saveScrapedData(userName, scrapedData)
// // =============== BATCH SCRAPING ===============
// async scrapeBatchProfiles(userNames, options = {})
// generateBatchSummary(results)
// // =============== TARGET MANAGEMENT ===============
// async addScrapingTarget(userName, targetType = "profile")
// async markTargetAsScraped(userName)
// // =============== STATISTICS AND MONITORING ===============
// getScrapingStats()
// resetSessionStats()
// async getScrapingHistory(userName = null, days = 7)
// // =============== RATE LIMITING AND SAFETY ===============
// async checkScrapingLimits()
// async waitForRateLimit(seconds = 60)
// // =============== DATA VALIDATION ===============
// validateScrapedData(data)
// // =============== CLEANUP AND MAINTENANCE ===============
// async cleanupOldScrapedData(daysToKeep = 30)

// const Logger = require("../utils/Logger");
// const { InstagramScraper } = require("../utils/instagramScraper");
// const config = require("../config/environment");

const Browser = require("../coreModules/Browser.js");
const ConfigManager = require("../coreModules/ConfigManager.js");
const AppLogger = require("../coreModules/AppLogger.js");
const EnhancedPage = require("../coreModules/EnhancedPage.js");
const Instagram = require("./Instagram.js");
class InstaScraper {
  constructor() {
    // Configuration properties
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.supportedMediaTypes = ["image", "video", "carousel"];
  }

  /**
   * Extract profile information from current page
   * NOTE - This Work only when windowSize is = [815, 789] and screen zoom is 90% .
   * @param {Object} page - Puppeteer page instance
   * @returns {Object} Profile data
   */
  scrapeProfileMetadata = async (userName) => {
    try {
      if (userName) await Instagram.navigateToProfile(userName);
      return await Browser.page.evaluate(() => {
        // Extract profile data
        // const fullName = document.querySelector("h1").textContent.trim();
        const username = document.querySelector("h2").textContent.trim();

        const contentMeta = document.querySelectorAll(
          'meta[name="description"]',
        )[0]?.content;
        const bio = contentMeta?.split("Instagram:")[1]?.trim();

        // Extract counts
        const followersCountText = contentMeta
          .substring(0, contentMeta.indexOf("Followers"))
          .trim();
        const followingCountText = contentMeta
          .split("Followers,")[1]
          .split("Following")[0]
          .trim();
        const postsCountText = contentMeta
          .split("Following,")[1]
          .split("Posts")[0]
          .trim();

        const profilePicUrl = document.querySelectorAll(
          `a[href="/${username}/"] img`,
        )[0].src;

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
          isPrivate: !![document.body].find((element) =>
            element.textContent?.toLowerCase().includes("profile is private"),
          ),
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
      let {
        mediaTypes = ["image", "video", "carousel"],
        maxItems = 50,
        maxScrolls = 10,
        skipExisting = true,
        createDirectories = true,
      } = options;

      await AppLogger.logMSG(`Scraping posts from: ${username}`);

      await Instagram.navigateToProfile(username);

      const profileMetaData = await this.scrapeProfileMetadata();

      // Check if profile is private
      if (profileMetaData?.isPrivate) {
        await AppLogger.logMSG(`Profile ${username} is private`);
        return [];
      }

      if (profileMetaData.postsCount == 0) {
        await AppLogger.logMSG(`Profile does have any posts to download.`);
        return [];
      }

      if (
        profileMetaData.postsCount < maxItems &&
        profileMetaData.postsCount > 0
      )
        maxItems = profileMetaData.postsCount;

      // Click on any post to open the modal
      // await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"]'); // Only posts
      await Browser.EnhancedPage.clickNotClickable(
        'a[href*="/p/"], a[href*="/reel/"]',
      ); // Either post or reel

      // Create download directory structure
      const downloadPath = await ConfigManager.createDownloadStructure(
        username,
        createDirectories,
      );
      console.log("End Point.");

      // -=-=- Testing and Development -=-=-=-
      // 1. Wait for modal to load
      await Browser.EnhancedPage.waitForElementRobust(
        'div[role="dialog"] article',
      );

      // 2. Check for img post
      const res = await Browser.page.evaluate(
        () => document.querySelector("title").textContent,
      );
      console.log(res);
      // // Scroll to load posts
      // await scrollToLoadMore(Browser.page, scrolls, "article a");

      // // Extract post data
      // const posts = await Browser.page.evaluate((limit) => {
      //   const postLinks = Array.from(document.querySelectorAll("article a"));
      //   const posts = [];

      //   for (let i = 0; i < Math.min(postLinks.length, limit); i++) {
      //     const link = postLinks[i];
      //     const img = link.querySelector("img");

      //     if (img) {
      //       posts.push({
      //         url: link.href,
      //         imageUrl: img.src,
      //         alt: img.alt || "",
      //         scrapedAt: new Date().toISOString(),
      //       });
      //     }
      //   }

      //   return posts;
      // }, limit);

      // await AppLogger.logMSG(`Scraped ${posts.length} posts from ${username}`);
      // return posts;
    } catch (error) {
      await AppLogger.logMSG(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  };

  // -=-=-=-=-= Above this line methods are tested and working -=-=-=-=-=

  async cleanup() {
    if (this.scraper) {
      await this.scraper.close();
    }
    this.scraper = null;
    this.currentProfile = null;
  }

  // =============== PROFILE SCRAPING ===============
  async scrapeUserProfile(targetUserName, options = {}) {
    const {
      includeMetadata = true,
      includePosts = true,
      includeFollowers = false,
      includeFollowings = false,
      maxPosts = 50,
      maxFollowers = 1000,
    } = options;

    try {
      await this.logger.info(
        `Starting profile scraping for: ${targetUserName}`,
      );

      if (!this.currentProfile) {
        throw new Error(
          "Scraping service not initialized. Call initialize() first.",
        );
      }

      const scrapingResult = {
        userName: targetUserName,
        scrapedAt: new Date().toISOString(),
        scrapedBy: this.currentProfile.userName,
        success: true,
      };

      // Scrape profile metadata
      if (includeMetadata) {
        await this.logger.info(`Scraping metadata for: ${targetUserName}`);
        const metadata = await this.scrapeProfileMetadata(targetUserName);
        scrapingResult.metadata = metadata;
      }

      // Scrape posts
      if (includePosts) {
        await this.logger.info(`Scraping posts for: ${targetUserName}`);
        const posts = await this.scrapeUserPosts(targetUserName, maxPosts);
        scrapingResult.posts = posts;
        scrapingResult.postsCount = posts.length;
      }

      // Scrape followers
      if (includeFollowers) {
        await this.logger.info(`Scraping followers for: ${targetUserName}`);
        const followers = await this.scrapeUserFollowers(
          targetUserName,
          maxFollowers,
        );
        scrapingResult.followers = followers;
        scrapingResult.followersCount = followers.length;
      }

      // Scrape followings
      if (includeFollowings) {
        await this.logger.info(`Scraping followings for: ${targetUserName}`);
        const followings = await this.scrapeUserFollowings(
          targetUserName,
          maxFollowers,
        );
        scrapingResult.followings = followings;
        scrapingResult.followingsCount = followings.length;
      }

      // Save scraped data
      await this.saveScrapedData(targetUserName, scrapingResult);

      // Update stats
      this.scrapingStats.profilesScraped++;
      this.scrapingStats.currentSession++;
      if (scrapingResult.posts) {
        this.scrapingStats.postsScraped += scrapingResult.posts.length;
      }
      if (scrapingResult.followers) {
        this.scrapingStats.followersScraped += scrapingResult.followers.length;
      }

      await this.logger.info(
        `Profile scraping completed for: ${targetUserName}`,
        {
          metadata: !!scrapingResult.metadata,
          posts: scrapingResult.postsCount || 0,
          followers: scrapingResult.followersCount || 0,
          followings: scrapingResult.followingsCount || 0,
        },
      );

      return scrapingResult;
    } catch (error) {
      await this.logger.error(
        `Profile scraping failed for: ${targetUserName}`,
        error,
      );
      this.scrapingStats.errors++;
      throw error;
    }
  }

  // async scrapeProfileMetadata(userName) {
  //   try {
  //     // Use new scraper
  //     const profileData = await this.scraper.scrapeProfile(userName);

  //     await this.logger.debug(`Metadata scraped for ${userName}`, {
  //       postsCount: profileData.postsCount,
  //       followersCount: profileData.followersCount,
  //       followingsCount: profileData.followingCount,
  //     });

  //     return profileData;
  //   } catch (error) {
  //     await this.logger.error(`Failed to scrape metadata for: ${userName}`, error);
  //     throw error;
  //   }
  // }

  async scrapeUserPosts(userName, maxPosts = 50) {
    try {
      // Use new scraper
      const posts = await this.scraper.scrapePosts(userName, {
        limit: maxPosts,
      });

      await this.logger.info(`Scraped ${posts.length} posts for ${userName}`);
      return posts;
    } catch (error) {
      await this.logger.error(`Failed to scrape posts for: ${userName}`, error);
      throw error;
    }
  }

  async scrapeUserFollowers(userName, maxFollowers = 1000) {
    try {
      // Use new scraper
      const followers = await this.scraper.scrapeFollowers(userName, {
        limit: maxFollowers,
      });

      await this.logger.info(
        `Scraped ${followers.length} followers for ${userName}`,
      );
      return followers;
    } catch (error) {
      await this.logger.error(
        `Failed to scrape followers for: ${userName}`,
        error,
      );
      throw error;
    }
  }

  async scrapeUserFollowings(userName, maxFollowings = 1000) {
    try {
      // Use new scraper
      const followings = await this.scraper.scrapeFollowing(userName, {
        limit: maxFollowings,
      });

      await this.logger.info(
        `Scraped ${followings.length} followings for ${userName}`,
      );
      return followings;
    } catch (error) {
      await this.logger.error(
        `Failed to scrape followings for: ${userName}`,
        error,
      );
      throw error;
    }
  }

  // =============== HELPER METHODS ===============
  async extractPostsFromPage(maxPosts) {
    // This method is now handled by the new scraper
    // Keeping for backwards compatibility
    try {
      const currentUrl = await this.scraper.page.url();
      const username = currentUrl.split("instagram.com/")[1]?.split("/")[0];

      if (username) {
        return await this.scraper.scrapePosts(username, { limit: maxPosts });
      }

      return [];
    } catch (error) {
      await this.logger.error("Failed to extract posts from page", error);
      return [];
    }
  }

  async saveScrapedData(userName, scrapedData) {
    try {
      // Create directory structure for scraped data
      const scrapedDataDir = `./data/instaScrapedData/${userName}`;
      const fs = require("fs-extra");
      await fs.ensureDir(scrapedDataDir);

      // Save different types of data to separate files
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      if (scrapedData.metadata) {
        const metadataPath = `${scrapedDataDir}/metadata-${timestamp}.json`;
        await fs.writeJson(metadataPath, scrapedData.metadata, { spaces: 2 });
      }

      if (scrapedData.posts) {
        const postsPath = `${scrapedDataDir}/posts-${timestamp}.json`;
        await fs.writeJson(postsPath, scrapedData.posts, { spaces: 2 });
      }

      if (scrapedData.followers) {
        const followersPath = `${scrapedDataDir}/followers-${timestamp}.json`;
        await fs.writeJson(followersPath, scrapedData.followers, { spaces: 2 });
      }

      if (scrapedData.followings) {
        const followingsPath = `${scrapedDataDir}/followings-${timestamp}.json`;
        await fs.writeJson(followingsPath, scrapedData.followings, {
          spaces: 2,
        });
      }

      // Save complete scraped data
      const completePath = `${scrapedDataDir}/complete-${timestamp}.json`;
      await fs.writeJson(completePath, scrapedData, { spaces: 2 });

      await this.logger.info(
        `Scraped data saved for ${userName} in ${scrapedDataDir}`,
      );
    } catch (error) {
      await this.logger.error(
        `Failed to save scraped data for: ${userName}`,
        error,
      );
    }
  }

  // =============== BATCH SCRAPING ===============
  async scrapeBatchProfiles(userNames, options = {}) {
    const results = [];

    for (const userName of userNames) {
      try {
        await this.logger.info(`Starting batch scraping for: ${userName}`);
        const result = await this.scrapeUserProfile(userName, options);
        results.push(result);

        // Delay between users to be respectful
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 10000 + 10000),
        );
      } catch (error) {
        await this.logger.error(
          `Batch scraping failed for: ${userName}`,
          error,
        );
        results.push({
          userName: userName,
          success: false,
          error: error.message,
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    return {
      success: true,
      processedUsers: userNames.length,
      results: results,
      summary: this.generateBatchSummary(results),
    };
  }

  generateBatchSummary(results) {
    return {
      totalUsers: results.length,
      successfulUsers: results.filter((r) => r.success).length,
      totalPosts: results.reduce((sum, r) => sum + (r.postsCount || 0), 0),
      totalFollowers: results.reduce(
        (sum, r) => sum + (r.followersCount || 0),
        0,
      ),
      errors: results.filter((r) => !r.success).length,
    };
  }

  // =============== TARGET MANAGEMENT ===============
  async addScrapingTarget(userName, targetType = "profile") {
    try {
      const fs = require("fs-extra");
      const targetsFile = "./data/instaScrapedData/targetStringsToScrape.json";

      // Ensure file exists
      if (!(await fs.pathExists(targetsFile))) {
        await fs.writeJson(targetsFile, [], { spaces: 2 });
      }

      // Read existing targets
      const targets = await fs.readJson(targetsFile);

      // Add new target if not already exists
      const existingTarget = targets.find((t) => t.userName === userName);
      if (!existingTarget) {
        targets.push({
          userName: userName,
          targetType: targetType,
          addedAt: new Date().toISOString(),
          status: "pending",
        });

        await fs.writeJson(targetsFile, targets, { spaces: 2 });
        await this.logger.info(`Added scraping target: ${userName}`);
      }

      return true;
    } catch (error) {
      await this.logger.error(
        `Failed to add scraping target: ${userName}`,
        error,
      );
      throw error;
    }
  }

  async markTargetAsScraped(userName) {
    try {
      const fs = require("fs-extra");
      const targetsFile = "./data/instaScrapedData/targetStringsToScrape.json";
      const scrapedFile =
        "./data/instaScrapedData/targetStringsAlreadyScraped.json";

      // Read targets
      if (await fs.pathExists(targetsFile)) {
        const targets = await fs.readJson(targetsFile);
        const targetIndex = targets.findIndex((t) => t.userName === userName);

        if (targetIndex !== -1) {
          const target = targets[targetIndex];
          target.status = "completed";
          target.scrapedAt = new Date().toISOString();

          // Remove from pending targets
          targets.splice(targetIndex, 1);
          await fs.writeJson(targetsFile, targets, { spaces: 2 });

          // Add to scraped targets
          let scrapedTargets = [];
          if (await fs.pathExists(scrapedFile)) {
            scrapedTargets = await fs.readJson(scrapedFile);
          }
          scrapedTargets.push(target);
          await fs.writeJson(scrapedFile, scrapedTargets, { spaces: 2 });

          await this.logger.info(`Marked target as scraped: ${userName}`);
        }
      }
    } catch (error) {
      await this.logger.error(
        `Failed to mark target as scraped: ${userName}`,
        error,
      );
    }
  }

  // =============== STATISTICS AND MONITORING ===============
  getScrapingStats() {
    return {
      ...this.scrapingStats,
      sessionTime: new Date().toISOString(),
    };
  }

  resetSessionStats() {
    this.scrapingStats.currentSession = 0;
  }

  async getScrapingHistory(userName = null, days = 7) {
    try {
      const fs = require("fs-extra");
      const baseDir = userName
        ? `./data/instaScrapedData/${userName}`
        : "./data/instaScrapedData";

      if (!(await fs.pathExists(baseDir))) {
        return [];
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // This is a simplified version - you'd implement based on your file structure
      const history = [];

      return history;
    } catch (error) {
      await this.logger.error("Failed to get scraping history", error);
      return [];
    }
  }

  // =============== RATE LIMITING AND SAFETY ===============
  async checkScrapingLimits() {
    // Implement your rate limiting logic here
    // Return true if scraping is allowed, false otherwise
    return true;
  }

  async waitForRateLimit(seconds = 60) {
    await this.logger.info(`Rate limit reached, waiting ${seconds} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  // =============== DATA VALIDATION ===============
  validateScrapedData(data) {
    const validation = {
      isValid: true,
      errors: [],
    };

    if (!data.userName) {
      validation.isValid = false;
      validation.errors.push("Missing userName");
    }

    if (!data.scrapedAt) {
      validation.isValid = false;
      validation.errors.push("Missing scrapedAt timestamp");
    }

    // Add more validation rules as needed

    return validation;
  }

  // =============== CLEANUP AND MAINTENANCE ===============
  async cleanupOldScrapedData(daysToKeep = 30) {
    try {
      const fs = require("fs-extra");
      const scrapedDataDir = "./data/instaScrapedData";

      if (!(await fs.pathExists(scrapedDataDir))) return;

      await this.logger.info(
        `Cleaning up scraped data older than ${daysToKeep} days`,
      );

      // Implement cleanup logic based on your file structure
    } catch (error) {
      await this.logger.error("Failed to cleanup old scraped data", error);
    }
  }
}

module.exports = new InstaScraper();

//https://instagram.fudr2-1.fna.fbcdn.net/v/t51.82787-15/632576270_18378893548086352_2538838670900224906_n.webp?_nc_cat=104&_nc_map=urlgen_bucketless&ig_cache_key=MzE3MTA5MTQwNzI2NDAzOTU2MQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkZFRUQueHBpZHMuNjQwLnNkci5yZWd1bGFyX3Bob3RvLkMzIn0%3D&_nc_ohc=7WkzhSBfe7UQ7kNvwHcSN-Y&_nc_oc=Adq6abmiEJSpVHmZ6C8LkPtOFvcqxhHQiLwSwezfZsEppKIoW2JFgcifJnxY90jAiTtajWFcqB_Eco56GO3-jDTu&_nc_zt=23&_nc_ht=instagram.fudr2-1.fna&_nc_gid=8CzSlM5vH5O8kJXpahwYfA&_nc_ss=7b6a8&oh=00_AQSsy5CDq93x57IWwdBsADMH_op-l3ntVb7XTGCY0Nxb6A&oe=6AFD19E4
//https://instagram.fudr2-1.fna.fbcdn.net/v/t51.82787-15/632576270_18378893548086352_2538838670900224906_n.webp?_nc_cat=104&_nc_map=urlgen_bucketless&ig_cache_key=MzE3MTA5MTQwNzI2NDAzOTU2MQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkZFRUQueHBpZHMuNjQwLnNkci5yZWd1bGFyX3Bob3RvLkMzIn0%3D&_nc_ohc=7WkzhSBfe7UQ7kNvwHcSN-Y&_nc_oc=Adq6abmiEJSpVHmZ6C8LkPtOFvcqxhHQiLwSwezfZsEppKIoW2JFgcifJnxY90jAiTtajWFcqB_Eco56GO3-jDTu&_nc_zt=23&_nc_ht=instagram.fudr2-1.fna&_nc_gid=8CzSlM5vH5O8kJXpahwYfA&_nc_ss=7b6a8&oh=00_AQSsy5CDq93x57IWwdBsADMH_op-l3ntVb7XTGCY0Nxb6A&oe=6AFD19E4
