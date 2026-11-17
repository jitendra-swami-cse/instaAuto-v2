i opened instagram page using puppeteer using my code as given below and opened post somehow, In devtools of chrome for selector i do this and i got image element and it's src now tell me how can i dwonload that image at a given path as i already develop a code for video downloading but for image downloading i need your help please give me most optimize code. the script is as given below->

```javascript
const fs = require("fs-extra");
const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const EnhancedPage = require("../CoreModules/EnhancedPage.js");
const Instagram = require("./Instagram.js");
const utils = require("../../utils/utils.js");
const path = require("path");

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
  scrapeProfileMetadata = async (username) => {
    try {
      if (username) await Instagram.navigateToProfile(username);

      const profileMetaData = await Browser.page.evaluate(() => {
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

      ConfigManager.currentProfile = profileMetaData;

      // Create Profile directory structure
      ConfigManager.currentProfile.profilePath = await ConfigManager.createProfileStructure(username);

      await fs.writeJson(`${ConfigManager.currentProfile.profilePath}/${username}.json`, ConfigManager.currentProfile, { spaces: 2 });

      return ConfigManager.currentProfile;
    } catch (error) {
      await Logger.logError("Failed to extract profile info:", error);
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
      let { maxPosts = 50, skipExisting = true } = options;

      await Logger.logMSG(`Scraping posts from: ${username}`);

      await Instagram.navigateToProfile(username);

      const currentProfile = await this.scrapeProfileMetadata(username);

      // Check if profile is private
      if (currentProfile?.isPrivate) {
        await Logger.logMSG(`Profile ${username} is private`);
        return false;
      }

      if (currentProfile.postsCount == 0) {
        await Logger.logMSG(`Profile does have any posts to download.`);
        return false;
      }

      if (currentProfile.postsCount < maxPosts && currentProfile.postsCount > 0) maxPosts = currentProfile.postsCount;

      // Click on any post to open the modal
      await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"], a[href*="/reel/"]'); // Either post or reel

      const links = [];

      await Browser.EnhancedPage.waitForElementRobust('div[role="dialog"] article');

      let postDownloaded = 1;
      let postMedia;
      while (postDownloaded < maxPosts) {
        postMedia = await this.postMediaDetailsExtraction();
        links.push(postMedia);

        await this.downloadPostMedia(postMedia);

        postDownloaded++;
        await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"] '); // Either post or reel
        await utils.randomDelay(2, 1);
      }
      // -=-=- Testing and Development -=-=-=-
      console.log(links);
    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  };

  postMediaDetailsExtraction = async () => {
    const postMedia = await Browser.page.evaluate(() => {
      if (document.querySelector("article video"))
        return {
          postType: "video",
          postLink: document.querySelector("article video").src,
        };
      else if (document.querySelector('article [aria-label="Next"]')) return { postType: "carousel", postLink: "yet not" };
      else if (document.querySelector("article ._aagv img"))
        return {
          postType: "image",
          postLink: document.querySelector("article ._aagv img").src,
        };
      else return { type: false };
    });
    return postMedia;
  };

  downloadPostMedia = async (postMedia) => {
    // Post must be open on page in selector "article"
    const { postType, postLink } = postMedia;

    if (postType === "video") await this.downloadInstagramPostVideo();
    console.log(`Post Downloaded`);
  };

  downloadInstagramPostVideo = async () => {
    const page = Browser.page;
    const isVideoPresent = await page.evaluate(() => !!document.querySelector("article video"));

    if (!isVideoPresent) {
      Logger.logMSG("can't Download — no video found on page.");
      return false;
    }

    const { profilePath, username } = ConfigManager.currentProfile;
    const VIDEO_SAVE_PATH = path.resolve(profilePath, "videos", `${username}-${Date.now()}.webm`);

    // 👇 page.evaluate now resolves only when the page's promise resolves,
    // i.e. after the recording finished and the data URL is available.
    const dataUrl = await page.evaluate(async (fnSource) => {
      const recordVideo = new Function(`return (${fnSource})`)();
      return await recordVideo();
    }, this.recordVideo.toString());

    if (!dataUrl) {
      Logger.logMSG("Video can't Downloaded by current. Code Check n modify code.");
      return false;
    }

    // Strip the "data:video/webm;base64," prefix and write to disk.
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    await fs.mkdir(path.dirname(VIDEO_SAVE_PATH), { recursive: true });
    await fs.writeFile(VIDEO_SAVE_PATH, buffer);

    console.log(`Video recording is Done. Saved to: ${VIDEO_SAVE_PATH}`);
    console.log(`File size: ${buffer.length / 1024 / 1024} MB`);

    console.log("Ended........");
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

    // Resolve only AFTER the blob is built and converted to a base64 data URL
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

          console.log("Recording finished in page.");
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
    });

    // Safety net in case "ended" never fires (live stream, paused, etc.)
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

    return await finished; // <-- returns the data URL string
  };
}

module.exports = new InstaScraper();
```

<!-- ===================================================== -->

Let me give you some other methods also and i want you to analyze all of your and the methods which are given below and select one which is short, realiable and optimized and if possible than optimise that more make that more short

For your existing Puppeteer-based Instagram scraper, I recommend **downloading the image directly from its original&#x20;**`src`**&#x20;URL using Node.js**, rather than converting it to Base64 through `page.evaluate()`.

This is more efficient because:

- No Base64 conversion or additional memory overhead.
- No need to transfer image data from Chrome to Node.js.
- You can stream the response directly to a file.
- You can enforce file-size limits.
- You can preserve the original image format (JPEG, WebP, etc.).
- You can reuse your existing `fs-extra`, `path`, and `ConfigManager` modules.

