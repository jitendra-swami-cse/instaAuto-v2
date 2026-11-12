const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const Logger = require('../utils/Logger');
const config = require('../config/environment');

class MediaDownloadService {
  constructor(profileRepository, scrapingService, logger = null) {
    this.profileRepository = profileRepository;
    this.scrapingService = scrapingService;
    this.logger = logger || new Logger();
    this.downloadStats = {
      totalDownloaded: 0,
      currentSession: 0,
      errors: 0
    };
    
    // Configuration properties
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.supportedMediaTypes = ['image', 'video', 'carousel'];
  }

  // =============== MAIN DOWNLOAD METHODS ===============
  async downloadUserMedia(userName, options = {}) {
    const {
      mediaTypes = ['image', 'video', 'carousel'],
      maxItems = 50,
      skipExisting = true,
      createDirectories = true
    } = options;

    try {
      await this.logger.info(`Starting media download for user: ${userName}`);

      // Get user profile data
      const profile = await this.profileRepository.getProfileByUserName(userName);
      if (!profile) {
        throw new Error(`Profile not found: ${userName}`);
      }

      // Create download directory structure
      const downloadPath = await this.createDownloadStructure(userName, createDirectories);
      
      // Get posts data (from scraping service or existing data)
      const postsData = await this.getPostsData(userName);
      
      if (!postsData || postsData.length === 0) {
        await this.logger.warn(`No posts found for user: ${userName}`);
        return { success: true, downloaded: 0, message: 'No posts available' };
      }

      // Filter posts by media type and limit
      const filteredPosts = this.filterPosts(postsData, mediaTypes, maxItems);
      
      await this.logger.info(`Found ${filteredPosts.length} posts to download for ${userName}`);

      // Download each post
      const downloadResults = [];
      let downloadedCount = 0;

      for (const [index, post] of filteredPosts.entries()) {
        try {
          await this.logger.info(`Downloading post ${index + 1}/${filteredPosts.length} for ${userName}`);
          
          const result = await this.downloadSinglePost(post, downloadPath, skipExisting);
          downloadResults.push(result);
          
          if (result.downloaded) {
            downloadedCount++;
            this.downloadStats.totalDownloaded++;
            this.downloadStats.currentSession++;
          }

          // Add delay between downloads to be respectful
          await this.randomDelay(1, 3);

        } catch (error) {
          await this.logger.error(`Failed to download post ${post.shortcode || index} for ${userName}`, error);
          this.downloadStats.errors++;
          downloadResults.push({
            postId: post.shortcode || index,
            success: false,
            error: error.message
          });
        }
      }

      // Update profile stats
      await this.updateProfileDownloadStats(userName, downloadedCount);

      const result = {
        success: true,
        userName: userName,
        totalPosts: filteredPosts.length,
        downloaded: downloadedCount,
        skipped: filteredPosts.length - downloadedCount,
        downloadPath: downloadPath,
        details: downloadResults
      };

      await this.logger.info(`Media download completed for ${userName}`, result);
      return result;

    } catch (error) {
      await this.logger.error(`Media download failed for ${userName}`, error);
      throw error;
    }
  }

  async downloadSinglePost(post, downloadPath, skipExisting = true) {
    const postId = post.shortcode || post.id || 'unknown';
    
    try {
      // Determine post type and media URLs
      const mediaInfo = this.extractMediaInfo(post);
      
      if (!mediaInfo.urls || mediaInfo.urls.length === 0) {
        return {
          postId: postId,
          success: false,
          message: 'No downloadable media found'
        };
      }

      const downloadedFiles = [];

      // Download each media item in the post
      for (const [index, mediaUrl] of mediaInfo.urls.entries()) {
        const fileName = this.generateFileName(postId, mediaInfo.type, index, mediaUrl);
        const filePath = path.join(downloadPath, fileName);

        // Skip if file already exists
        if (skipExisting && await fs.pathExists(filePath)) {
          await this.logger.debug(`Skipping existing file: ${fileName}`);
          downloadedFiles.push({ fileName, skipped: true });
          continue;
        }

        // Download the media file
        const downloadResult = await this.downloadMediaFile(mediaUrl, filePath);
        downloadedFiles.push({
          fileName,
          downloaded: downloadResult.success,
          size: downloadResult.size,
          error: downloadResult.error
        });
      }

      const successfulDownloads = downloadedFiles.filter(f => f.downloaded).length;
      
      return {
        postId: postId,
        success: successfulDownloads > 0,
        downloaded: successfulDownloads > 0,
        mediaType: mediaInfo.type,
        filesCount: downloadedFiles.length,
        successfulDownloads: successfulDownloads,
        files: downloadedFiles
      };

    } catch (error) {
      await this.logger.error(`Failed to download post ${postId}`, error);
      return {
        postId: postId,
        success: false,
        error: error.message
      };
    }
  }

