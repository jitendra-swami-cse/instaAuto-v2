const fs = require("fs-extra");
const path = require("path");
const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const Instagram = require("./Instagram.js");
const utils = require("../../utils/utils.js");
const { error } = require("console");

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

      ConfigManager.currentProfile = { ...ConfigManager.currentProfile, ...profileMetaData };
      ConfigManager.currentProfile.profilePath = await ConfigManager.createProfileStructure(username);

      await fs.writeJson(`${ConfigManager.currentProfile.profilePath}/${username}.json`, ConfigManager.currentProfile, { spaces: 2 });
      return ConfigManager.currentProfile;
    } catch (error) {
      await Logger.logError("Failed to extract profile info:", error);
      return null;
    }
  };

  /* ────────────────────────────── Scrape loop ────────────────────────────── */

  scrapeProfile = async (username, options = {}) => {
    try {
      ConfigManager.currentProfile = ConfigManager.getProfile(username);

      // Still needs a place to check or add posts = []
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

        let isNextBtnExists,
          postDownloaded = 0;

        do {
          const postMediaDetails = await this.postMediaDetailsExtraction();

          const shouldUpdate = await ConfigManager.checkStatus(postMediaDetails[0]);
          if (shouldUpdate !== "update") return true;

          if (!postMediaDetails[0].isCarouselPost) {
            postMediaDetails[0].mediaDownloadPath = await this.downloadPostMedia(postMediaDetails[0], capture);
          } else {
            const carouselMedia = await this.downloadCarousel(postMediaDetails, capture);
            postMediaDetails[0].mediaDownloadPaths = carouselMedia?.map((media) => media.savePath).filter(Boolean) || [];
            postMediaDetails[0].imgIndex = 1;
          }

          await Browser.EnhancedPage.waitForPageLoad();

          await ConfigManager.updateStatus();
          isNextBtnExists = await Browser.page.evaluate(() => !!document.querySelector('[aria-label="Next"]'));
          if (isNextBtnExists) await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          postDownloaded++;
          console.log(`Posts downloaded: ${postDownloaded}`);
          await utils.randomDelay(1, 2);
        } while (postDownloaded < maxPosts);
      } finally {
        capture.stop();
      }
    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}: ${error.message}`);
      throw error;
    }
    console.log("All Posts scraping Done.");
  };

  /* ────────────────────────────── Extraction Post Media Details Must before Downloading ────────────────────────────── */

  postMediaDetailsExtraction = async () => {
    return await Browser.page.evaluate(() => {
      const imgLinks = [...document.querySelectorAll('div[role="dialog"] article ._aagv img')]
        .filter((i) => i.naturalWidth > 150 && i.naturalHeight > 150)
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
        .map((el) => el.src);
      const imgDetails = imgLinks.map((imgLink) => ({ postType: "image", postLink: imgLink }));
      const videoLinks = [...document.querySelectorAll('div[role="dialog"] article video')].map((vidEl) => vidEl.src);
      const vidsDetails = videoLinks.map((vidlink) => ({ postType: "video", postLink: vidlink }));
      let postMediaDetails = [...imgDetails, ...vidsDetails];

      const url = document.URL;
      const postCode = url.split("/p/")[1]?.split("/")[0] || url.split("/reel/")[1]?.split("/")[0] || null;
      // const imgIndex = url.match(/[?&]img_index=(\d+)/)?.[1] || null;

      let isCarouselPost = !!document
        .querySelector('div[aria-modal="true"][role="dialog"] article')
        .querySelector('button[aria-label="Next"], button[aria-label="Go back"]');

      postMediaDetails = postMediaDetails.map((obj) => ({ postCode, isCarouselPost, ...obj }));
      return postMediaDetails;
    });
  };

  /* ────────────────────────────── Extraction Post MetaData ────────────────────────────── */
  scrapePostMetaData = async (postMediaDetails) => {
    try {
      const postDescription = await Browser.page.evaluate(() => document.querySelectorAll("ul h1").textContent);
      const numberOfLikes = await Browser.page.evaluate(() => document.querySelector('[href*="/liked_by/"]').textContent.split(" ")[0] * 1);
      const comments = await Browser.page.evaluate(() => {
        /*   let arr = [];
        document.querySelectorAll("ul").forEach((el) => el.textContent.includes("Reply") && arr.push(el));
        let arr1 = arr.map((el) => el.querySelector("h3"));
        let arr2 = arr1.map((el) => el.nextElementSibling);
        let comments = arr2.map((el) => el.textContent);
        let originalComments = [...new Set(comments)];
        originalComments; */
        // -=-=-=-=-=-=-=-=- OR -=-=-=-=-=-=-=-=-
        let arr = [];
        document.querySelectorAll("ul").forEach((el) => el.textContent.includes("Reply") && arr.push(el));
        return [...new Set(arr.map((el) => el.querySelector("h3").nextElementSibling.textContent))];
      });

      const postDetails = { postDescription, numberOfLikes, comments, ...postMediaDetails };
      const { username, profilePath } = ConfigManager.currentProfile;
      await fs.writeJson(
        path.resolve(
          profilePath,
          postDetails.postType === "video" ? "videos" : postDetails.imgIndex ? "carousels" : "images",
          `${username}-${postDetails.postCode}${postDetails.imgIndex ? `-${postDetails.imgIndex}` : ""}.json`,
        ),
        postDetails,
        { spaces: 2 },
      );
      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--

      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--

      return postDetails;
    } catch (error) {
      console.error(`Error in function scrapePostMetaData ...... ❌💀❌💀❌💀❌.`);
      console.error(error);
      return false;
    }
  };

  /* ────────────────────────────── Download: carousel ────────────────────────────── */

  downloadCarousel = async (postMediaDetailsArray, capture) => {
    try {
      let index = 1;
      while (true) {
        postMediaDetailsArray = postMediaDetailsArray.map((obj, i) => ({ imgIndex: i + 1, ...obj }));
        for (const postMediaDetails of postMediaDetailsArray) {
          if (!postMediaDetails.savePath) postMediaDetails.savePath = await this.downloadPostMedia(postMediaDetails, capture);
        }

        const hasNext = await Browser.page.evaluate(() => !!document.querySelector('div[role="dialog"] article button[aria-label="Next"]'));
        if (!hasNext) break;

        await Browser.EnhancedPage.clickNotClickable('article button[aria-label="Next"]');
        await Browser.EnhancedPage.waitForPageLoad();

        const newPostMediaDetailsArray = await this.postMediaDetailsExtraction();
        newPostMediaDetailsArray.forEach((newPostMediaDetails) => {
          const flagNew = !postMediaDetailsArray.some((postMediaDetails) => postMediaDetails.postLink == newPostMediaDetails.postLink);
          if (flagNew) postMediaDetailsArray.push(newPostMediaDetails);
        });

        index++;
        console.log(`Carousel slide index: ${index}`);
      }

      console.log(`Carousel done: ${index} slides processed`);
      return postMediaDetailsArray;
    } catch (error) {
      console.error(`Error in function downloadCarousel ...... ❌💀❌💀❌💀❌.`);
      console.error(error);
      return false;
    }
  };

  /* ────────────────────────────── Download: Video or Image Media of Post not carousel ────────────────────────────── */

  downloadPostMedia = async (postMediaDetails, capture) => {
    let downloadPath;
    try {
      // Image
      if (postMediaDetails.postType === "image") {
        const src = postMediaDetails.postLink;
        if (!src) {
          await Logger.logMSG(`No image src (${postMediaDetails.postCode})`);
          return false;
        }

        await this.forceFreshImageLoad(src, capture);

        const pathname = new URL(src).pathname;
        const hit = capture.responses.get(pathname);
        if (!hit) {
          await Logger.logMSG(`Response missing for ${src}`);
          return false;
        }

        downloadPath = await this.saveCapturedImage(hit.url, hit.buf, postMediaDetails.postCode, postMediaDetails.imgIndex);
        capture.responses.delete(pathname);
      }

      // Video
      else if (postMediaDetails.postType === "video") {
        downloadPath = await this.downloadInstagramPostVideo();
      }

      const postDetails = await this.scrapePostMetaData(postMediaDetails);
      // ConfigManager.currentProfile.posts.push(postDetails)
      return downloadPath;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  /* ────────────────────────────── Image capture plumbing ────────────────────────────── */

  startImageResponseCapture = async () => {
    const responses = new Map();

    // Key by pathname only — Instagram rotates CDN hostnames (fjai2-4 → fjai2-6),
    // so hostname+pathname is too strict. Pathname is unique per image.
    const keyOf = (url) => {
      try {
        return new URL(url).pathname;
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

  saveCapturedImage = async (src, buf, postCode, imgIndex) => {
    if (!buf?.length) return false;
    if (buf.length > this.maxFileSize) {
      await Logger.logMSG(`Image too large: ${buf.length}`);
      return false;
    }

    const ext = (new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i) || [, "jpg"])[1].toLowerCase();
    const { profilePath, username } = ConfigManager.currentProfile;

    const imageSavePath = path.resolve(profilePath, imgIndex ? "carousels" : "images", `${username}-${postCode}${imgIndex ? `-${imgIndex}` : ""}.${ext}`);

    if (await fs.pathExists(imageSavePath)) {
      await Logger.logMSG(`Already exists, skipping: ${imageSavePath}`);
      return imageSavePath;
    }

    await fs.mkdir(path.dirname(imageSavePath), { recursive: true });
    await fs.writeFile(imageSavePath, buf);
    await Logger.logMSG(`Image saved: ${imageSavePath} (${(buf.length / 1024).toFixed(1)} KB)`);
    return imageSavePath;
  };

  forceFreshImageLoad = async (src, capture, timeoutMs = 30000) => {
    const key = capture.keyOf(src);
    if (!key) return false;
    if (capture.responses.has(key)) return true;

    await Browser.page.evaluate((pathname) => {
      // Match by pathname to tolerate query-string / currentSrc differences.
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
    }, key);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (capture.responses.has(key)) return true;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return false;
  };

  /* ────────────────────────────── Video Recording and Downloading that Recording ────────────────────────────── */

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
