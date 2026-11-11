const ConfigManager = require("./coreModules/ConfigManager");
const AppLogger = require("./coreModules/AppLogger");
const Browser = require("./coreModules/Browser");
const EnhancedPage = require("./coreModules/EnhancedPage");
const InstaScraper = require("./instaModules/InstaScraper");
const Instagram = require("./instaModules/Instagram.js");

async function main() {
  console.log("Starting.....");

  // -=-=-=-=-=-=-= Init Configs and Logger -=-=-=-=-=-=-=
  ConfigManager.loadAll();
  await AppLogger.init();

  // =========== Code under testing and Development ==============
  // await Browser.initialize(2);
  await Instagram.init();
  await Instagram.navigateToProfile("Jitendra_goswami132");

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
