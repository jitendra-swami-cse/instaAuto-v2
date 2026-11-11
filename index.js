const ConfigManager = require("./coreModules/ConfigManager");
const AppLogger = require("./coreModules/AppLogger");
const Browser = require("./coreModules/Browser");
const EnhancedPage = require("./coreModules/EnhancedPage");
const InstaScraper = require("./instaModules/InstaScraper");

async function main() {
  console.log("Starting.....");

  // -=-=-=-=-=-=-= Init Configs and Logger -=-=-=-=-=-=-=
  ConfigManager.loadAll();
  await AppLogger.init();

  // =========== Code under testing and Development ==============
  await InstaScraper.init();
  console.log("Browser Config: ", ConfigManager.browserConfig);
  console.log("let's Check All Elements");

  // =========================
  console.log("Ended........");
}

main();

// -=-=-=-=-=-=-=- functions tested and working -=-=-=-=-=-=-=-
//1.
// await Browser.initialize(2);
// await EnhancedPage.navigateTo("https://www.youtube.com/");
// const els = await EnhancedPage.getAllElementIds();
// 2.
// await InstaScraper.init();