There is also an important improvement I recommend: use the actual image URL extracted from the open post, rather than relying on a CSS class such as `._aagv`, which Instagram can change.

## **1. Recommended implementation**

Use Node.js's built-in `fetch()` and `Readable.fromWeb()` to stream the image.

Since you're using modern Node.js, you don't need another npm package.

Add this import at the top:

```
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
```

Now add this method to your `InstaScraper` class.

### **Add&#x20;**`downloadInstagramPostImage()`

```

downloadInstagramPostImage = async (postLink) => {
  const page = Browser.page;

  try {
    if (!postLink || typeof postLink !== "string") {
      throw new Error("Invalid image URL.");
    }

    const imageUrl = new URL(postLink);

    // Only allow Instagram CDN URLs.
    const allowedHost =
      imageUrl.hostname.endsWith("cdninstagram.com") ||
      imageUrl.hostname.endsWith("fbcdn.net");

    if (imageUrl.protocol !== "https:" || !allowedHost) {
      throw new Error(`Untrusted image URL: ${imageUrl.hostname}`);
    }

    const { profilePath, username } = ConfigManager.currentProfile;

    const IMAGE_SAVE_DIR = path.resolve(profilePath, "images");

    await fs.ensureDir(IMAGE_SAVE_DIR);

    // Obtain browser cookies for authenticated requests.
    const cookies = await page.browserContext().cookies(postLink);

    const cookieHeader = cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    const userAgent = await page.evaluate(() => navigator.userAgent);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response;

    try {
      response = await fetch(postLink, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "Referer": "https://www.instagram.com/",
          "Cookie": cookieHeader,
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Image request failed: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    const extensions = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/avif": ".avif",
    };

    const extension = extensions[contentType.split(";")[0].toLowerCase()];

    if (!extension) {
      throw new Error(`Unsupported image format: ${contentType}`);
    }

    const fileName = `${username}-${Date.now()}${extension}`;
    const IMAGE_SAVE_PATH = path.join(IMAGE_SAVE_DIR, fileName);

    const contentLength = Number(response.headers.get("content-length"));

    if (contentLength > this.maxFileSize) {
      throw new Error("Image exceeds maximum allowed file size.");
    }

    if (!response.body) {
      throw new Error("Empty image response.");
    }

    // Stream directly to disk with a maximum-size limit.
    let downloadedBytes = 0;

    const { Transform } = require("stream");

    const sizeLimiter = new Transform({
      transform(chunk, encoding, callback) {
        downloadedBytes += chunk.length;

        if (downloadedBytes > this.maxFileSize) {
          callback(new Error("Image exceeds maximum allowed file size."));
          return;
        }

        callback(null, chunk);
      },
    });

    // Pass the configured limit to the stream.
    sizeLimiter.maxFileSize = this.maxFileSize;

    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, encoding, callback) {
          downloadedBytes += chunk.length;

          if (downloadedBytes > this.maxFileSize) {
            callback(new Error("Image exceeds maximum allowed file size."));
            return;
          }

          callback(null, chunk);
        },
      }),
      fs.createWriteStream(IMAGE_SAVE_PATH)
    );

    console.log(`Image downloaded: ${IMAGE_SAVE_PATH}`);
    console.log(`File size: ${(downloadedBytes / 1024).toFixed(2)} KB`);

    return IMAGE_SAVE_PATH;

  } catch (error) {
    await Logger.logMSG(`Image download failed: ${error.message}`);
    return false;
  }
};

```

**One correction before using this code:** the stream limiter above should use a closure for the configured size rather than `this` inside the `Transform` callback. Here is the corrected, simplified streaming section to use in the method:

```

let downloadedBytes = 0;
const maxFileSize = this.maxFileSize;

const sizeLimiter = new Transform({
  transform(chunk, encoding, callback) {
    downloadedBytes += chunk.length;

    if (downloadedBytes > maxFileSize) {
      callback(new Error("Image exceeds maximum allowed file size."));
      return;
    }

    callback(null, chunk);
  },
});

await pipeline(
  Readable.fromWeb(response.body),
  sizeLimiter,
  fs.createWriteStream(IMAGE_SAVE_PATH)
);

```

Use this corrected section in place of the previous `sizeLimiter` and `pipeline` section. The `Transform` import should also be moved to the top of your file:

```
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");
```

## **2. Update your&#x20;**`downloadPostMedia()`**&#x20;method**

Currently, your method only handles videos. Replace it with:

```
downloadPostMedia = async (postMedia) => {
  const { postType, postLink } = postMedia;

  if (postType === "video") {
    return await this.downloadInstagramPostVideo();
  }

  if (postType === "image") {
    return await this.downloadInstagramPostImage(postLink);
  }

  if (postType === "carousel") {
    Logger.logMSG("Carousel downloading is not implemented yet.");
    return false;
  }

  return false;
};
```

## **3. A few important corrections**

The following is a complete, corrected version of the image downloader. I recommend using this version instead of the earlier draft. It keeps the timeout active throughout the download and cleans up incomplete files if something fails.

