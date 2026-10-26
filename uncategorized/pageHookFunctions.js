// Requiremented methods on page objects:
/* 
  

  2. getElementByText(text, options) 
              - waitForPageLoad()
              - waits for element to be visible on the page "options.timeOut"
              - returns element if element is found,
              - returns false if element is not found within "options.timeOut"
              - throws an error if "options.continueOnError" is set to "true"
              Note - this method waits and returns the first element that has the text exactly or partially matches the argument text.
              - if parent element of text is known then pass that as options.parentElement. (for specificity.)
*/
// If Proxy create random errors, then use different approach.

/*  1. waitForPageLoad(options)
              - if already loaded, returns true immediately
              - waits for page to be loaded "options.timeOut"
              - returns true if page is loaded,
              - returns false if page is not loaded in "options.timeOut" 
              - throws an error if "options.continueOnError" is set to "true" */
const catchAsync = require("../uncategorized/catchAsync");

const waitForPageLoad = async function (timeout = 120000) {
  return await this.page.waitForFunction(
    () => document.readyState === "complete",
    { timeout }, // Set timeout to 10 minutes in rare coditions.
  );
};

const navigateTo = async function (url) {
  try {
    console.log(`app.page.navigateTo(${url}) called.`);
    if (this.page.url().includes(url)) {
      console.log(`Already on ${url}.`);
      return;
    }
    await this.page.goto(url, {
      waitUntil: "networkidle0", // Wait until network is idle
      timeout: 300000, // 5 minutes Timeout in milliseconds
      // referer: "https://www.google.com", // Custom referer header
      // userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", // Custom user agent
      // ignoreHTTPSErrors: true, // Ignore HTTPS errors
      domContentLoaded: true, // Wait for DOMContentLoaded event
      // defaultViewport: { width: 1920, height: 1080 }, // Custom viewport settings
    });
    console.log(`Completed Navigation to ${this.page.url()}`);
  } catch (error) {
    console.log(`Error in app.page.navigateTo(${url}) is as: ${error.message}`);
  }
};
const goBackToPreviousPage = async function () {
  try {
    console.log(`app.page.goBack() called...`);
    await this.page.goBack({
      waitUntil: "networkidle0", // Wait until network is idle
      timeout: 300000, // 5 minutes Timeout in milliseconds
      // referer: "https://www.google.com", // Custom referer header
      // userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", // Custom user agent
      // ignoreHTTPSErrors: true, // Ignore HTTPS errors
      domContentLoaded: true, // Wait for DOMContentLoaded event
      // defaultViewport: { width: 1920, height: 1080 }, // Custom viewport settings
    });
    console.log(`Completed Back Navigation.`);
  } catch (error) {
    console.log(`Error in app.page.navigateTo() is as: ${error.message}`);
  }
};
// ==== 👇🏻 for Testing & Debugging 👇🏻 ====
const waitForElementRobust = async function (textOrSelector, text = false) {
  // text = false;
  let selectorString =
    text === true ? `::-p-text(${textOrSelector})` : textOrSelector;
  console.log(`selectorString: ${selectorString}`);

  const element = await this.page.locator(selectorString).waitHandle();
  if (!element) {
    return false;
  } else return element;
};

/**
 * Attempts to click on an element that is not immediately clickable on a page.
 *
 * This method waits for the page to fully load + randomDelay(0.75), and then
 * utilizes robust polling to repeatedly try clicking on the specified element until successful.
 *
 * The element can be specified either by a selector string or directly as an element handle.
 * The method logs the action upon a successful click.
 *
 * @param {string|object} textOrSelectorOrElement - The selector string or element handle to click.
 * @throws Will throw an error if the element cannot be found or its bounding box is not available.
 */
const clickNotClickable = async function (textOrSelectorOrElement, text) {
  await this.page.waitForPageLoad();
  await this.utils.randomDelay(0.75);

  const waitSearchnClick = async (page, textOrSelectorOrElement, text) => {
    let element =
      typeof textOrSelectorOrElement === "string"
        ? await page.waitForElementRobust(textOrSelectorOrElement, text)
        : textOrSelectorOrElement;
    const boundingBox = await element.boundingBox();
    if (boundingBox) {
      const { x, y, width, height } = boundingBox;
      await page.mouse.click(x + width / 2, y + height / 2);
      // await page.log("act", `Clicked on ${textOrSelectorOrElement} done.`);
      return true; // Exit on success
    } else
      throw Error(`Bounding Box not found for: ${textOrSelectorOrElement}.`);
  };

  await this.utils.robustPolling(
    waitSearchnClick,
    {
      maxAttempts: 9,
      delayMs: 3000,
      timeoutMs: 30000,
      retryCondition: (result) => result === true,
    },
    this.page,
    textOrSelectorOrElement,
    text,
  );
  await this.page.waitForPageLoad();
};
// ==========================================================================
const getText = async function (selectorStringOrElement) {
  let el;
  if (typeof selectorStringOrElement === "string")
    el = await this.page.locator(selector).waitHandle();
  else el = selectorStringOrElement;
  const text = await this.page.evaluate((element) => element.textContent, el);
  return text;
};

