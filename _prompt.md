Here i gave you the script i am updated and refactored evey thing is working perfectly well so just ignore everything except download carousel functionality, actually i can't even understand why this is happening, as i used vs code debugger i found on which line it actually is happening that is on line " await new Promise((resolve) => setTimeout(resolve, 800));" of function "forceFreshImageLoad" why just after this line the carousel post changed to next post like the next button click instead it seems

```javascript
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
          let postMediaDetails = await this.postMediaDetailsExtraction();

          if (!postMediaDetails.isCarouselPost) await this.downloadPostMedia(postMediaDetails, capture);
          else await this.downloadCarousel(capture);

          await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          postDownloaded++;
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
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  /* ────────────────────────────── Download: carousel ────────────────────────────── */

  downloadCarousel = async (capture) => {
    let isCarouselNextBtnExists = true;
    let postMediaDetails,
      postDownloadedIndex = 0;
    while (isCarouselNextBtnExists) {
      postMediaDetails = await this.postMediaDetailsExtraction();

      await this.downloadPostMedia(postMediaDetails, capture);

      isCarouselNextBtnExists = await Browser.page.evaluate(() => !!document.querySelector('article button[aria-label="Next"]'));

      if (isCarouselNextBtnExists) await Browser.EnhancedPage.clickNotClickable('article button[aria-label="Next"]');

      await Browser.EnhancedPage.waitForPageLoad();

      postDownloadedIndex++;
      console.log(`postDownloadedIndex is - ${postDownloadedIndex}`);
    }
  };

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
  /* ────────────────────────────── Extraction ────────────────────────────── */

  postMediaDetailsExtraction = async () => {
    return await Browser.page.evaluate(() => {
      let slideLis, visibleIndex;
      const url = document.URL;
      const postCode = url.split("/p/")[1].split("/")[0];
      const imgIndex = url.match(/[?&]img_index=(\d+)/)?.[1] || null;

      const postMediaDetails = { postCode, imgIndex, isCarouselPost: false };

      const article = document.querySelector('div[role="dialog"] article');

      const isCarouselPost = !!article.querySelector('button[aria-label="Next"], button[aria-label="Go back"]');
      if (isCarouselPost) {
        postMediaDetails.isCarouselPost = true;
        // -=-=-=-=-=-=- Getting Current Slide -=-=-=-=-=-=-
        const track = article.querySelector("ul"); // the carousel ul
        const viewport = track.closest('[role="presentation"]') || track.parentElement;
        const vpRect = viewport.getBoundingClientRect();

        slideLis = [...track.querySelectorAll(":scope > li")].filter((li) => !li.style.width || li.style.width !== "1px"); // skip spacer

        visibleIndex = -1;
        let bestOverlap = 0;
        slideLis.forEach((li, i) => {
          const r = li.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(r.right, vpRect.right) - Math.max(r.left, vpRect.left));
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            visibleIndex = i;
          }
        });
        // -=-=-=-=-=-=- is little bit complex but it is what it is -=-=-=-=-=-=-
      }

      let videoPost, imagePost;
      if (postMediaDetails.isCarouselPost) videoPost = slideLis[visibleIndex]?.querySelector("video");
      else videoPost = article.querySelector("video");
      if (videoPost)
        return {
          postType: "video",
          postLink: videoPost.currentSrc || videoPost.src,
          ...postMediaDetails,
        };

      if (postMediaDetails.isCarouselPost) imagePostContainingElements = slideLis[visibleIndex]?.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]');
      else imagePostContainingElements = article.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]');

      imagePost = [...imagePostContainingElements].filter((i) => i.naturalWidth > 150 && i.naturalHeight > 150).sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];

      return {
        postType: "image",
        postLink: imagePost.currentSrc || imagePost.src,
        ...postMediaDetails,
      };
    });
  };

  /* ────────────────────────────── Download: one item ────────────────────────────── */

  downloadPostMedia = async (postMediaDetails, capture) => {
    // For image Downloading
    if (postMediaDetails.postType === "image") {
      let src = postMediaDetails.postLink;
      await this.forceFreshImageLoad(src, capture);
      const key = capture.keyOf(src);
      const hit = capture.responses.get(key);
      const saved = await this.saveCapturedImage(hit.url, hit.buf, postMediaDetails.postCode, postMediaDetails.imgIndex);
      capture.responses.delete(key);
      return saved;
    }

    // For Video Downloading
    if (postMediaDetails.postType === "video") await this.downloadInstagramPostVideo();

    return false;
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

  saveCapturedImage = async (src, buf, postCode, imgIndex) => {
    if (!buf?.length) return false;
    if (buf.length > this.maxFileSize) {
      await Logger.logMSG(`Image too large: ${buf.length}`);
      return false;
    }

    const ext = (new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i) || [, "jpg"])[1].toLowerCase();
    const { profilePath, username } = ConfigManager.currentProfile;
    let imageSavePath;
    if (imgIndex) imageSavePath = path.resolve(profilePath, "carousels", `${username}-${postCode}-${imgIndex}.${ext}`);
    else imageSavePath = path.resolve(profilePath, "images", `${username}-${postCode}.${ext}`);

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
      await new Promise((resolve) => setTimeout(resolve, 800));
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
```

```javascript

```