```

downloadInstagramPostImage = async (postLink) => {
  let savePath;

  try {
    if (!postLink) throw new Error("Image URL is missing.");

    const url = new URL(postLink);

    const allowedHost =
      url.hostname.endsWith("cdninstagram.com") ||
      url.hostname.endsWith("fbcdn.net");

    if (url.protocol !== "https:" || !allowedHost) {
      throw new Error("Untrusted Instagram image URL.");
    }

    const { profilePath, username } = ConfigManager.currentProfile;

    const saveDir = path.resolve(profilePath, "images");
    await fs.ensureDir(saveDir);

    const cookies = await Browser.page.browserContext().cookies(postLink);
    const userAgent = await Browser.page.evaluate(() => navigator.userAgent);

    const cookieHeader = cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(postLink, {
        headers: {
          "User-Agent": userAgent,
          "Referer": "https://www.instagram.com/",
          "Cookie": cookieHeader,
        },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = (response.headers.get("content-type") || "")
        .split(";")[0].toLowerCase();

      const extensions = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/avif": ".avif",
      };

      const extension = extensions[contentType];

      if (!extension) {
        throw new Error(`Unsupported image format: ${contentType}`);
      }

      const contentLength = Number(
        response.headers.get("content-length")
      );

      if (
        Number.isFinite(contentLength) &&
        contentLength > this.maxFileSize
      ) {
        throw new Error("Image exceeds maximum file size.");
      }

      if (!response.body) {
        throw new Error("Empty response body.");
      }

      savePath = path.join(
        saveDir,
        `${username}-${Date.now()}${extension}`
      );

      let downloadedBytes = 0;
      const maxSize = this.maxFileSize;

      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          downloadedBytes += chunk.length;

          if (downloadedBytes > maxSize) {
            callback(new Error("Image exceeds maximum file size."));
            return;
          }

          callback(null, chunk);
        },
      });

      await pipeline(
        Readable.fromWeb(response.body),
        limiter,
        fs.createWriteStream(savePath)
      );

      await Logger.logMSG(
        `Image downloaded: ${savePath} (${(downloadedBytes / 1024).toFixed(2)} KB)`
      );

      return savePath;

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    if (savePath) {
      await fs.remove(savePath).catch(() => {});
    }

    await Logger.logMSG(`Image download failed: ${error.message}`);

    return false;
  }
};

```

## **4. Improve your image extraction selector**

Your current extraction:

```
document.querySelector("article ._aagv img").src
```

I would avoid depending on `._aagv` because Instagram frequently changes its CSS classes.

A better starting point:

```
const image = [...document.querySelectorAll("article img")]
  .filter(img => img.naturalWidth > 150 && img.naturalHeight > 150)
  .sort((a, b) =>
    (b.naturalWidth * b.naturalHeight) -
    (a.naturalWidth * a.naturalHeight)
  )[0];

return image
  ? {
      postType: "image",
      postLink: image.currentSrc || image.src,
    }
  : { postType: false };
```

This selects the largest visible candidate image rather than relying on a generated CSS class. You should still test it against Instagram's different post layouts.

## **5. My recommendations for your scraper architecture**

There are three things worth considering as your project develops:

| Feature              | Recommendation                                         |
| -------------------- | ------------------------------------------------------ |
| Image downloading    | Direct HTTP streaming                                  |
| Video downloading    | Your existing video implementation can remain separate |
| Carousel downloading | Extract every slide individually                       |
| File naming          | Use post shortcode + media index                       |
| Duplicate prevention | Maintain a downloaded-media manifest                   |
| Image quality        | Prefer the highest-resolution available image URL      |

**One important distinction:** Your current `postMediaDetailsExtraction()` returns only one image. Instagram carousel posts can contain multiple images and videos. Eventually, you should return an array of media items rather than a single `postLink`.

Also, direct Node.js requests may occasionally fail even with browser cookies because Instagram's CDN URLs can expire or require additional request context. If that happens, we can implement a browser-context download fallback.

**My suggested next improvement:** Before implementing carousel downloading, I would improve `postMediaDetailsExtraction()` so it reliably identifies single images, videos, and all carousel slides without relying on Instagram's randomly generated CSS classes. This will give your archiver a much more maintainable foundation.
Yes. Your existing EnhancedPage.addResponseListener() is exactly the right foundation for this approach. In fact, for your Instagram archiver, I would prefer response interception over making a second HTTP request using fetch().

Your proposed workflow is sound:

1. Extract the image element's src from the open Instagram post.
2. Register a temporary response listener.
3. Compare each response's URL with the extracted image URL.
4. When the matching response completes, obtain its binary data.
5. Save the binary data directly to your specified path.
6. Remove the response listener.
7. Return the saved file path.
   There is one important detail: a response listener cannot recover a response that completed before the listener was registered. Therefore, we should register the listener before triggering the image request, or check whether the image is already available in the browser's cache.

For your current workflow, where you open a post and then extract its image, the image may already have loaded. I'll account for that below.

1. What I found in your EnhancedPage.js
   You already have two useful methods:
   Method Purpose Suitability
   addResponseListener() Listen to completed HTTP responses Use this
   addRequestListener() Intercept requests before they are sent Not needed

Your addResponseListener() is particularly useful because it already:

- Accepts a response filter.
- Gives you access to both request and response.
- Supports asynchronous processing.
- Returns a function to remove the listener.
  This is sufficient for implementing an image downloader without changing the overall architecture. See your implementation around lines 594–636.
  EnhancedPage.js

Why response interception is better than request interception here
There is a fundamental difference:

- request event: the browser is about to request an image.
- response event: the browser has received the server's response.
  For downloading an image, we need the completed response body. Puppeteer's response.buffer() gives us the binary image data.

We don't need to enable request interception, which is an additional complication. 2. Add a temporary image-response capture method
I suggest adding one small method to InstaScraper. It uses your existing EnhancedPage.addResponseListener() and captures image responses only while you're opening a post.

This is important because the image URL is not necessarily known before the browser requests it.

