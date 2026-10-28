const ConfigManager = require("./coreModules/ConfigManager");
const utils = require("./utils/utils");
const AppLogger = require("./coreModules/AppLogger");
const Browser = require("./coreModules/Browser");
const EnhancedPage = require("./coreModules/EnhancedPage");

async function main() {
  console.log("Starting.....");
  ConfigManager.loadAll();
  // =========================
  await Browser.initialize(2);
  await EnhancedPage.navigateTo("https://www.youtube.com/");
  console.log("let's Check All Elements");

  console.log(`returnedURL is = ${allElements.length}`);

  // =========================
  console.log("Ended........");
}

main();
