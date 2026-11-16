const fs = require("fs/promises");
const path = require("path");

const Logger = require("./modules/CoreModules/Logger.js");
const Browser = require("./modules/CoreModules/Browser.js");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// 👇 SET THIS to wherever you want the .webm saved.
// You can give an absolute path or a path relative to this script.
const VIDEO_SAVE_PATH = path.resolve(__dirname, "recordings", "instagram-recording.webm");
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

async function recordVideo() {
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

  // This Promise resolves only AFTER the blob is built and converted to a
  // base64 data URL — which is what we hand back to Node for saving.
  const finished = new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: "video/webm" });

        // Convert blob -> data URL so it can cross the evaluate boundary.
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

  // Safety net in case "ended" never fires (e.g., live stream, paused).
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

  // If timeout won, make sure the recorder stops so onstop fires.
  if (recorder.state !== "inactive") recorder.stop();

  // Wait for the data URL to be ready and return it.
  return await finished;
}

async function main() {
  await Logger.init();

  console.log("Starting.....");

  await Browser.initialize(2);

  const page = Browser.page;
  const url = await page.url();

  console.log("Profile Info:", url);
  console.log("Type of recordVideo: ", typeof recordVideo);

  // -=-=-=-=-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  const isVideoPresent = await page.evaluate(() => !!document.querySelector("article video"));

  if (!isVideoPresent) {
    console.log("can't Download — no video found on page.");
    console.log("Ended........");
    return;
  }

  // 👇 page.evaluate now resolves only when the page's promise resolves,
  // i.e. after the recording finished and the data URL is available.
  const dataUrl = await page.evaluate(async (fnSource) => {
    const recordVideo = new Function(`return (${fnSource})`)();
    return await recordVideo();
  }, recordVideo.toString());

  if (!dataUrl) {
    console.log("Video can't Downloaded by current. Code Check n modify code.");
    return;
  }

  // Strip the "data:video/webm;base64," prefix and write to disk.
  const base64 = dataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");

  await fs.mkdir(path.dirname(VIDEO_SAVE_PATH), { recursive: true });
  await fs.writeFile(VIDEO_SAVE_PATH, buffer);

  console.log(`res is Video rec Done. Saved to: ${VIDEO_SAVE_PATH}`);
  console.log(`File size: ${buffer.length} bytes`);

  console.log("Ended........");
}

main();

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
