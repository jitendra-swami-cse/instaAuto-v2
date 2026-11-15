const fs = require("fs/promises");
const path = require("path");

const Logger = require("./modules/CoreModules/Logger.js");
const Browser = require("./modules/CoreModules/Browser.js");

const DOWNLOAD_DIR = path.resolve(__dirname, "downloads");

async function ensureDownloadDir() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Records the currently visible Instagram <video> element.
 * Works for MediaSource/blob-backed videos where video.src cannot be fetched.
 */
async function recordVisibleVideo(page, { maxDurationMs = 5 * 60 * 1000, fileName = null } = {}) {
  await ensureDownloadDir();
}

async function main() {
  await Logger.init();

  console.log("Starting.....");

  await Browser.initialize(2);

  const page = Browser.page;
  const url = await page.url();

  console.log("Profile Info:", url);

  // -=-=-=-=-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  const isVideoPresent = await Browser.page.evaluate(() => !!document.querySelector("article video"));

  let res;
  if (isVideoPresent)
    res = await Browser.page.evaluate(async () => {
      async function recordVideo() {
        const video = document.querySelector("video");
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();

        const chunks = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm",
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");

          a.href = url;
          a.download = `instagram-recording-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          a.remove();

          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          console.log("Recording saved.");
        };

        video.currentTime = 0;
        await video.play();
        recorder.start();

        video.addEventListener("ended", () => recorder.stop(), { once: true });
        return true;
      }
      const result = await recordVideo();
      if (result) return "Video rec Done please check";
      else return "can't Download";
    });
  console.log(`res is ${res}`);

  console.log("Recording started. Let the video play to the end.");

  // -=-=-=-=-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  const outputFilePath = await recordVisibleVideo(page, {
    maxDurationMs: 5 * 60 * 1000,
  });

  console.log("Video saved to:", outputFilePath);
  console.log("Ended........");
}

main().catch(async (error) => {
  console.error("Script failed:", error);
  await Browser.close?.();
  process.exitCode = 1;
});

/* Given below code works when pasted in dev tools console
it Downloads video in ./download of pc */
// (async () => {
//   const video = document.querySelector("video");

//   if (!video) throw new Error("No <video> element found.");

//   const stream = video.captureStream
//     ? video.captureStream()
//     : video.mozCaptureStream();

//   const chunks = [];
//   const recorder = new MediaRecorder(stream, {
//     mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
//       ? "video/webm;codecs=vp9,opus"
//       : "video/webm"
//   });

//   recorder.ondataavailable = event => {
//     if (event.data.size) chunks.push(event.data);
//   };

//   recorder.onstop = () => {
//     const blob = new Blob(chunks, { type: "video/webm" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");

//     a.href = url;
//     a.download = `instagram-recording-${Date.now()}.webm`;
//     document.body.appendChild(a);
//     a.click();
//     a.remove();

//     setTimeout(() => URL.revokeObjectURL(url), 60_000);
//     console.log("Recording saved.");
//   };

//   video.currentTime = 0;
//   await video.play();
//   recorder.start();

//   video.addEventListener("ended", () => recorder.stop(), { once: true });

//   console.log("Recording started. Let the video play to the end.");
// })();
