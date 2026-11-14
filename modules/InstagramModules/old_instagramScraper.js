const { getBrowser, closeBrowser } = require('./getBrowser');
const {
  randomWait,
  humanClick,
  loginToInstagram,
  navigateToProfile,
  extractProfileInfo,
  scrollToLoadMore,
  handleDialogs
} = require('./pageUtils');

/**
 * Instagram Scraper Class
 * Self-contained scraper for Instagram data extraction
 */
class InstagramScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  /**
   * Initialize browser and login
   * @param {Object} credentials - Login credentials
   * @param {Object} browserOptions - Browser configuration
   */
  async initialize(credentials = {}, browserOptions = {}) {
    try {
      const { username, password } = credentials;
      const { profileTarget = 'default', headless = false } = browserOptions;

      console.log('Initializing Instagram scraper...');
      
      // Initialize browser
      const browserInstance = await getBrowser({
        profileTarget,
        headless
      });
      
      this.browser = browserInstance.browser;
      this.page = browserInstance.page;

      // Login if credentials provided
      if (username && password) {
        this.isLoggedIn = await loginToInstagram(this.page, username, password);
        
        if (this.isLoggedIn) {
          await handleDialogs(this.page);
          console.log('Scraper initialized and logged in successfully');
        } else {
          console.warn('Scraper initialized but login failed');
        }
      } else {
        console.log('Scraper initialized without login');
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize scraper:', error);
      await this.close();
      throw error;
    }
  }

  /**
   * Scrape profile information
   * @param {string} username - Target username
   * @returns {Object} Profile data
   */
  async scrapeProfile(username) {
    try {
      if (!this.page) {
        throw new Error('Scraper not initialized');
      }

      console.log(`Scraping profile: ${username}`);
      
      await navigateToProfile(this.page, username);
      await randomWait(2000, 3000);

      const profileData = await extractProfileInfo(this.page);
      
      if (!profileData) {
        throw new Error('Failed to extract profile data');
      }

      console.log(`Profile scraped successfully: ${username}`);
      return profileData;

    } catch (error) {
      console.error(`Failed to scrape profile ${username}:`, error);
      throw error;
    }
  }

  /**
   * Scrape posts from a profile
   * @param {string} username - Target username
   * @param {Object} options - Scraping options
   * @returns {Array} Array of post data
   */
  async scrapePosts(username, options = {}) {
    try {
      const { limit = 50, scrolls = 10 } = options;

      if (!this.page) {
        throw new Error('Scraper not initialized');
      }

      console.log(`Scraping posts from: ${username}`);
      
      await navigateToProfile(this.page, username);
      await randomWait(2000, 3000);

      // Check if profile is private
      const isPrivate = await this.page.$('h2:contains("This account is private")');
      if (isPrivate) {
        console.log(`Profile ${username} is private`);
        return [];
      }

      // Scroll to load posts
      await scrollToLoadMore(this.page, scrolls, 'article a');

      // Extract post data
      const posts = await this.page.evaluate((limit) => {
        const postLinks = Array.from(document.querySelectorAll('article a'));
        const posts = [];

        for (let i = 0; i < Math.min(postLinks.length, limit); i++) {
          const link = postLinks[i];
          const img = link.querySelector('img');
          
          if (img) {
            posts.push({
              url: link.href,
              imageUrl: img.src,
              alt: img.alt || '',
              scrapedAt: new Date().toISOString()
            });
          }
        }

        return posts;
      }, limit);

      console.log(`Scraped ${posts.length} posts from ${username}`);
      return posts;

    } catch (error) {
      console.error(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  }

  /**
   * Scrape followers list
   * @param {string} username - Target username
   * @param {Object} options - Scraping options
   * @returns {Array} Array of follower usernames
   */
  async scrapeFollowers(username, options = {}) {
    try {
      const { limit = 100, scrolls = 10 } = options;

      if (!this.page || !this.isLoggedIn) {
        throw new Error('Scraper not initialized or not logged in');
      }

      console.log(`Scraping followers from: ${username}`);
      
      await navigateToProfile(this.page, username);
      await randomWait(2000, 3000);

      // Click followers link
      await humanClick(this.page, 'a[href*="/followers/"]');
      await randomWait(3000, 4000);

      // Scroll to load followers
      await scrollToLoadMore(this.page, scrolls, 'div[role="dialog"] button');

      // Extract follower data
      const followers = await this.page.evaluate((limit) => {
        const followerElements = Array.from(
          document.querySelectorAll('div[role="dialog"] button')
        );
        
        const followers = [];
        
        for (let i = 0; i < Math.min(followerElements.length, limit); i++) {
          const element = followerElements[i];
          const usernameEl = element.querySelector('div div div span');
          
          if (usernameEl) {
            followers.push({
              username: usernameEl.textContent.trim(),
              scrapedAt: new Date().toISOString()
            });
          }
        }

        return followers;
      }, limit);

      // Close modal
      await humanClick(this.page, 'button[aria-label="Close"]');
      await randomWait(1000, 2000);

      console.log(`Scraped ${followers.length} followers from ${username}`);
      return followers;

    } catch (error) {
      console.error(`Failed to scrape followers from ${username}:`, error);
      throw error;
    }
  }

  /**
   * Scrape following list
   * @param {string} username - Target username
   * @param {Object} options - Scraping options
   * @returns {Array} Array of following usernames
   */
  async scrapeFollowing(username, options = {}) {
    try {
      const { limit = 100, scrolls = 10 } = options;

      if (!this.page || !this.isLoggedIn) {
        throw new Error('Scraper not initialized or not logged in');
      }

      console.log(`Scraping following from: ${username}`);
      
      await navigateToProfile(this.page, username);
      await randomWait(2000, 3000);

      // Click following link
      await humanClick(this.page, 'a[href*="/following/"]');
      await randomWait(3000, 4000);

      // Scroll to load following
      await scrollToLoadMore(this.page, scrolls, 'div[role="dialog"] button');

      // Extract following data
      const following = await this.page.evaluate((limit) => {
        const followingElements = Array.from(
          document.querySelectorAll('div[role="dialog"] button')
        );
        
        const following = [];
        
        for (let i = 0; i < Math.min(followingElements.length, limit); i++) {
          const element = followingElements[i];
          const usernameEl = element.querySelector('div div div span');
          
          if (usernameEl) {
            following.push({
              username: usernameEl.textContent.trim(),
              scrapedAt: new Date().toISOString()
            });
          }
        }

        return following;
      }, limit);

      // Close modal
      await humanClick(this.page, 'button[aria-label="Close"]');
      await randomWait(1000, 2000);

      console.log(`Scraped ${following.length} following from ${username}`);
      return following;

    } catch (error) {
      console.error(`Failed to scrape following from ${username}:`, error);
      throw error;
    }
  }

  /**
   * Scrape detailed post information
   * @param {string} postUrl - Direct post URL
   * @returns {Object} Detailed post data
   */
  async scrapePostDetails(postUrl) {
    try {
      if (!this.page) {
        throw new Error('Scraper not initialized');
      }

      console.log(`Scraping post details: ${postUrl}`);
      
      await this.page.goto(postUrl, { waitUntil: 'networkidle2' });
      await randomWait(2000, 3000);

      const postData = await this.page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };

        const getAttributeContent = (selector, attribute) => {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) : '';
        };

        // Extract post data
        const caption = getTextContent('article div[data-testid="post-caption"]');
        const likes = getTextContent('button[aria-label*="like"] span');
        const comments = getTextContent('a[href*="/comments/"] span');
        const username = getTextContent('article header a');
        const timestamp = getAttributeContent('time', 'datetime');
        
        // Get media URLs
        const images = Array.from(document.querySelectorAll('article img')).map(img => ({
          url: img.src,
          alt: img.alt || ''
        }));

        const videos = Array.from(document.querySelectorAll('article video')).map(video => ({
          url: video.src,
          poster: video.poster || ''
        }));

        return {
          username,
          caption,
          likes: parseInt(likes) || 0,
          comments: parseInt(comments) || 0,
          timestamp,
          images,
          videos,
          url: window.location.href,
          scrapedAt: new Date().toISOString()
        };
      });

      console.log(`Post details scraped successfully`);
      return postData;

    } catch (error) {
      console.error(`Failed to scrape post details:`, error);
      throw error;
    }
  }

  /**
   * Close the scraper and cleanup
   */
  async close() {
    try {
      if (this.browser) {
        await closeBrowser(this.browser);
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        console.log('Scraper closed successfully');
      }
    } catch (error) {
      console.error('Error closing scraper:', error);
    }
  }
}

module.exports = { InstagramScraper };
