require("dotenv").config();
const fs = require("fs-extra");
const os = require("os");
const readline = require("readline");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.delay = delay;

// exports.timeout30Sec = { timeout: 30000 };      // Should be in constants.js file

// NOTE:- You must pass options object as second argument it could be empty to take default values but it must be there.
// func passed to this shuold not call any other function, if it does then may or may not have some bugs.
// func passed to this must not have try-catch block.

/*old robustPolling function
const robustPolling = async (func, options = {}, ...args) => {
  const {
    maxAttempts = 30,
    delayMs = 1000,
    timeoutMs = 30000,
    retryCondition = () => true,
  } = options;
  return new Promise(async (resolve, reject) => {
    let errMSG,
      attempts = 0;
    const startTime = Date.now();
    while (attempts < maxAttempts && Date.now() - startTime < timeoutMs) {
      attempts++;
      try {
        const result = await func(...args);

        if (result && retryCondition(result)) {
          resolve(result);
          break;
        }
      } catch (err) {
        errMSG = err.message;
        console.log(`Attempt ${attempts} failed with error:`, errMSG);
      }

      await delay(delayMs);
    }
    reject(
      `Function failed after ${maxAttempts} attempts. with Error: ${errMSG}`
    );
  });
};*/
const robustPolling = async (func, options = {}, ...args) => {
  const {
    maxAttempts = 30,
    delayMs = 1000,
    timeoutMs = 30000,
    retryCondition = () => true,
    rejectOnEnd = true, // if true then reject (that stops execution) on end of polling.
    infintiePolling = false, // if true then no maxAttempts and no timeoutMs, just keep polling until func returns true or stopped manually.
  } = options;

  return new Promise(async (resolve, reject) => {
    let attempts = 0;
    const startTime = Date.now();

    while (infintiePolling || (attempts < maxAttempts && Date.now() - startTime < timeoutMs)) {
      attempts++;
      try {
        const result = await func(...args);

        if (result && retryCondition(result)) {
          resolve(result);
          //   break;
          return;
        }
      } catch (err) {
        errMSG = err.message || "Error msg not defined in Options Object passed to robustPolling func";
        console.log(`Attempt ${attempts} failed with error:`, errMSG);
      }

      await delay(delayMs);
    }

    // Handle end of polling based on rejectOnEnd flag
    if (rejectOnEnd) {
      reject(`Function failed after ${attempts} attempts. with Error: ${errMSG}`);
    } else {
      resolve(null);
    }
  });
};
exports.robustPolling = robustPolling;

// ---- new Utiles developed while developing YTAutomation. ----

/**
 * Generates a random delay between given min and max seconds
 * and pauses the execution of the program for that amount of time.
 * @param {number} maxSec The maximum delay in seconds.
 * @param {number} minSec The minimum delay in seconds. default is 0.25 seconds.
 */
const randomDelay = async (maxSec = 0.45, minSec = 0.25) => {
  const delayTime = (Math.floor(Math.random() * (maxSec - minSec) * 10) + minSec * 10) * 100;
  console.log(`Random Delay for ${delayTime}ms.`);
  await delay(delayTime);
};
exports.randomDelay = randomDelay;
// const randomDelay = async (maxSec = 0.45, minSec = 0.25) => {
//   await delay((Math.floor(Math.random() * (maxSec - minSec) * 10) + minSec * 10) * 100);
// };

const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
exports.getRandomNumber = getRandomNumber;

const getDateTime = () => {
  const date = new Date();
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  };
  const indianDateTime = date.toLocaleString("en-IN", options).replace(/\//g, "-");
  return indianDateTime;
};
exports.getDateTime = getDateTime;

async function askUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
exports.askUser = askUser;

async function devWaitCheckContinue() {
  await fs.writeFile("./data/thisAtThisPoint.json", JSON.stringify(this, null, 2));
  const answer = await askUser("Press Enter to continue or type 'e' to stop the script: ");
  if (answer.toLowerCase() === "exit") {
    console.log("Exiting the script as per user request.");
    process.exit(0);
  }
}
exports.devWaitCheckContinue = devWaitCheckContinue;

async function log(message) {
  const pathToLogFile = `./Data/Logs/${getDateTime().split(",")[0]}_log.txt`;
  fs.appendFileSync(pathToLogFile, message + "\n");
}
exports.log = log;

/**
 * Removes duplicates from an array of objects based on specified key fields.
 * If keyFields is not provided, all fields are used as the key.
 * Optionally, keeps the latest entry based on a date field.
 *
 * @param {Array} arr - The array to deduplicate.
 * @param {Array} [keyFields] - The fields to use as the unique key. If not provided, all fields are used.
 * @param {String} [latestField] - Optional. The field to use to keep the latest entry.
 * @returns {Array} - Deduplicated array.
 */
function removeDuplicates(arr, keyFields, latestField) {
  const map = new Map();
  for (const item of arr) {
    // If keyFields not provided, use all keys of the object
    const fields = keyFields && keyFields.length ? keyFields : Object.keys(item).sort(); // sort for consistent key order
    const key = fields.map((f) => String(item[f])).join("|");
    if (!map.has(key)) {
      map.set(key, item);
    } else if (latestField) {
      const existing = map.get(key);
      if (new Date(item[latestField]) > new Date(existing[latestField])) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}
exports.removeDuplicates = removeDuplicates;

// --------------------------------------------------------------
// async function nextAvailableChromeProfile() {
//   const profilesPath = `${os.homedir()}/AppData/Local/Google/Chrome/User Data`;
//   // 1. Check how many folders are there in profilesPath starting with 'Profile' and add their name to profiles array.
//   const profilesCreated = fs
//     .readdirSync(profilesPath)
//     .filter((foldersName) => foldersName.startsWith("Profile"));

//   // 2. Find first available profile number
//   const nextProfileNumber = profilesCreated.length + 1;
//   return nextProfileNumber;
// }
// exports.nextAvailableChromeProfile = nextAvailableChromeProfile;

// async function currentMachineName() {
//   return os.userInfo().username;
//   /* The given below code is actually API's resonsibility, not utils's.

//   // Get the current user's username
//   let currentMachine = os.userInfo().username;

//   const availableMachines = ["Office", "Er. Jitendra Nath", "SM-NETWORK"];

//   if (!availableMachines.includes(currentMachine))
//     console.log(
//       `Current Machine (i.e. "${currentMachine}") \n\t\tis not in "availableMachines" array in utils. Please add it to "availableMachines" Array.`
//     );
//   return false;
//   */
// }
// exports.currentMachineName = currentMachineName;
