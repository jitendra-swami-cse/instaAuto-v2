const Browser = require('../utils/Browser');
const Logger = require('../utils/Logger');
const config = require('../config/environment');

class InstagramService {
  constructor(profileRepository, logger = null) {
    this.profileRepository = profileRepository;
    this.browser = new Browser();
    this.logger = logger || new Logger();
    this.currentProfile = null;
  }

  async initialize(profile) {
    this.currentProfile = profile;
    await this.browser.initialize(profile.profileTarget);
    await this.logger.info(`Instagram service initialized for profile: ${profile.userName}`);
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    this.currentProfile = null;
  }

  // =============== FOLLOW FUNCTIONALITY ===============
  async followUser(targetUserName, options = {}) {
    if (!this.currentProfile) {
      throw new Error('No profile initialized. Call initialize() first.');
    }

    const { shouldLikePosts = true, minLikes = 1, maxLikes = 3 } = options;

    try {
      await this.logger.info(`Starting follow process: ${this.currentProfile.userName} -> ${targetUserName}`);

      // Navigate to Instagram home
      await this.browser.goToInstagramHome();
      await this.randomDelay(1, 2);

      // Search for the user
      await this.browser.searchUser(targetUserName);
      await this.randomDelay(2, 3);

      // Like some posts before following (more human-like)
      if (shouldLikePosts) {
        await this.likeUserPosts(targetUserName, { minLikes, maxLikes });
      }

      // Perform the follow action
      const followResult = await this.browser.clickFollow();

      if (followResult.alreadyFollowing) {
        await this.logger.info(`Already following ${targetUserName}`);
        return { success: true, alreadyFollowing: true };
      }

      if (followResult.success) {
        // Record the follow in the database
        const followData = {
          userName: targetUserName,
          date: new Date().toISOString(),
          followedBy: this.currentProfile.userName
        };

        await this.profileRepository.addFollowRecord(this.currentProfile.userName, followData);
        
        await this.logger.logFollowAction(this.currentProfile, targetUserName, followResult);
        
        return { success: true, newFollow: true };
      }

      throw new Error('Follow action did not complete successfully');

    } catch (error) {
      await this.logger.error(`Follow failed: ${this.currentProfile.userName} -> ${targetUserName}`, error);
      throw error;
    }
  }

  // =============== LIKE FUNCTIONALITY ===============
  async likeUserPosts(targetUserName, options = {}) {
    const { minLikes = 1, maxLikes = 5 } = options;
    
    try {
      await this.logger.info(`Starting like process for ${targetUserName}`);

      // Navigate to user's profile if not already there
      const currentUrl = await this.browser.getCurrentUrl();
      if (!currentUrl.includes(`instagram.com/${targetUserName}`)) {
        await this.browser.goToProfile(targetUserName);
        await this.randomDelay(1, 2);
      }

      // Get available post elements
      const postElements = await this.browser.getPostElements(targetUserName);
      
      if (postElements.length === 0) {
        await this.logger.warn(`No posts found for user: ${targetUserName}`);
        return { success: true, postsLiked: 0, message: 'No posts available' };
      }

      // Calculate how many posts to like
      const maxPossibleLikes = Math.min(maxLikes, postElements.length);
      const numberOfPostsToLike = this.getRandomNumber(minLikes, maxPossibleLikes);

      let successfulLikes = 0;
      const likedPosts = [];

      // Like random posts
      for (let i = 0; i < numberOfPostsToLike; i++) {
        try {
          // Get random post index
          const randomIndex = this.getRandomNumber(0, postElements.length - 1);
          const postElement = postElements[randomIndex];
          
          // Remove selected post from array to avoid duplicates
          postElements.splice(randomIndex, 1);

          // Like the post
          const likeResult = await this.browser.likePost(postElement);
          
          if (likeResult.liked || likeResult.alreadyLiked) {
            successfulLikes++;
            likedPosts.push({
              postIndex: i + 1,
              result: likeResult
            });

            await this.logger.logLikeAction(
              this.currentProfile, 
              targetUserName, 
              i + 1, 
              likeResult
            );
          }

          // Random delay between likes
          await this.randomDelay(1, 3);

        } catch (error) {
          await this.logger.warn(`Failed to like post ${i + 1} for ${targetUserName}`, error);
          // Continue with next post instead of failing completely
        }
      }

      return {
        success: true,
        postsLiked: successfulLikes,
        totalAttempted: numberOfPostsToLike,
        details: likedPosts
      };

    } catch (error) {
      await this.logger.error(`Like process failed for ${targetUserName}`, error);
      throw error;
    }
  }

  // =============== PROFILE UPDATE FUNCTIONALITY ===============
  async updateProfileData(forceUpdate = false) {
    if (!this.currentProfile) {
      throw new Error('No profile initialized');
    }

    try {
      const needsUpdate = forceUpdate || this.currentProfile.needsUpdate();
      
      if (!needsUpdate) {
        await this.logger.info(`Profile ${this.currentProfile.userName} does not need update`);
        return { updated: false, reason: 'Not needed' };
      }

      await this.logger.info(`Updating profile data for: ${this.currentProfile.userName}`);

      // Navigate to own profile
      await this.browser.goToProfile(this.currentProfile.userName);
      await this.randomDelay(2, 3);

      // This would integrate with your scraping service
      // For now, we'll use a placeholder
      const scrapedData = await this.scrapeProfileMetadata(this.currentProfile.userName);
      
      // Update profile with scraped data
      this.currentProfile.updateMetadata(scrapedData);
      
      // Save updated profile
      await this.profileRepository.saveProfile(this.currentProfile);

      await this.logger.info(`Profile data updated for: ${this.currentProfile.userName}`);

      return {
        updated: true,
        data: {
          postsCount: this.currentProfile.postsCount,
          followersCount: this.currentProfile.followersCount,
          followingsCount: this.currentProfile.followingsCount
        }
      };

    } catch (error) {
      await this.logger.error(`Failed to update profile data for ${this.currentProfile.userName}`, error);
      throw error;
    }
  }

  // =============== HELPER METHODS ===============
  async scrapeProfileMetadata(userName) {
    // This is a placeholder - you'd integrate this with your existing scraping functionality
    // For now, return mock data
    await this.logger.info(`Scraping metadata for: ${userName}`);
    
    // This would call your instaScraper functionality
    return {
      edge_owner_to_timeline_media: { count: 100 },
      edge_followed_by: { count: 1500 },
      edge_follow: { count: 800 },
      edge_mutual_followed_by: { count: 50 }
    };
  }

  async randomDelay(minSeconds, maxSeconds) {
    await this.browser.randomDelay(maxSeconds, minSeconds);
  }

  getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // =============== RATE LIMITING & VALIDATION ===============
  async canPerformAction(actionType) {
    // This would integrate with your restrictor functionality
    // For now, always return true
    return true;
  }

  async validateProfile() {
    if (!this.currentProfile) {
      throw new Error('No profile initialized');
    }

    if (!this.browser.isReady()) {
      throw new Error('Browser not ready');
    }

    return true;
  }

  // =============== STATUS & INFO ===============
  getCurrentProfile() {
    return this.currentProfile;
  }

  async getCurrentUrl() {
    return await this.browser.getCurrentUrl();
  }

  async isOnInstagram() {
    const url = await this.getCurrentUrl();
    return url.includes('instagram.com');
  }
}

module.exports = InstagramService;