startImageResponseCapture = async () => {
const responses = new Map();

const removeListener =
await Browser.EnhancedPage.addResponseListener(
(request, response) => {
if (request.resourceType() !== "image") return false;

        const hostname = new URL(request.url()).hostname;

        return (
          hostname.endsWith("cdninstagram.com") ||
          hostname.endsWith("fbcdn.net")
        );
      },

      async (request, response) => {
        // Keep the response object for later extraction.
        responses.set(response.url(), response);
      }
    );

return {
responses,

    stop: () => {
      removeListener();
    },

};
};

This method does not download every image. It temporarily records references to completed Instagram CDN responses.

Once you've extracted the actual img.currentSrc, you can find the corresponding response. 3. Download the captured response
Add this method to InstaScraper:

downloadCapturedImage = async (postLink, response) => {
let tempPath;

try {
if (!response) {
throw new Error("Matching image response not captured.");
}

    // Verify that this is the response belonging to our image.
    if (response.url() !== postLink) {
      throw new Error("Image response URL does not match.");
    }

    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}`);
    }

    const headers = response.headers();
    const contentType = (headers["content-type"] || "")
      .split(";")[0]
      .toLowerCase();

    const extensions = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/avif": ".avif",
    };

    const extension = extensions[contentType];

    if (!extension) {
      throw new Error(`Unsupported format: ${contentType}`);
    }

    const { profilePath, username } = ConfigManager.currentProfile;

    const saveDir = path.resolve(profilePath, "images");
    await fs.ensureDir(saveDir);

    const buffer = await response.buffer();

    if (!buffer.length) {
      throw new Error("Empty image response.");
    }

    if (buffer.length > this.maxFileSize) {
      throw new Error("Image exceeds maximum file size.");
    }

    const fileName = `${username}-${Date.now()}${extension}`;
    const savePath = path.join(saveDir, fileName);

    // Write to temporary file first.
    tempPath = `${savePath}.part`;

    await fs.writeFile(tempPath, buffer);
    await fs.move(tempPath, savePath, { overwrite: false });

    console.log(`Image saved: ${savePath}`);
    console.log(`Size: ${(buffer.length / 1024).toFixed(2)} KB`);

    return savePath;

} catch (error) {
if (tempPath) await fs.remove(tempPath).catch(() => {});

    await Logger.logMSG(
      `Captured image download failed: ${error.message}`
    );

    return false;

}
};

This uses response.buffer() rather than Base64. It does hold the complete image in Node.js memory, but for ordinary Instagram photos this is generally a reasonable trade-off. 4. How to integrate it into your existing workflow
Here is the important part: start capturing before clicking the post.

Your current sequence is:
await Browser.EnhancedPage.clickNotClickable(
'a[href*="/p/"], a[href*="/reel/"]'
);

await Browser.EnhancedPage.waitForElementRobust(
'div[role="dialog"] article'
);

postMedia = await this.postMediaDetailsExtraction();
await this.downloadPostMedia(postMedia);

Change the sequence to:
const capture = await this.startImageResponseCapture();

try {
await Browser.EnhancedPage.clickNotClickable(
'a[href*="/p/"], a[href*="/reel/"]'
);

await Browser.EnhancedPage.waitForElementRobust(
'div[role="dialog"] article'
);

postMedia = await this.postMediaDetailsExtraction();

if (postMedia.postType === "image") {
const response = capture.responses.get(postMedia.postLink);

    await this.downloadCapturedImage(
      postMedia.postLink,
      response
    );

}

} finally {
capture.stop();
}

This is the basic integration for the first post. Apply the same capture-before-navigation pattern when moving to subsequent posts.

Important: Your postMediaDetailsExtraction() must use currentSrc || src, and you should wait until the new post's image has loaded. Otherwise, you might capture an old image or fail to find the matching response. 5. One improvement: keep the listener alive across post navigation
There is a limitation in the previous integration: Instagram sometimes preloads the next post's image before you click the Next button.

For your scraper, I would actually use this arrangement:
Start image response capture
|
v
Open first post
|
v
Extract image currentSrc
|
v
Find matching response
|
v
Save image
|
v
Click Next
|
v
Extract next image currentSrc
|
v
Find matching response
|
v
Save image
|
v
Repeat
|
v
Remove response listener

In other words, register one listener for the entire scraping session rather than repeatedly attaching and removing it for every post.

This also catches image responses generated by preloading.

Your existing addResponseListener() supports this without modification.

One caution: don't retain every image response indefinitely. Keep a bounded response cache, or discard entries after downloading them. Otherwise, long profile scraping sessions can consume unnecessary memory.

6. Other bugs and improvements I found in EnhancedPage
   I reviewed the active methods as well as the commented debugging methods.

These are the issues I would prioritize.
A. navigateTo()
Fix

Lines 65–85.

- domContentLoaded: true is not a valid page.goto() option.
- You use networkidle0, which can be unreliable on Instagram.
- You catch errors but don't rethrow them, so the calling method may believe navigation succeeded.
- Your completion log prints currentURL instead of the destination URL.
  Recommended: use explicit navigation conditions and propagate errors.

Source:
EnhancedPage.js

B. waitForAnySelector()
Debug/fix

Lines 88–245 (commented).

This is a useful concept, but there are some problems:

- The overall timeout timer isn't cleared during cleanup.
- maxSettleTime can return null even though the overall timeout hasn't expired.
- Invalid selectors can throw inside the MutationObserver callback.
- Waiting for document.readyState === "complete" is unnecessarily restrictive for SPA navigation.
  I would retain this method's concept, but revise its timeout and observer lifecycle before enabling it.

Source:
EnhancedPage.js

C. checkVisibilityBeforeClick()
Fix

Lines 394–401.

You return a DOM element from page.evaluate().
return subBTN;

This does not return a Puppeteer ElementHandle. It returns a serialized representation.

If you need an element handle, use page.$() or page.waitForSelector() instead.

Source:
EnhancedPage.js

D. addRequestListener()
Improve

Lines 644–687.

This method has a potential architectural problem:
this.page.setRequestInterception(false);

Removing one listener disables request interception globally. If another part of your application depends on request interception, it can break that functionality.

Also, enabling request interception requires every intercepted request to be continued, responded to, or aborted. Your current error handling attempts to continue requests, which is good, but the global lifecycle needs better management.

Source:
EnhancedPage.js

E. waitForURLChange()
Improve

Lines 416–444.

This method uses:
finally {
return flag;
}

Returning from finally suppresses any pending exception.

Since you intentionally want false on failure, you can implement that in catch and remove the finally return.

Source:
EnhancedPage.js

Other smaller observations
Method Observation
clickNotClickable() Calling waitForPageLoad() before and after every click can slow down SPA automation.
typeHuman() Setting input.value = "" directly may not update React's internal state.
pageHasText() Validate selectorsArray before passing it to querySelectorAll().
listAllElementsTextAndSelector() Traversing the entire DOM and generating selectors can be expensive on large pages.
waitForElementRobust() Explicit timeout and error handling would make its behavior more predictable.

7. My recommended final implementation for your project
   I would make one architectural change: keep the capture listener active throughout scrapePosts() and use the response map to locate each image.

Your scrapePosts() loop would look approximately like this:

const capture = await this.startImageResponseCapture();

try {
await Browser.EnhancedPage.clickNotClickable(
'a[href*="/p/"], a[href*="/reel/"]'
);

await Browser.EnhancedPage.waitForElementRobust(
'div[role="dialog"] article'
);

for (let i = 0; i < maxPosts; i++) {

    const postMedia = await this.postMediaDetailsExtraction();

    if (postMedia.postType === "image") {
      const response = capture.responses.get(postMedia.postLink);

      if (response) {
        await this.downloadCapturedImage(
          postMedia.postLink,
          response
        );

        capture.responses.delete(postMedia.postLink);
      } else {
        await Logger.logMSG(
          `Image response not captured: ${postMedia.postLink}`
        );
      }
    }

    // Handle videos separately.

    if (i < maxPosts - 1) {
      await Browser.EnhancedPage.clickNotClickable(
        '[aria-label="Next"]'
      );
    }

}

} finally {
capture.stop();
capture.responses.clear();
}

This is an architectural illustration; add your existing video and carousel handling to the loop.

One limitation remains: if the image was loaded before the listener was installed and no new request occurs, the response won't be in the map. In that situation, retain a direct HTTP download fallback.

8. Final verdict
   Recommended architecture
   For your Instagram archiver, I would use:

| Requirement                    | Implementation                     |
| ------------------------------ | ---------------------------------- | --- | ------- |
| Identify image                 | img.currentSrc                     |     | img.src |
| Identify corresponding request | addResponseListener()              |
| Retrieve binary data           | response.buffer()                  |
| Save image                     | fs.writeFile()                     |
| Remove listener                | Returned removeListener() function |
| Handle missed responses        | Direct HTTP fallback               |
| Handle multiple images         | Response map keyed by URL          |

My strongest recommendation: Don't introduce another image-download dependency yet. You already have most of the infrastructure in EnhancedPage.js.

One final distinction: response.buffer() is not a streaming download API. It retrieves the complete response body into memory. For typical Instagram images, that is a sensible implementation; if you later handle very large media or thousands of files, we can optimize memory management separately.

I would fix navigateTo(), waitForAnySelector(), and the request-listener lifecycle before expanding the scraper further. Those improvements will benefit your entire Puppeteer project, not just Instagram image downloading.

<!-- ============================== -->

i edited the script as you said but still no images get downloaded, the script after editing is as->

```javascript
const fs = require("fs-extra");
const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const EnhancedPage = require("../CoreModules/EnhancedPage.js");
const Instagram = require("./Instagram.js");
const utils = require("../../utils/utils.js");
const path = require("path");

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
  scrapeProfileMetadata = async (username) => {
    try {
      if (username) await Instagram.navigateToProfile(username);

      const profileMetaData = await Browser.page.evaluate(() => {
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

      ConfigManager.currentProfile = profileMetaData;

      // Create Profile directory structure
      ConfigManager.currentProfile.profilePath = await ConfigManager.createProfileStructure(username);

      await fs.writeJson(`${ConfigManager.currentProfile.profilePath}/${username}.json`, ConfigManager.currentProfile, { spaces: 2 });

      return ConfigManager.currentProfile;
    } catch (error) {
      await Logger.logError("Failed to extract profile info:", error);
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
      let { maxPosts = 50, skipExisting = true } = options;

      await Logger.logMSG(`Scraping posts from: ${username}`);

      await Instagram.navigateToProfile(username);

      const currentProfile = await this.scrapeProfileMetadata(username);

      // Check if profile is private
      if (currentProfile?.isPrivate) {
        await Logger.logMSG(`Profile ${username} is private`);
        return false;
      }

      if (currentProfile.postsCount == 0) {
        await Logger.logMSG(`Profile does have any posts to download.`);
        return false;
      }

      if (currentProfile.postsCount < maxPosts && currentProfile.postsCount > 0) maxPosts = currentProfile.postsCount;

      const links = [];

      const capture = await this.startImageResponseCapture();
      try {
        // Click on any post to open the modal
        await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"], a[href*="/reel/"]');
        await Browser.EnhancedPage.waitForElementRobust('div[role="dialog"] article');

        let postMedia;
        let postDownloaded = 0;
        while (postDownloaded++ < maxPosts) {
          const media = await this.postMediaDetailsExtraction();

          if (media.postType === "image") {
            const buf = capture.responses.get(media.postLink);
            if (buf) {
              await this.saveCapturedImage(media.postLink, buf);
              capture.responses.delete(media.postLink); // free memory
            } else {
              await Logger.logMSG(`Missed response (cache hit?): ${media.postLink}`);
              // ← only here consider the direct-fetch fallback
            }
          } else if (media.postType === "video") {
            await this.downloadInstagramPostVideo();
          }

          await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          await utils.randomDelay(1, 2);
        }
      } finally {
        capture.stop();
      }
      // -=-=- Testing and Development -=-=-=-
      console.log(links);

    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  };

  postMediaDetailsExtraction = async () => {
    const postMedia = await Browser.page.evaluate(() => {
      if (document.querySelector("article video"))
        return {
          postType: "video",
          postLink: document.querySelector("article video").src,
        };
      else if (document.querySelector('article [aria-label="Next"]')) return { postType: "carousel", postLink: "yet not" };
      else if (document.querySelector("article ._aagv img"))
        return {
          postType: "image",
          postLink: document.querySelector("article ._aagv img").src,
        };
      else return { type: false };
    });
    return postMedia;
  };

  downloadPostMedia = async (postMedia) => {
    // Post must be open on page in selector "article"
    const { postType, postLink } = postMedia;

    if (postType === "video") await this.downloadInstagramPostVideo();
    console.log(`Post Downloaded`);
  };

  downloadInstagramPostVideo = async () => {
    const page = Browser.page;
    const isVideoPresent = await page.evaluate(() => !!document.querySelector("article video"));

    if (!isVideoPresent) {
      Logger.logMSG("can't Download — no video found on page.");
      return false;
    }

    const { profilePath, username } = ConfigManager.currentProfile;
    const videoSavePath = path.resolve(profilePath, "videos", `${username}-${Date.now()}.webm`);

    // 👇 page.evaluate now resolves only when the page's promise resolves,
    // i.e. after the recording finished and the data URL is available.
    const dataUrl = await page.evaluate(async (fnSource) => {
      const recordVideo = new Function(`return (${fnSource})`)();
      return await recordVideo();
    }, this.recordVideo.toString());

    if (!dataUrl) {
      Logger.logMSG("Video can't Downloaded by current. Code Check n modify code.");
      return false;
    }

    // Strip the "data:video/webm;base64," prefix and write to disk.
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    await fs.mkdir(path.dirname(videoSavePath), { recursive: true });
    await fs.writeFile(videoSavePath, buffer);

    console.log(`Video recording is Done. Saved to: ${videoSavePath}`);
    console.log(`File size: ${buffer.length / 1024 / 1024} MB`);

    console.log("Ended........");
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

    // Resolve only AFTER the blob is built and converted to a base64 data URL
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

          console.log("Recording finished in page.");
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
    });

    // Safety net in case "ended" never fires (live stream, paused, etc.)
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

    return await finished; // <-- returns the data URL string
  };

  startImageResponseCapture = async () => {
    const responses = new Map();

    const remove = await Browser.EnhancedPage.addResponseListener(
      (_req, res) => {
        if (res.request().resourceType() !== "image") return false;
        const host = new URL(res.url()).hostname;
        return host.endsWith("cdninstagram.com") || host.endsWith("fbcdn.net");
      },
      async (_req, res) => {
        // Copy buffer NOW — response bodies are not retained by Puppeteer
        try {
          responses.set(res.url(), await res.buffer());
        } catch {}
      },
    );

    return {
      responses,
      stop: () => {
        remove();
        responses.clear();
      },
    };
  };
  saveCapturedImage = async (src, buf) => {
    if (!buf?.length) return false;
    if (buf.length > this.maxFileSize) {
      await Logger.logMSG(`Image too large: ${buf.length}`);
      return false;
    }

    const ext = (new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i) || [, "jpg"])[1].toLowerCase();
    const { profilePath, username } = ConfigManager.currentProfile;
    const imageSavePath = path.resolve(profilePath, "images", `${username}-${Date.now()}.${ext}`);

    await fs.mkdir(path.dirname(imageSavePath), { recursive: true });
    await fs.writeFile(imageSavePath, buf);
    await Logger.logMSG(`Image saved: ${imageSavePath} (${(buf.length / 1024).toFixed(1)} KB)`);
    return imageSavePath;
  };
```

and the console output is as ->
PS E:\Projects\instaAuto-v2> npm run start
Debugger attached.

> web-automation@1.0.0 start
> node ./index.js

Debugger attached.
Starting.....
Log File already exists.
Scraping posts from: Jitendra_goswami132
Initializing browser for profile target: 2
No blank page or Chat Page found, Opening a new Page.
Puppeteer Connected.
Browser initialized successfully for profile: undefined
Already on profile: https://www.instagram.com/Jitendra_goswami132/, But waiting for page load.
Already on profile: https://www.instagram.com/Jitendra_goswami132/, But waiting for page load.
Random Delay for 450ms.
selectorString: a[href*="/p/"], a[href*="/reel/"]
selectorString: div[role="dialog"] article
Missed response (cache hit?): https://instagram.fjai2-4.fna.fbcdn.net/v/t51.82787-15/632576270_18378893548086352_2538838670900224906_n.webp?_nc_cat=104&_nc_map=urlgen_bucketless&ig_cache_key=MzE3MTA5MTQwNzI2NDAzOTU2MQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkZFRUQueHBpZHMuNjQwLnNkci5yZWd1bGFyX3Bob3RvLkMzIn0%3D&_nc_ohc=r-nvPb7vL88Q7kNvwHg9tuS&_nc_oc=AdqpJtvATKEiMLxzTzKMWmTCCl0GYEKR2_OSHUx_BeT8uVi0QXrFzVciDc8jcBrpJ9U&_nc_zt=23&_nc_ht=instagram.fjai2-4.fna&_nc_gid=72aB8D3hoTXUrpw6JKKMSQ&_nc_ss=7b6a8&_nc_ct=RQosPBUIFQIlBAAAAA&oh=00_AQSVqiB74KZLeJCKmzkkCsVEIofBBz_bOGR1X1obW0ux2g&oe=6B010E64
Random Delay for 350ms.
selectorString: [aria-label="Next"]
Random Delay for 1800ms.
Random Delay for 550ms.
selectorString: [aria-label="Next"]
Random Delay for 1100ms.
Video recording is Done. Saved to: E:\Projects\instaAuto-v2\data\Jitendra_goswami132\videos\jitendra_goswami132-1794851170685.webm
File size: 3.4285402297973633 MB
Ended........
Random Delay for 450ms.
selectorString: [aria-label="Next"]
Random Delay for 1000ms.
Video recording is Done. Saved to: E:\Projects\instaAuto-v2\data\Jitendra_goswami132\videos\jitendra_goswami132-1794851192910.webm
File size: 9.889318466186523 MB
Ended........
Random Delay for 250ms.
selectorString: [aria-label="Next"]
Random Delay for 1300ms.
Missed response (cache hit?): https://instagram.fjai2-6.fna.fbcdn.net/v/t51.82787-15/622737623_18076186820065459_4101765346558433203_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&_nc_map=urlgen_bucketless&ig_cache_key=MjgwMzU5Nzg2NDMzNDEwMDY1Mw%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkZFRUQueHBpZHMuNzIwLnNkci5yZWd1bGFyX3Bob3RvLkMzIn0%3D&_nc_ohc=Z8oFnd-3fNoQ7kNvwEM1gFh&_nc_oc=AdrQkxZI1WFNTptvQ5lFAPNTFKAbEFWOXW-9I3cnZP7lE1krHOxvUQSdzmKJOcOtW-g&_nc_zt=23&_nc_ht=instagram.fjai2-6.fna&_nc_gid=72aB8D3hoTXUrpw6JKKMSQ&_nc_ss=7b6a8&_nc_ct=RQosPBUIFQIlBAAAAA&oh=00_AQRjgvikqWaHnB8_BPz3wdIe1N-Ln6D8YpCrrrUlgXu9jg&oe=6B00FFF8

<!-- =================================== -->

you just confused me a lot now let me give you my current state of script i have already done some changes as you said and some are remaining let me give you complete script and you give me complete updated modified most optimized, refactored script with less short and that must working ok . Be careful while coding and in the end before giving script back to me please check once than give me. My current state of script is as ->

```javascript
const fs = require("fs-extra");
const Browser = require("../CoreModules/Browser.js");
const ConfigManager = require("../CoreModules/ConfigManager.js");
const Logger = require("../CoreModules/Logger.js");
const EnhancedPage = require("../CoreModules/EnhancedPage.js");
const Instagram = require("./Instagram.js");
const utils = require("../../utils/utils.js");
const path = require("path");

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
  scrapeProfileMetadata = async (username) => {
    try {
      if (username) await Instagram.navigateToProfile(username);

      const profileMetaData = await Browser.page.evaluate(() => {
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

      ConfigManager.currentProfile = profileMetaData;

      // Create Profile directory structure
      ConfigManager.currentProfile.profilePath = await ConfigManager.createProfileStructure(username);

      await fs.writeJson(`${ConfigManager.currentProfile.profilePath}/${username}.json`, ConfigManager.currentProfile, { spaces: 2 });

      return ConfigManager.currentProfile;
    } catch (error) {
      await Logger.logError("Failed to extract profile info:", error);
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
      let { maxPosts = 50, skipExisting = true } = options;

      await Logger.logMSG(`Scraping posts from: ${username}`);

      await Instagram.navigateToProfile(username);

      const currentProfile = await this.scrapeProfileMetadata(username);

      // Check if profile is private
      if (currentProfile?.isPrivate) {
        await Logger.logMSG(`Profile ${username} is private`);
        return false;
      }

      if (currentProfile.postsCount == 0) {
        await Logger.logMSG(`Profile does have any posts to download.`);
        return false;
      }

      if (currentProfile.postsCount < maxPosts && currentProfile.postsCount > 0) maxPosts = currentProfile.postsCount;

      const links = [];

      const capture = await this.startImageResponseCapture();
      try {
        await Browser.EnhancedPage.clickNotClickable('a[href*="/p/"], a[href*="/reel/"]');
        await Browser.EnhancedPage.waitForElementRobust('div[role="dialog"] article');

        let i = 0;
        while (i++ < maxPosts) {
          const items = await this.postMediaDetailsExtraction();

          if (items.length === 0) {
            await Logger.logMSG(`No media detected on post ${i}`);
          } else if (items.length === 1 && items[0].postType === "image") {
            // Single image
            const ok = await this.forceFreshImageLoad(items[0].postLink, capture);
            if (ok) {
              const hit = capture.responses.get(capture.keyOf(items[0].postLink));
              await this.saveCapturedImage(hit.url, hit.buf);
              capture.responses.delete(capture.keyOf(items[0].postLink));
            }
          } else if (items.length === 1 && items[0].postType === "video") {
            await this.downloadInstagramPostVideo();
          } else {
            // Carousel (2+ items, may include mixed image/video)
            await this.downloadCarousel(items, capture);
          }

          // Click the OUTER Next (next post), not the carousel arrow.
          // After the carousel finishes, the carousel arrow is hidden (last slide),
          // so a plain [aria-label="Next"] click hits the outer nav.
          await Browser.EnhancedPage.clickNotClickable('[aria-label="Next"]');
          await utils.randomDelay(1, 2);
        }
      } finally {
        capture.stop();
      }
      // -=-=- Testing and Development -=-=-=-
      console.log(links);
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

      // await Logger.logMSG(`Scraped ${posts.length} posts from ${username}`);
      // return posts;
    } catch (error) {
      await Logger.logMSG(`Failed to scrape posts from ${username}:`, error);
      throw error;
    }
  };

  // postMediaDetailsExtraction = async () => {
  //   const postMedia = await Browser.page.evaluate(() => {
  //     if (document.querySelector("article video"))
  //       return {
  //         postType: "video",
  //         postLink: document.querySelector("article video").src,
  //       };
  //     else if (document.querySelector('article [aria-label="Next"]')) return { postType: "carousel", postLink: "yet not" };
  //     else if (document.querySelector("article ._aagv img"))
  //       return {
  //         postType: "image",
  //         postLink: document.querySelector("article ._aagv img").src,
  //       };
  //     else return { type: false };
  //   });
  //   return postMedia;
  // };
  postMediaDetailsExtraction = async () => {
    return await Browser.page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const article = dialog?.querySelector("article");
      if (!article) return { shortcode: null, items: [] };

      // Shortcode from any permalink inside the dialog.
      const permalink = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      const shortcode = permalink?.getAttribute("href")?.match(/\/(?:p|reel)\/([^/?#]+)/)?.[1] || null;

      const items = [];

      // Carousel: <ul> with one <li> per slide.
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

      // Single video.
      const video = article.querySelector("video");
      if (video) return { shortcode, items: [{ postType: "video", postLink: video.currentSrc || video.src }] };

      // Single image — biggest real image, skip the 41×41 profile pic.
      const img = [...article.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]')]
        .filter((i) => i.naturalWidth > 150 && i.naturalHeight > 150)
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];

      if (img) items.push({ postType: "image", postLink: img.currentSrc || img.src });

      return { shortcode, items };
    });
  };

  downloadPostMedia = async (postMedia) => {
    // Post must be open on page in selector "article"
    const { postType, postLink } = postMedia;

    if (postType === "video") await this.downloadInstagramPostVideo();
    console.log(`Post Downloaded`);
  };

  downloadInstagramPostVideo = async () => {
    const page = Browser.page;
    const isVideoPresent = await page.evaluate(() => !!document.querySelector("article video"));

    if (!isVideoPresent) {
      Logger.logMSG("can't Download — no video found on page.");
      return false;
    }

    const { profilePath, username } = ConfigManager.currentProfile;
    const videoSavePath = path.resolve(profilePath, "videos", `${username}-${Date.now()}.webm`);

    // 👇 page.evaluate now resolves only when the page's promise resolves,
    // i.e. after the recording finished and the data URL is available.
    const dataUrl = await page.evaluate(async (fnSource) => {
      const recordVideo = new Function(`return (${fnSource})`)();
      return await recordVideo();
    }, this.recordVideo.toString());

    if (!dataUrl) {
      Logger.logMSG("Video can't Downloaded by current. Code Check n modify code.");
      return false;
    }

    // Strip the "data:video/webm;base64," prefix and write to disk.
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    await fs.mkdir(path.dirname(videoSavePath), { recursive: true });
    await fs.writeFile(videoSavePath, buffer);

    console.log(`Video recording is Done. Saved to: ${videoSavePath}`);
    console.log(`File size: ${buffer.length / 1024 / 1024} MB`);

    console.log("Ended........");
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

    // Resolve only AFTER the blob is built and converted to a base64 data URL
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

          console.log("Recording finished in page.");
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
    });

    // Safety net in case "ended" never fires (live stream, paused, etc.)
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

    return await finished; // <-- returns the data URL string
  };

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

    // Idempotency: skip if already downloaded on a previous run.
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
  downloadCarousel = async (items, capture) => {
    const saved = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Make sure the current slide is visible + loaded.
      if (i > 0) {
        await Browser.EnhancedPage.clickNotClickable('article button[aria-label="Next"]');
        await utils.randomDelay(0.3, 0.6);
      }

      if (item.postType === "image") {
        const ok = await this.forceFreshImageLoad(item.postLink, capture);
        if (ok) {
          const hit = capture.responses.get(capture.keyOf(item.postLink));
          const path = await this.saveCapturedImage(hit.url, hit.buf);
          if (path) saved.push(path);
          capture.responses.delete(capture.keyOf(item.postLink));
        } else {
          await Logger.logMSG(`Slide ${i + 1} image not captured: ${item.postLink}`);
        }
      } else if (item.postType === "video") {
        // Re-use your existing recorder. The current slide's video is already playing.
        const path = await this.downloadInstagramPostVideo();
        if (path) saved.push(path);
      }
    }

    return saved;
  };
}

module.exports = new InstaScraper();
```