const typeHuman = async function (selector, stringToType) {
  const options = {
    backspaceMaximumDelayInMs: 750 * 2,
    backspaceMinimumDelayInMs: 750,
    chanceToKeepATypoInPercent: 0, // This controls whether to keep a typo
    maximumDelayInMs: 650,
    minimumDelayInMs: 150,
    typoChanceInPercent: 0.5,
  };

  await this.page.waitForPageLoad();

  const inputField = await this.page.locator(selector).waitHandle();
  // await inputField.focus();

  // Clear the input field
  await inputField.evaluate((el) => (el.value = ""));
  console.log(`----- stringToType: ${stringToType} ---causing the error --`);

  for (let char of stringToType) {
    // Simulate typing delay
    const delay =
      Math.floor(
        Math.random() *
          (options.maximumDelayInMs - options.minimumDelayInMs + 1),
      ) + options.minimumDelayInMs;

    // Introduce a typo based on the typo chance
    let typedChar = char;
    if (Math.random() * 100 < options.typoChanceInPercent) {
      // Generate a random character to simulate a typo
      typedChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97); // Random lowercase letter

      // Decide whether to keep the typo based on chanceToKeepATypoInPercent
      if (Math.random() * 100 < options.chanceToKeepATypoInPercent) {
        // Keep the typo as is
        await inputField.type(typedChar, { delay });
        continue; // Skip correcting this character
      } else {
        // If not keeping the typo, type the incorrect character
        await inputField.type(typedChar, { delay });

        // Simulate backspacing to remove the typo
        const backspaceDelay =
          Math.floor(
            Math.random() *
              (options.backspaceMaximumDelayInMs -
                options.backspaceMinimumDelayInMs +
                1),
          ) + options.backspaceMinimumDelayInMs;
        await this.utils.delay(backspaceDelay);

        // Type backspace to remove the last character (the typo)
        await inputField.press("Backspace", { delay: backspaceDelay });

        // Type the correct character
        await inputField.type(char, { delay });
        continue;
      }
    }

    // Type the character normally
    await inputField.type(typedChar, { delay });
  }
};

const checkVisibilityBeforeClick = async function (selector) {
  return await this.page.evaluate((selector) => {
    const subBTN = Array.from(document.querySelectorAll(selector)).find((el) =>
      el.checkVisibility(),
    );
    // subBTN.click();
    // return subBTN.textContent;
    return subBTN;
  }, selector);
};

/**
 * Waits for the page URL to change from the given beforePageURL.
 *
 * The method will continuously poll the page URL until it changes or the specified timeout is reached.
 * If the timeout is reached, it will log an error and return false.
 * If the URL changes, it will wait for page load and returns the new URL.
 *
 * @param {string} beforePageURL - The URL of the page that it should wait for a change from.
 * @param {number} maxAttempts - The maximum number of attempts to check the page URL. Default is 5.
 * @param {number} delayMs - The delay in milliseconds between each attempt. Default is 3000.
 * @param {number} timeoutMs - The timeout in milliseconds after which the method will return false. Default is 30000.
 * @returns {(string | false)} The new URL if the URL changed, false otherwise.
 */
const waitForURLChange = async function (
  beforePageURL,
  maxAttempts = 5,
  delayMs = 3000,
  timeoutMs = 30000,
) {
  let flag;
  try {
    flag = await utils.robustPolling(
      async () => {
        if (this.url() !== beforePageURL) {
          await this.waitForPageLoad();
          return this.url();
        } else return false;
      },
      {
        maxAttempts: 5,
        delayMs: 3000,
        timeoutMs: 30000,
        // retryCondition: (result) => result === true,   //uncommenting this creates an undetectable bug
      },
    );
  } catch (error) {
    console.log(`--------- Error in waitForURLChange ---------`);
    console.log(`beforePageURL: ${beforePageURL}`);
    console.log(`this.url(): ${this.url()}`);
    console.log(`error: ${error}`);
    console.log(`--------- Error in waitForURLChange ---------`);
    flag = false;
  } finally {
    return flag;
  }
};

