const fs = require("fs-extra");
const utils = require("./utils.js");

// ---- Part-1 Imports ----
const { promisify } = require("util");
const { exec, spawn } = require("child_process");
const promisifiedExec = promisify(exec);

// ---- Part-2 Imports ----
const puppeteer = require("puppeteer-extra");
const stealth = require("puppeteer-extra-plugin-stealth");

// Use the plugin
puppeteer.use(stealth());

// ---- Variables ----
// const port = process.env.CHROME_DEBUG_PORT;
const port = 9222;

// ============ Main GetBrowser Function ============
exports.getBrowser = async (options) => {
  options.profileTarget ||= process.env.CHORME_TARGET_PROFILE;
  options.initialURL ||= process.env.INITIAL_URL;
  // Create some logic in future as the size & position depends on the current Machine.
  options.windowSize ||= [816, 831]; // for JN's Laptop
  // options.windowSize ||= [815, 789]; // for KL Sir's PC
  options.windowPosition ||= [728, 0]; // for JN's Laptop
  // options.windowPosition ||= [660, 0]; // for KL Sir's PC
  options.environment ||= process.env.ENVIRONMENT;

  const wsUrl = await getDebuggerUrl(
    options.profileTarget,
    options.windowSize,
    options.windowPosition,
  );

  await writeWSinFile(wsUrl); // Only for testing purpose

  const { browser, page } = await utils.robustPolling(
    pptrConnect,
    // { timeoutMs: 120000 },
    {},
    wsUrl,
    options.initialURL,
  );
  return { browser, page };
};

// ---- Part 1 Open & Get Debugger Url ----
// 1.1 Get webSocketDebuggerUrl
async function getDebuggerUrl(profileTarget, windowSize, windowPosition) {
  try {
    let data;
    try {
      data = await getUrl();
    } catch (err) {
      null;
    }
    if (data) return JSON.parse(data).webSocketDebuggerUrl;

    await openChromeInstance(profileTarget, windowSize, windowPosition);

    // Polling the function: Get webSocketDebuggerUrl
    data = JSON.parse(
      await utils.robustPolling(getUrl, {}, port),
    ).webSocketDebuggerUrl;
    return data;
  } catch (error) {
    console.log(`Error in getDebuggerUrl function : `, error.message);
    console.log(error);
  }
}

// 1.2 Get webSocketDebuggerUrl
async function getUrl() {
  const urlCommand = `curl http://127.0.0.1:${port}/json/version`;
  const { stdout } = await promisifiedExec(urlCommand);
  return stdout;
}

// 1.3 Open Chrome Instance
async function openChromeInstance(profileTarget, windowSize, windowPosition) {
  let [w, h] = windowSize;
  let [x, y] = windowPosition;
  console.log(
    `In openChromeInstance function, Profile to be opened has target: ${profileTarget}`,
  );

  const chromePath = `C:/Program Files/Google/Chrome/Application/chrome.exe`;

  // On Store Keeper's PC
  // const chromePath = `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe`;

  // for older chrome v135 and below
  // Example openCommand = `"C:\Program Files\Google\Chrome\Application\chrome.exe"  --user-data-dir="C:\Automation-App-by-JN-Data" --profile-directory="Profile 10" --remote-debugging-port=9222 --window-size=814,859 --window-position=793,0`;
  // const openCommand = `"${chromePath}"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;
  // for newer chrome v136 and above
  // const openCommand = `"${chromePath}" --user-data-dir="C:/Automation-App-by-JN-Data"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;
  // const openCommand = `"${chromePath}" --user-data-dir="C:/Automation-App-by-JN-Data"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;

  const userDataDir = require("path").resolve(__dirname, "../profiles");
  console.log(userDataDir);

  // On JN's Laptop
  const openCommand = `"${chromePath}" --user-data-dir="${userDataDir}"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;
  // On KL Sir PC
  // const openCommand = `"${chromePath}" --user-data-dir="C:/Users/acer/Downloads/Jitu/InstaAutomation/Automation-App-by-JN-Data"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;
  // On Store Keeper PC
  // const openCommand = `"${chromePath}" --user-data-dir="C:/Users/acer/Downloads/Er. Jitendra/Automated-Chrome-Data"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y}`;

  const chromeProcess = spawn(openCommand, [], {
    shell: true,
    detached: true,
    stdio: "ignore",
  });

  await utils.delay(3000);

  // Close the child process if it still running
  if (chromeProcess && !chromeProcess.killed) {
    chromeProcess.kill("SIGKILL"); // Terminate the Chrome process
  }
}

// ---- Part 2 Connect Chorme instance to  PPTR ----
async function pptrConnect(wsUrl, initialURL) {
  if (!wsUrl) {
    wsUrl = await readWSfromFile();
  }
  if (!initialURL) {
    initialURL = process.env.INITIAL_URL;
  }
  // try {
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: false,
  });

  const pages = await browser.pages();

  let page;

  page =
    pages.find((p) => p.url().includes(initialURL)) ||
    pages.find(
      (p) => p.url() === "about:blank" || p.url() === "chrome://new-tab-page/",
    );

  if (!page) {
    console.log("No blank page or Chat Page found, Opening a new Page.");

    if (process.env.ALWAYS_OPEN_WITH_INITIAL_URL === "true") {
      page = await browser.newPage();
      await page.goto(initialURL, {
        waitUntil: ["load", "domcontentloaded", "networkidle0"],
        timeout: 60000,
      });
    } else page = pages[0];
  }

  // pages.forEach(async (p) => p.url().includes(page.url()) || (await p.close())); // Close all other pages

  await page.bringToFront();
  //   require("../utils/pageUtils.js")(page); //hookMethodsOnPage(page);

  console.log("Puppeteer Connected.");
  return { browser, page };
  // } catch (error) {
  //   console.log(`Error in pptrConnect function : `, error.message);
  //   console.log(error);
  // }
}

// only for testing purppose
exports.pptrConnect = pptrConnect;

const writeWSinFile = async (ws) => {
  fs.writeFileSync("currentWS.txt", ws);
};
async function readWSfromFile() {
  return fs.readFileSync("currentWS.txt", "utf8");
}
