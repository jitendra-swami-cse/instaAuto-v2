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

        let postDownloaded = 0;
        while (postDownloaded < maxPosts) {
          const { postType, postLink } = await this.postMediaDetailsExtraction();

          if (items.length === 1) {
            // Single post — no index suffix, into images/ (or videos/)
            await this.downloadOneItem(items[0], capture, shortcode, "images");
          } else {
            await this.downloadCarousel(shortcode, items, capture);
          }

          await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          console.log(`Posts downloaded are : ${postDownloaded}`);
          await utils.randomDelay(1, 2);
        }
      } finally {
        capture.stop();
      }
    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}: ${error.message}`);
      throw error;
    }
    console.log("All Posts scraping Done.");
  };

  /* ────────────────────────────── Extraction ────────────────────────────── */

  postMediaDetailsExtraction = async () => {
    return await Browser.page.evaluate(() => {
      const article = document.querySelector('div[role="dialog"] article');

      const isCarouselPost = !!article.querySelector('button[aria-label="Next"], button[aria-label="Go back"]');
      if (isCarouselPost) return { postType: "carousel", postLink: false };
      else {
        const videoPost = article.querySelector("video");
        if (videoPost) return { postType: "video", postLink: videoPost.currentSrc || videoPost.src };

        const imagePost = [...article.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]')]
          .filter((i) => i.naturalWidth > 150 && i.naturalHeight > 150)
          .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];

        return { postType: "image", postLink: imagePost.currentSrc || imagePost.src };
      }
    });
  };

  /* ────────────────────────────── Download: one item ────────────────────────────── */

  downloadOneItem = async (item, capture, baseName, folder = "images") => {
    if (item.postType === "image") {
      let src = item.postLink;
      await this.forceFreshImageLoad(src, capture);
      const key = capture.keyOf(src);
      const hit = capture.responses.get(key);
      const saved = await this.saveCapturedImage(hit.url, hit.buf, baseName, folder);
      capture.responses.delete(key);
      return saved;
    }

    if (item.postType === "video") await this.downloadInstagramPostVideo();

    return false;
  };

  /* ────────────────────────────── Download: carousel ────────────────────────────── */

  downloadCarousel = async (shortcode, items, capture) => {
    const saved = [];

    for (let i = 0; i < items.length; i++) {
      // Navigate to slide i. Slide 0 is already visible.
      if (i > 0) {
        const hasNext = await Browser.page.evaluate(() => !!document.querySelector('article button[aria-label="Next"]'));
        if (!hasNext) {
          await Logger.logMSG(`Carousel ${shortcode}: Next button gone before slide ${i + 1}; stopping`);
          break;
        }
        await Browser.EnhancedPage.clickNotClickable('article button[aria-label="Next"]');
        await utils.randomDelay(0.4, 0.8);
      }

      // Re-read the current slide's src AFTER navigation — this is the key fix
      // for slide 1: we want the src that matches what is currently loaded.
      const currentSrc = await Browser.page.evaluate((idx) => {
        const article = document.querySelector('div[role="dialog"] article');
        const carouselUl = article?.querySelector("ul");
        const slides = carouselUl ? [...carouselUl.querySelectorAll(":scope > li")] : [];
        const li = slides[idx];
        if (!li) return null;
        const video = li.querySelector("video");
        if (video) return { type: "video", src: video.currentSrc || video.src };
        const img = li.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"]');
        return img ? { type: "image", src: img.currentSrc || img.src } : null;
      }, i);

      if (!currentSrc?.src) {
        await Logger.logMSG(`Carousel ${shortcode} slide ${i + 1}: no src found, skipping`);
        continue;
      }

      const itemToDownload = { postType: currentSrc.type, postLink: currentSrc.src, slideIndex: i };
      const p = await this.downloadOneItem(itemToDownload, capture, `${shortcode}-${i + 1}`, "carousels");
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

  saveCapturedImage = async (src, buf, baseName, folder = "images") => {
    if (!buf?.length) return false;
    if (buf.length > this.maxFileSize) {
      await Logger.logMSG(`Image too large: ${buf.length}`);
      return false;
    }

    const ext = (new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i) || [, "jpg"])[1].toLowerCase();
    const { profilePath, username } = ConfigManager.currentProfile;
    const imageSavePath = path.resolve(profilePath, folder, `${username}-${baseName}.${ext}`);

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

    const targetPathname = new URL(src).pathname;

    await Browser.page.evaluate((pathname) => {
      // Match by pathname so we tolerate query-string / currentSrc differences.
      const imgs = [...document.querySelectorAll('div[role="dialog"] article img')];
      const targets = imgs.filter((img) => {
        try {
          return new URL(img.currentSrc || img.src).pathname === pathname;
        } catch {
          return false;
        }
      });
      for (const img of targets) {
        const u = new URL(img.currentSrc || img.src);
        u.searchParams.set("_t", Date.now());
        img.src = u.toString();
      }
    }, targetPathname);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (capture.responses.has(key)) return true;
      // Fallback: any entry whose key ends with the pathname is acceptable.
      for (const k of capture.responses.keys()) {
        if (k.endsWith(targetPathname)) return true;
      }
      await utils.randomDelay(0.2);
    }
    return false;
  };

  /* ────────────────────────────── Video ────────────────────────────── */

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