/*
// ==== 👇🏻 Event Handler 👇🏻 ====
async function addEventHandlerOnPage() {
  // Listen for the 'load' event
  this.on("load", async () => {
    console.log("Page loaded, taking screenshot...");
    try {
      this.log("nav", `Page loaded, Page URL: ${this.url()}`);

      await this.screenshot({
        path: `./Data/Screenshots/${utils.getDateTime().split(",")[0]}__${
          this.pageNavigationList.length
        }.png`,
        fullPage: true,
      });
    } catch (error) {
      console.log(`Error taking screenshot: ${error.message}`);
      this.log("err", error.message);
    }
  });
}

// ------- Logging ------
async function log(type = "act", message) {
  // "act" = Action, "nav" = Navigation, "err" = Error
  let prefix = "";
  if (type === "act") {
    prefix = `Action ${this.actionList.length}`;
    this.actionList.push(message);
  } else if (type === "nav") {
    prefix = `Navigation ${this.pageNavigationList.length}`;
    this.pageNavigationList.push(this.url());
  } else if (type === "err") {
    prefix = `⚠️ Error ${this.errorList.length}`;
    this.errorList.push(message);
  }
  // const pathToLogFile = `./Data/Logs/${
  //   utils.getDateTime().split(",")[0]
  // }_log.txt`;
  // fs.appendFileSync(pathToLogFile, `${prefix}: ${message}\n`);
  await utils.log(`${prefix}: ${message}`);
}
*/

// ==== 👇🏻 for Testing & Debugging 👇🏻 ====
const listAllPages = async function () {
  const pages = await this.browser.pages();
  for (const page of pages) {
    console.log(`Page URL: ${page.url()}`);
  }
};

const listAllFrames = async function () {
  const frames = this.page.frames();
  for (const frame of frames) {
    console.log(`Frame URL: ${frame.url()}`);
  }
};
const listAllElements = async function () {
  const elements = await this.page.$$("*");
  for (const element of elements) {
    const tagName = await element.evaluate((el) => el.tagName);
    console.log(`Element: ${tagName}`);
  }
};

const listAllElementsText = async function () {
  const elements = await this.page.$$("*");
  for (const element of elements) {
    const tagName = await element.evaluate((el) => el.tagName);
    const textContent = await element.evaluate((el) => el.textContent);
    console.log(`Element: ${tagName}, Text: ${textContent}`);
  }
};
const listAllElementsTextAndSelector = async function () {
  const elements = await this.page.$$("*");
  for (const element of elements) {
    const tagName = await element.evaluate((el) => el.tagName);
    const textContent = await element.evaluate((el) => el.textContent);
    const selector = await element.evaluate((el) => el.outerHTML);
    console.log(
      `Element: ${tagName}, Text: ${textContent}, Selector: ${selector}`,
    );
  }
};

// ==== Request Intercepter ====
/**
 * Intercepts network requests in a Puppeteer page
 *
 * @param {Object} page - Puppeteer page instance
 * @param {Object} options - Configuration options
 * @param {boolean} options.interceptCompletedOnly - If true, intercepts only completed requests. If false, intercepts requests before they are sent.
 * @param {Function} filterFn - Function that determines if a request should be processed.
 *                             Receives request and response (if completed) as arguments.
 *                             Should return true if the request should be processed.
 * @param {Function} handlerFn - Function that processes the request if filterFn returns true.
 *                              Receives request and response (if completed) as arguments.
 * @returns {Promise<void>}
 */
/*
const interceptRequests = async function (options, filterFn, handlerFn) {
  if (!this.page) {
    throw new Error("Page instance is required");
  }

  if (typeof filterFn !== "function") {
    throw new Error("Filter function is required");
  }

  if (typeof handlerFn !== "function") {
    throw new Error("Handler function is required");
  }

  const interceptCompletedOnly = options?.interceptCompletedOnly ?? false;

  if (interceptCompletedOnly) {
    // Intercept completed requests
    this.page.on("response", async (response) => {
      try {
        const request = response.request();

        // Check if this request should be processed
        if (await filterFn(request, response)) {
          await handlerFn(request, response);
        }
      } catch (error) {
        console.error("Error in response interceptor:", error);
      }
    });
  } else {
    // Intercept requests before they are sent
    await this.page.setRequestInterception(true);

    this.page.on("request", async (request) => {
      try {
        // Check if this request should be processed
        if (await filterFn(request, null)) {
          await handlerFn(request, null);
        }

        // Continue the request (important!)
        if (!request.isInterceptionHandled()) {
          await request.continue();
        }
      } catch (error) {
        console.error("Error in request interceptor:", error);
        // Make sure the request continues even if there's an error
        if (!request.isInterceptionHandled()) {
          await request.continue();
        }
      }
    });
  }
};
*/
// Above function is upgraded and divided into two functions: `addRequestListener` and `addResponseListener`.

/**
 * Adds a temporary 'response' listener to the page.
 * Returns a function that removes the listener when called.
 *
 * @param {Function} filterFn - Function to filter responses.
 * @param {Function} handlerFn - Function to handle filtered responses.
 * @returns {Function} removeListener - Call this to remove the listener.
 */
