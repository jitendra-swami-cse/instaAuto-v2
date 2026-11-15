(async () => {
  const video = document.querySelector("video");

  if (!video) throw new Error("No <video> element found.");

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

  console.log("Recording started. Let the video play to the end.");
})();
