const fs = require("fs-extra");
const path = require("path");
const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const Instagram = require("./Instagram.js");
const utils = require("../../utils/utils.js");

class InstaScraper {
  constructor() {
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.supportedMediaTypes = ["image", "video", "carousel"];
  }

  /* ────────────────────────────── Profile ────────────────────────────── */

  scrapeProfileMetadata = async (username) => {
    try {
      if (username) await Instagram.navigateToProfile(username);

      const profileMetaData = await Browser.page.evaluate(() => {
        const username = document.querySelector("h2").textContent.trim();
        const contentMeta = document.querySelectorAll('meta[name="description"]')[0]?.content;
        const bio = contentMeta?.split("Instagram:")[1]?.trim();

        const followersCountText = contentMeta.substring(0, contentMeta.indexOf("Followers")).trim();
        const followingCountText = contentMeta.split("Followers,")[1].split("Following")[0].trim();
        const postsCountText = contentMeta.split("Following,")[1].split("Posts")[0].trim();
        const profilePicUrl = document.querySelectorAll(`a[href="/${username}/"] img`)[0].src;

        const parseCount = (text) => {
          if (!text) return 0;
          const cleanText = text.replace(/,/g, "");
          if (cleanText.includes("K")) return Math.floor(parseFloat(cleanText) * 1000);
          if (cleanText.includes("M")) return Math.floor(parseFloat(cleanText) * 1000000);
          return parseInt(cleanText) || 0;
        };

        return {
          username: username.replace("@", ""),
          bio,
          profilePicUrl,
          postsCount: parseCount(postsCountText),
          followersCount: parseCount(followersCountText),
          followingCount: parseCount(followingCountText),
          isPrivate: !![document.body].find((el) => el.textContent?.toLowerCase().includes("profile is private")),
          isVerified: !!document.querySelector('svg[aria-label="Verified"]'),
          scrapedAt: new Date().toISOString(),
        };
      });

      ConfigManager.currentProfile = profileMetaData;
      ConfigManager.currentProfile.profilePath = await ConfigManager.createProfileStructure(username);

      await fs.writeJson(`${ConfigManager.currentProfile.profilePath}/${username}.json`, ConfigManager.currentProfile, { spaces: 2 });
      return ConfigManager.currentProfile;
    } catch (error) {
      await Logger.logError("Failed to extract profile info:", error);
      return null;
    }
  };

  /* ────────────────────────────── Scrape loop ────────────────────────────── */