const addResponseListener = async function (filterFn, handlerFn) {
  if (!this.page) {
    throw new Error("Page instance is required");
  }

  if (typeof filterFn !== "function") {
    throw new Error("Filter function is required");
  }

  if (typeof handlerFn !== "function") {
    throw new Error("Handler function is required");
  }
  // Define the listener function
  const listener = async (response) => {
    try {
      const request = response.request();
      if (await filterFn(request, response)) {
        await handlerFn(request, response);
        return;
      }
    } catch (error) {
      console.error("Error in response interceptor:", error);
    }
  };

  // Attach the listener
  this.page.on("response", listener);

  // Return a function to remove the listener
  return () => {
    this.page.off("response", listener);
  };
};

/** * Adds a temporary 'request' listener to the page.
 * Returns a function that removes the listener when called.
 * @param {Function} filterFn - Function to filter requests.
 * @param {Function} handlerFn - Function to handle filtered requests.
 * @return {Function} removeListener - Call this to remove the listener.
 * */
const addRequestListener = async function (filterFn, handlerFn) {
  if (!this.page) {
    throw new Error("Page instance is required");
  }

  if (typeof filterFn !== "function") {
    throw new Error("Filter function is required");
  }

  if (typeof handlerFn !== "function") {
    throw new Error("Handler function is required");
  }

  // Enable request interception
  await this.page.setRequestInterception(true);

  // Define the listener function
  const listener = async (request) => {
    try {
      if (await filterFn(request, null)) {
        await handlerFn(request, null);
      }
      // Continue the request
      if (!request.isInterceptionHandled()) {
        await request.continue();
      }
    } catch (error) {
      console.error("Error in request interceptor:", error);
      // Ensure the request continues even if there's an error
      if (!request.isInterceptionHandled()) {
        await request.continue();
      }
    }
  };

  // Attach the listener
  this.page.on("request", listener);

  // Return a function to remove the listener
  return () => {
    this.page.off("request", listener);
    this.page.setRequestInterception(false); // Disable request interception
  };
};

// === Implementation ===
const hookMethodsOnPage = async function (page) {
  page.waitForPageLoad = catchAsync(waitForPageLoad.bind(this));
  page.navigateTo = catchAsync(navigateTo.bind(this));
  page.goBackToPreviousPage = catchAsync(goBackToPreviousPage.bind(this));
  page.waitForElementRobust = catchAsync(waitForElementRobust.bind(this));
  page.clickNotClickable = catchAsync(clickNotClickable.bind(this));
  page.getText = catchAsync(getText.bind(this));
  page.typeHuman = catchAsync(typeHuman.bind(this));
  page.checkVisibilityBeforeClick = catchAsync(
    checkVisibilityBeforeClick.bind(this),
  );
  page.waitForURLChange = catchAsync(waitForURLChange.bind(this));

  // ==== 👇🏻 for Testing & Debugging 👇🏻 ====
  page.listAllPages = catchAsync(listAllPages.bind(this));
  page.listAllFrames = catchAsync(listAllFrames.bind(this));
  page.listAllElements = catchAsync(listAllElements.bind(this));
  page.listAllElementsText = catchAsync(listAllElementsText.bind(this));
  page.listAllElementsTextAndSelector = catchAsync(
    listAllElementsTextAndSelector.bind(this),
  );
  // page.interceptRequests = catchAsync(interceptRequests.bind(this));
  page.addResponseListener = catchAsync(addResponseListener.bind(this));
  page.addRequestListener = catchAsync(addRequestListener.bind(this));
  // ==== 👇🏻 Event Handler 👇🏻 ====
  page.on("framenavigated", async (frame) => {
    if (frame === this.page.mainFrame()) {
      this.appLogger?.logMSG(`Navigated to: ${frame.url()}`);

      const randomPageHandlers = {
        // url:"selectorStringToClick"
        "/recaptcha?": '[role="presentation"]',
      };
      for (const url of Object.keys(randomPageHandlers)) {
        try {
          const randomPage = (await this.browser.pages()).find(
            (p) => p.url() === url || p.url().includes(url),
          );

          if (randomPage) {
            await this.appLogger?.logMSG(
              `== Random Page : ${randomPage.url()}`,
            );
            await this.utils.randomDelay(1.5, 2); // Add a small delay for stability
            console.log(`Random Page found: ${randomPage.url()}`);
            const selector = randomPageHandlers[url];
            console.log(`Selector: ${selector}`);

            await randomPage.bringToFront();
            await randomPage.locator(selector).click();
            console.log(`Ramdom page handled by listener: ${url}`);
            return randomPage;
          }
        } catch (error) {
          console.error(`Error handling popup for  ${url}:`, error);
        }
      }
    }
  });
};
// === Interface ===
module.exports = catchAsync(hookMethodsOnPage);
