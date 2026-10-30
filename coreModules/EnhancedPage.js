// List of methods available on EnhancedPage
// 👇 Tested Working 👇
// attachPage
// navigateTo
// clickNotClickable
// typeHuman
// getText
// waitForURLChange
// listAllElementsTag
// getAllElementIds
// listAllElementsText
// listAllElementsTextAndSelector

// listAllFrames
// waitForPageLoad
// goBackToPreviousPage
// waitForElementRobust
// checkVisibilityBeforeClick

// addResponseListener
// addRequestListener

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
// const catchAsync = require("../utils/catchAsync");
const AppLogger = require("../coreModules/AppLogger");
const utils = require("../utils/utils");

class EnhancedPage {
  constructor() {
    this.page = null;
  }

  attachPage = async (page) => {
    this.page = page;
  };

  waitForPageLoad = async (timeout = 120000) => {
    return await this.page.waitForFunction(
      () => document.readyState === "complete",
      { timeout }, // Set timeout to 10 minutes in rare coditions.
    );
  };

  navigateTo = async (url) => {
    try {
      AppLogger.logMSG(`Page.navigateTo(${url}) called.`);
      const currentURL = this.page.url();
      if (currentURL.includes(url)) {
        AppLogger.logMSG(`Already on ${url}.`);
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
      AppLogger.logMSG(`Completed Navigation to ${currentURL}`);
    } catch (error) {
      AppLogger.logMSG(
        `Error in Page.navigateTo(${url}) is as: ${error.message}`,
      );
    }
  };

  goBackToPreviousPage = async () => {
    try {
      AppLogger.logMSG(`Page.goBack() called...`);
      await this.page.goBack({
        waitUntil: "networkidle0", // Wait until network is idle
        timeout: 300000, // 5 minutes Timeout in milliseconds
        // referer: "https://www.google.com", // Custom referer header
        // userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", // Custom user agent
        // ignoreHTTPSErrors: true, // Ignore HTTPS errors
        domContentLoaded: true, // Wait for DOMContentLoaded event
        // defaultViewport: { width: 1920, height: 1080 }, // Custom viewport settings
      });
      AppLogger.logMSG(`Completed Back Navigation.`);
    } catch (error) {
      AppLogger.logMSG(`Error in Page.navigateTo() is as: ${error.message}`);
    }
  };

  // ==== 👇🏻 for Testing & Debugging 👇🏻 ====
  waitForElementRobust = async (textOrSelector, text = false) => {
    // text = false;
    let selectorString =
      text === true ? `::-p-text(${textOrSelector})` : textOrSelector;
    AppLogger.logMSG(`selectorString: ${selectorString}`);

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
  /**
   * Attempts to click on an element that is not immediately clickable on a page.
   */
  clickNotClickable = async (textOrSelectorOrElement, text) => {
    await this.waitForPageLoad();
    await utils.randomDelay(0.75);

    // Arrow function captures `this` and outer variables automatically
    const waitSearchnClick = async () => {
      const element =
        typeof textOrSelectorOrElement === "string"
          ? await this.waitForElementRobust(textOrSelectorOrElement, text)
          : textOrSelectorOrElement;

      if (!element) {
        throw new Error(`Element not found: ${textOrSelectorOrElement}`);
      }

      const boundingBox = await element.boundingBox();
      if (!boundingBox) {
        throw new Error(
          `Bounding Box not found for: ${textOrSelectorOrElement}`,
        );
      }

      const { x, y, width, height } = boundingBox;
      await this.page.mouse.click(x + width / 2, y + height / 2);
      return true;
    };

    await utils.robustPolling(waitSearchnClick, {
      maxAttempts: 9,
      delayMs: 3000,
      timeoutMs: 30000,
      retryCondition: (result) => result === true,
    });

    await this.waitForPageLoad();
  };

  getText = async (selectorStringOrElement) => {
    let el;
    if (typeof selectorStringOrElement === "string") {
      el = await this.page.locator(selectorStringOrElement).waitHandle();
    } else {
      el = selectorStringOrElement;
    }
    const text = await this.page.evaluate((element) => element.textContent, el);
    return text;
  };

  typeHuman = async (selector, stringToType) => {
    const options = {
      backspaceMaximumDelayInMs: 750 * 2,
      backspaceMinimumDelayInMs: 750,
      chanceToKeepATypoInPercent: 0, // This controls whether to keep a typo
      maximumDelayInMs: 650,
      minimumDelayInMs: 150,
      typoChanceInPercent: 0.5,
    };

    await this.waitForPageLoad();

    const inputField = await this.page.locator(selector).waitHandle();
    // await inputField.focus();

    // Clear the input field
    await inputField.evaluate((el) => (el.value = ""));
    AppLogger.logMSG(
      `----- stringToType: ${stringToType} ---causing the error --`,
    );

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
          await utils.delay(backspaceDelay);

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

  // ========== 👆 Above Code is Checked not tested 👆 ==========
  checkVisibilityBeforeClick = async (selector) => {
    return await this.page.evaluate((selector) => {
      const subBTN = Array.from(document.querySelectorAll(selector)).find(
        (el) => el.checkVisibility(),
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
  waitForURLChange = async (
    beforePageURL,
    maxAttempts = 5,
    delayMs = 3000,
    timeoutMs = 30000,
  ) => {
    let flag;
    try {
      flag = await utils.robustPolling(
        async () => {
          if (this.page.url() !== beforePageURL) {
            await this.waitForPageLoad();
            return this.page.url();
          }
          throw new Error(
            `URL has not changed yet. Still on: ${beforePageURL}`,
          );
        },
        {
          maxAttempts,
          delayMs,
          timeoutMs,
          // retryCondition: (result) => result === true,   //uncommenting this creates an undetectable bug
        },
      );
    } catch (error) {
      AppLogger.logMSG(`--------- Error in waitForURLChange ---------`);
      AppLogger.logMSG(`beforePageURL: ${beforePageURL}`);
      AppLogger.logMSG(`this.page.url(): ${this.page.url()}`);
      AppLogger.logMSG(`error: ${error}`);
      AppLogger.logMSG(`--------- Error in waitForURLChange ---------`);
      flag = false;
    } finally {
      return flag;
    }
  };

  // ==== 👇🏻 for Testing & Debugging 👇🏻 ====

  listAllFrames = async () => {
    const frames = this.page.frames();
    for (const frame of frames) {
      AppLogger.logMSG(`Frame URL: ${frame.url()}`);
    }
  };

  listAllElementsTag = async () => {
    const elements = await this.page.$$("*");
    for (const element of elements) {
      const tagName = await element.evaluate((el) => el.tagName);
      AppLogger.logMSG(`Element: ${tagName}`);
    }
  };

  getAllElementIds = async (unique = false) => {
    const isUnique =
      typeof unique === "object" && unique !== null
        ? Boolean(unique.unique)
        : Boolean(unique);

    return await this.page.evaluate((isUnique) => {
      const ids = Array.from(
        document.querySelectorAll("[id]"),
        (el) => el.id,
      ).filter(Boolean);
      if (!isUnique) return ids;

      const counts = ids.reduce(
        (acc, id) => ((acc[id] = (acc[id] || 0) + 1), acc),
        {},
      );
      return ids.filter((id) => counts[id] === 1);
    }, isUnique);
  };

  listAllElementsText = async () => {
    return await this.page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll("*"));
      const elementsWithDirectText = [];

      for (const el of allElements) {
        // Skip non-visible / script / style tags
        if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) {
          continue;
        }

        // Filter direct text child nodes with non-empty content
        const directText = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .filter(Boolean)
          .join(" ");

        if (directText.length > 0) {
          elementsWithDirectText.push({
            tagName: el.tagName.toLowerCase(),
            text: directText,
          });
        }
      }

      return elementsWithDirectText;
    });
  };

  listAllElementsTextAndSelector = async () => {
    return await this.page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll("*"));
      const result = [];

      // Helper to generate a useful, actionable CSS selector
      const getBestSelector = (el) => {
        if (el.id) {
          return `#${CSS.escape(el.id)}`;
        }
        if (el.getAttribute("name")) {
          return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute("name"))}"]`;
        }
        if (el.getAttribute("aria-label")) {
          return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(el.getAttribute("aria-label"))}"]`;
        }
        if (el.getAttribute("role")) {
          return `${el.tagName.toLowerCase()}[role="${CSS.escape(el.getAttribute("role"))}"]`;
        }
        if (el.className && typeof el.className === "string") {
          const classes = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !c.includes(":") && !c.includes("/"));
          if (classes.length > 0) {
            const classSel = `${el.tagName.toLowerCase()}.${classes
              .slice(0, 2)
              .map((c) => CSS.escape(c))
              .join(".")}`;
            if (document.querySelectorAll(classSel).length === 1) {
              return classSel;
            }
          }
        }
        const parent = el.parentElement;
        if (!parent || parent === document.body) {
          return el.tagName.toLowerCase();
        }
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName,
        );
        const index = siblings.indexOf(el) + 1;
        const parentPrefix = parent.id ? `#${CSS.escape(parent.id)} > ` : "";
        return `${parentPrefix}${el.tagName.toLowerCase()}:nth-of-type(${index})`;
      };

      for (const el of allElements) {
        // Skip script / style / invisible tags
        if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) {
          continue;
        }

        // Direct text child nodes only
        const directText = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .filter(Boolean)
          .join(" ");

        if (directText.length > 0) {
          const openingTag = el.outerHTML.slice(
            0,
            el.outerHTML.indexOf(">") + 1,
          );

          result.push({
            tagName: el.tagName.toLowerCase(),
            text: directText,
            selector: getBestSelector(el),
            openingTag,
          });
        }
      }

      return result;
    });
  };
  // ==== 👇🏻 Event Handler 👇🏻 ====

  /**
   * Adds a temporary 'response' listener to the page.
   * Returns a function that removes the listener when called.
   *
   * @param {Function} filterFn - Function to filter responses.
   * @param {Function} handlerFn - Function to handle filtered responses.
   * @returns {Function} removeListener - Call this to remove the listener.
   */
  addResponseListener = async (filterFn, handlerFn) => {
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
  addRequestListener = async (filterFn, handlerFn) => {
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
}

module.exports = new EnhancedPage();

// ==========================================================================

/*
// ==== 👇🏻 Event Handler 👇🏻 ====
async function addEventHandlerOnPage() {
  // Listen for the 'load' event
  this.on("load", async () => {
    console.log("Page loaded, taking screenshot...");
    try {
      this.log("nav", `Page loaded, Page URL: ${this.page.url()}`);

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
    this.pageNavigationList.push(this.page.url());
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

// === Implementation ===
// const hookMethodsOnPage = async function (page) {
//   page.waitForPageLoad = catchAsync(waitForPageLoad.bind(this));
//   page.navigateTo = catchAsync(navigateTo.bind(this));
//   page.goBackToPreviousPage = catchAsync(goBackToPreviousPage.bind(this));
//   page.waitForElementRobust = catchAsync(waitForElementRobust.bind(this));
//   page.clickNotClickable = catchAsync(clickNotClickable.bind(this));
//   page.getText = catchAsync(getText.bind(this));
//   page.typeHuman = catchAsync(typeHuman.bind(this));
//   page.checkVisibilityBeforeClick = catchAsync(
//     checkVisibilityBeforeClick.bind(this),
//   );
//   page.waitForURLChange = catchAsync(waitForURLChange.bind(this));

//   // ==== 👇🏻 for Testing & Debugging 👇🏻 ====
//   page.listAllPages = catchAsync(listAllPages.bind(this));
//   page.listAllFrames = catchAsync(listAllFrames.bind(this));
//   page.listAllElements = catchAsync(listAllElements.bind(this));
//   page.listAllElementsText = catchAsync(listAllElementsText.bind(this));
//   page.listAllElementsTextAndSelector = catchAsync(
//     listAllElementsTextAndSelector.bind(this),
//   );
//   // page.interceptRequests = catchAsync(interceptRequests.bind(this));
//   page.addResponseListener = catchAsync(addResponseListener.bind(this));
//   page.addRequestListener = catchAsync(addRequestListener.bind(this));
//   // ==== 👇🏻 Event Handler 👇🏻 ====
//   page.on("framenavigated", async (frame) => {
//     if (frame === this.page.mainFrame()) {
//       this.appLogger?.logMSG(`Navigated to: ${frame.url()}`);

//       const randomPageHandlers = {
//         // url:"selectorStringToClick"
//         "/recaptcha?": '[role="presentation"]',
//       };
//       for (const url of Object.keys(randomPageHandlers)) {
//         try {
//           const randomPage = (await this.browser.pages()).find(
//             (p) => p.url() === url || p.url().includes(url),
//           );

//           if (randomPage) {
//             await this.appLogger?.logMSG(
//               `== Random Page : ${randomPage.url()}`,
//             );
//             await utils.randomDelay(1.5, 2); // Add a small delay for stability
//             console.log(`Random Page found: ${randomPage.url()}`);
//             const selector = randomPageHandlers[url];
//             console.log(`Selector: ${selector}`);

//             await randomPage.bringToFront();
//             await randomPage.locator(selector).click();
//             console.log(`Ramdom page handled by listener: ${url}`);
//             return randomPage;
//           }
//         } catch (error) {
//           console.error(`Error handling popup for  ${url}:`, error);
//         }
//       }
//     }
//   });
// };
// === Interface ===
// module.exports = catchAsync(hookMethodsOnPage);