  async downloadMediaFile(url, filePath) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          const stats = await fs.stat(filePath);
          resolve({
            success: true,
            size: stats.size
          });
        });

        writer.on('error', (error) => {
          reject(error);
        });

        response.data.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      await this.logger.error(`Failed to download media file: ${url}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // =============== HELPER METHODS ===============
  async createDownloadStructure(userName, createDirectories = true) {
    if (!createDirectories) {
      return `./downloads/${userName}`;
    }

    const basePath = `./downloads/${userName}`;
    const datePath = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const downloadPath = path.join(basePath, datePath);

    await fs.ensureDir(downloadPath);
    await fs.ensureDir(path.join(downloadPath, 'images'));
    await fs.ensureDir(path.join(downloadPath, 'videos'));
    await fs.ensureDir(path.join(downloadPath, 'carousels'));

    return downloadPath;
  }

  async getPostsData(userName) {
    try {
      // First try to get from existing profile data
      const profileData = await this.profileRepository.readIndividualProfileData(userName);
      
      if (profileData.posts && profileData.posts.length > 0) {
        await this.logger.info(`Using existing posts data for ${userName}: ${profileData.posts.length} posts`);
        return profileData.posts;
      }

      // If no posts data, we need to scrape first
      if (this.scrapingService) {
        await this.logger.info(`No existing posts data found, scraping posts for ${userName}`);
        return await this.scrapingService.scrapeUserPosts(userName);
      }

      throw new Error(`No posts data available for ${userName} and no scraping service provided`);

    } catch (error) {
      await this.logger.error(`Failed to get posts data for ${userName}`, error);
      throw error;
    }
  }

  filterPosts(posts, mediaTypes, maxItems) {
    return posts
      .filter(post => {
        const mediaType = this.getPostMediaType(post);
        return mediaTypes.includes(mediaType);
      })
      .slice(0, maxItems);
  }

  extractMediaInfo(post) {
    const mediaInfo = {
      type: this.getPostMediaType(post),
      urls: []
    };

    try {
      // Handle different post structures based on your existing scraping
      if (post.edge_sidecar_to_children) {
        // Carousel post
        mediaInfo.type = 'carousel';
        mediaInfo.urls = post.edge_sidecar_to_children.edges.map(edge => {
          return edge.node.display_url || edge.node.video_url;
        }).filter(url => url);
      } else if (post.is_video && post.video_url) {
        // Video post
        mediaInfo.type = 'video';
        mediaInfo.urls = [post.video_url];
      } else if (post.display_url) {
        // Image post
        mediaInfo.type = 'image';
        mediaInfo.urls = [post.display_url];
      }

      return mediaInfo;

    } catch (error) {
      this.logger.error('Failed to extract media info from post', error);
      return { type: 'unknown', urls: [] };
    }
  }

  getPostMediaType(post) {
    if (post.edge_sidecar_to_children) return 'carousel';
    if (post.is_video) return 'video';
    return 'image';
  }

  generateFileName(postId, mediaType, index, mediaUrl) {
    const extension = this.getFileExtension(mediaUrl, mediaType);
    const indexSuffix = index > 0 ? `_${index}` : '';
    return `${postId}${indexSuffix}.${extension}`;
  }

  getFileExtension(url, mediaType) {
    // Try to get extension from URL
    const urlExtension = url.split('.').pop().split('?')[0].toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'webp'].includes(urlExtension)) {
      return urlExtension;
    }
    
    if (['mp4', 'mov', 'avi'].includes(urlExtension)) {
      return urlExtension;
    }

    // Fallback based on media type
    return mediaType === 'video' ? 'mp4' : 'jpg';
  }

  async updateProfileDownloadStats(userName, downloadedCount) {
    try {
      const profile = await this.profileRepository.getProfileByUserName(userName);
      if (profile && profile.isResource()) {
        profile.postsDownloaded = (profile.postsDownloaded || 0) + downloadedCount;
        profile.lastDownloadDate = new Date().toISOString();
        await this.profileRepository.saveProfile(profile);
      }
    } catch (error) {
      await this.logger.error(`Failed to update download stats for ${userName}`, error);
    }
  }

  async randomDelay(minSeconds, maxSeconds) {
    const delay = (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // =============== BATCH OPERATIONS ===============
  async downloadMultipleUsers(userNames, options = {}) {
    const results = [];

    for (const userName of userNames) {
      try {
        await this.logger.info(`Starting batch download for user: ${userName}`);
        const result = await this.downloadUserMedia(userName, options);
        results.push(result);

        // Delay between users
        await this.randomDelay(5, 10);

      } catch (error) {
        await this.logger.error(`Batch download failed for user: ${userName}`, error);
        results.push({
          success: false,
          userName: userName,
          error: error.message
        });
      }
    }

    return {
      success: true,
      processedUsers: userNames.length,
      results: results,
      summary: this.generateBatchSummary(results)
    };
  }

  generateBatchSummary(results) {
    const summary = {
      totalUsers: results.length,
      successfulUsers: results.filter(r => r.success).length,
      totalDownloaded: results.reduce((sum, r) => sum + (r.downloaded || 0), 0),
      errors: results.filter(r => !r.success).length
    };

    return summary;
  }

  // =============== CONFIGURATION AND STATS ===============
  getDownloadConfig() {
    return {
      maxFileSize: this.maxFileSize,
      supportedTypes: this.supportedMediaTypes,
      maxConcurrentDownloads: 5,
      defaultQuality: 'high',
      retryAttempts: 3
    };
  }

  getDownloadStats() {
    return {
      ...this.downloadStats,
      sessionTime: new Date().toISOString()
    };
  }

  resetSessionStats() {
    this.downloadStats.currentSession = 0;
  }

  // =============== CLEANUP AND MAINTENANCE ===============
  async cleanupOldDownloads(daysToKeep = 30) {
    try {
      const downloadsDir = './downloads';
      if (!(await fs.pathExists(downloadsDir))) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      await this.logger.info(`Cleaning up downloads older than ${daysToKeep} days`);

      // This is a placeholder - implement based on your directory structure
      // You might want to add date-based cleanup logic here

    } catch (error) {
      await this.logger.error('Failed to cleanup old downloads', error);
    }
  }
}

module.exports = MediaDownloadService;