  scrapePosts = async (username, options = {}) => {
    try {
      let { maxPosts = 50 } = options;

      await Logger.logMSG(`Scraping posts from: ${username}`);
      await Instagram.navigateToProfile(username);

      const currentProfile = await this.scrapeProfileMetadata(username);
      if (currentProfile?.isPrivate) {
        await Logger.logMSG(`Profile ${username} is private`);
        return false;
      }
      if (currentProfile.postsCount === 0) {
        await Logger.logMSG(`Profile ${username} has no posts to download.`);
        return false;
      }
      if (currentProfile.postsCount < maxPosts) maxPosts = currentProfile.postsCount;

      const capture = await this.startImageResponseCapture();
      try {
        await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"], a[href*="/reel/"]');
        await Browser.EnhancedPage.waitForElementRobust('div[role="dialog"] article');

        let i = 0;
        while (i++ < maxPosts) {
          const { shortcode, items } = await this.postMediaDetailsExtraction();

          if (!shortcode) {
            await Logger.logMSG(`Post ${i}: no shortcode found, skipping`);
          } else if (items.length === 0) {
            await Logger.logMSG(`Post ${shortcode}: no media found`);
          } else if (items.length === 1) {
            await this.downloadOneItem(items[0], capture, `${shortcode}-1`);
          } else {
            await this.downloadCarousel(shortcode, items, capture);
          }

          // Advance to the next *post*. After a carousel completes, the in-article
          // Next arrow is gone, so this resolves to the outer post-nav arrow.
          await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          await utils.randomDelay(1, 2);
        }
      } finally {
        capture.stop();
      }
    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}: ${error.message}`);
      throw error;
    }
  };

  /* ────────────────────────────── Extraction ────────────────────────────── */

  postMediaDetailsExtraction = async () => {
    return await Browser.page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const article = dialog?.querySelector("article");
      if (!article) return { shortcode: null, items: [] };

      const permalink = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      const shortcode = permalink?.getAttribute("href")?.match(/\/(?:p|reel)\/([^/?#]+)/)?.[1] || null;

      const items = [];
      const carouselUl = article.querySelector("ul");
      const slides = carouselUl ? [...carouselUl.querySelectorAll(":scope > li")] : [];

      if (slides.length > 1) {
        for (const li of slides) {
          const video = li.querySelector("video");
          if (video) {
            items.push({ postType: "video", postLink: video.currentSrc || video.src });
            continue;
          }
          const img = li.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"]');
          if (img) items.push({ postType: "image", postLink: img.currentSrc || img.src });
        }
        return { shortcode, items };
      }

      const video = article.querySelector("video");
      if (video) return { shortcode, items: [{ postType: "video", postLink: video.currentSrc || video.src }] };

      const img = [...article.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]')]
        .filter((i) => i.naturalWidth > 150 && i.naturalHeight > 150)
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];

      if (img) items.push({ postType: "image", postLink: img.currentSrc || img.src });
      return { shortcode, items };
    });
  };

  /* ────────────────────────────── Download: one item ────────────────────────────── */

  /**
   * Download a single media item. Returns the saved path or false.
   */
  downloadOneItem = async (item, capture, baseName) => {
    if (item.postType === "image") {
      const ok = await this.forceFreshImageLoad(item.postLink, capture);
      if (!ok) {
        await Logger.logMSG(`Image not captured: ${item.postLink}`);
        return false;
      }
      const key = capture.keyOf(item.postLink);
      const hit = capture.responses.get(key);
      const saved = await this.saveCapturedImage(hit.url, hit.buf, baseName);
      capture.responses.delete(key);
      return saved;
    }

    if (item.postType === "video") {
      const tmpPath = await this.downloadInstagramPostVideo();
      if (!tmpPath) return false;

      const { profilePath, username } = ConfigManager.currentProfile;
      const finalPath = path.resolve(profilePath, "videos", `${username}-${baseName}.webm`);

      if (await fs.pathExists(finalPath)) {
        await fs.remove(tmpPath).catch(() => {});
        await Logger.logMSG(`Video already exists, skipping: ${finalPath}`);
        return finalPath;
      }
      await fs.move(tmpPath, finalPath, { overwrite: false });
      await Logger.logMSG(`Video saved: ${finalPath}`);
      return finalPath;
    }

    return false;
  };

  /* ────────────────────────────── Download: carousel ────────────────────────────── */

  downloadCarousel = async (shortcode, items, capture) => {
    const saved = [];
    const needsNavigation = items.some((i) => i.postType === "video");

    for (let i = 0; i < items.length; i++) {
      if (needsNavigation && i > 0) {
        const hasNext = await Browser.page.evaluate(() => !!document.querySelector('article button[aria-label="Next"]'));
        if (!hasNext) break;
        await Browser.EnhancedPage.clickNotClickable('article button[aria-label="Next"]');
        await utils.randomDelay(0.3, 0.6);
      }

      const p = await this.downloadOneItem(items[i], capture, `${shortcode}-${i + 1}`);
      if (p) saved.push(p);
    }
    return saved;
  };

  /* ────────────────────────────── Image capture plumbing ────────────────────────────── */

  startImageResponseCapture = async () => {
    const responses = new Map();
    const keyOf = (url) => {
      try {
        const u = new URL(url);
        return `${u.hostname}${u.pathname}`;
      } catch {
        return null;
      }
    };

    const remove = await Browser.EnhancedPage.addResponseListener(
      (_req, res) => {
        if (res.request().resourceType() !== "image") return false;
        const host = new URL(res.url()).hostname;
        return host.endsWith("cdninstagram.com") || host.endsWith("fbcdn.net");
      },
      async (_req, res) => {
        try {
          const buf = await res.buffer();
          if (!buf?.length) return;
          responses.set(keyOf(res.url()), { buf, url: res.url() });
        } catch {}
      },
    );

    return {
      responses,
      keyOf,
      stop: () => {
        remove();
        responses.clear();
      },
    };
  };

  saveCapturedImage = async (src, buf, baseName) => {
    if (!buf?.length) return false;
    if (buf.length > this.maxFileSize) {
      await Logger.logMSG(`Image too large: ${buf.length}`);
      return false;
    }

    const ext = (new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i) || [, "jpg"])[1].toLowerCase();
    const { profilePath, username } = ConfigManager.currentProfile;
    const imageSavePath = path.resolve(profilePath, "images", `${username}-${baseName}.${ext}`);

    if (await fs.pathExists(imageSavePath)) {
      await Logger.logMSG(`Already exists, skipping: ${imageSavePath}`);
      return imageSavePath;
    }

    await fs.mkdir(path.dirname(imageSavePath), { recursive: true });
    await fs.writeFile(imageSavePath, buf);
    await Logger.logMSG(`Image saved: ${imageSavePath} (${(buf.length / 1024).toFixed(1)} KB)`);
    return imageSavePath;
  };

  forceFreshImageLoad = async (src, capture, timeoutMs = 15000) => {
    const key = capture.keyOf(src);
    if (!key) return false;
    if (capture.responses.has(key)) return true;

    await Browser.page.evaluate((src) => {
      const img = [...document.querySelectorAll('div[role="dialog"] article img')].find((i) => (i.currentSrc || i.src) === src);
      if (!img) return;
      const u = new URL(src);
      u.searchParams.set("_t", Date.now());
      img.src = u.toString();
    }, src);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (capture.responses.has(key)) return true;
      await utils.randomDelay(0.2);
    }
    return false;
  };

  /* ────────────────────────────── Video ────────────────────────────── */

  /**
   * Records the currently-playing <video> via MediaRecorder.
   * @returns {Promise<string|false>} saved path or false
   */
  downloadInstagramPostVideo = async () => {
    const page = Browser.page;
    const isVideoPresent = await page.evaluate(() => !!document.querySelector("article video"));
    if (!isVideoPresent) {
      await Logger.logMSG("No video found on page.");
      return false;
    }

    const { profilePath, username } = ConfigManager.currentProfile;
    const videoSavePath = path.resolve(profilePath, "videos", `${username}-${Date.now()}.webm`);

    const dataUrl = await page.evaluate(async (fnSource) => {
      const recordVideo = new Function(`return (${fnSource})`)();
      return await recordVideo();
    }, this.recordVideo.toString());

    if (!dataUrl) {
      await Logger.logMSG("Video recording returned no data.");
      return false;
    }

    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    await fs.mkdir(path.dirname(videoSavePath), { recursive: true });
    await fs.writeFile(videoSavePath, buffer);

    await Logger.logMSG(`Video saved: ${videoSavePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    return videoSavePath;
  };

  recordVideo = async () => {
    const video = document.querySelector("video");
    if (!video) throw new Error("No <video> element found on page");

    const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm",
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const finished = new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "video/webm" });
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
    });

    const maxDurationMs = 5 * 60 * 1000;
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), maxDurationMs));

    video.currentTime = 0;
    await video.play();
    recorder.start();

    const ended = new Promise((resolve) => {
      video.addEventListener(
        "ended",
        () => {
          if (recorder.state !== "inactive") recorder.stop();
          resolve("ended");
        },
        { once: true },
      );
    });

    await Promise.race([ended, timeout]);
    if (recorder.state !== "inactive") recorder.stop();

    return await finished;
  };
}

module.exports = new InstaScraper();
