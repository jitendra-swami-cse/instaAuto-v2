const ConfigManager = require("./coreModules/ConfigManager");
const AppLogger = require("./coreModules/AppLogger");
const Browser = require("./coreModules/Browser");
const EnhancedPage = require("./coreModules/EnhancedPage");
const InstagramScraper = require("./instaModules/InstagramScraper.js");
const Instagram = require("./instaModules/Instagram.js");

async function main() {
  console.log("Starting.....");

  // -=-=-=-=-=-=-= Init Configs and Logger -=-=-=-=-=-=-=
  ConfigManager.loadAll();
  await AppLogger.init();

  // =========== Code under testing and Development ==============
  const userName = "Jitendra_goswami132";
  // await Browser.initialize(2);
  // await Instagram.init();
  // await Instagram.navigateToProfile(userName);
  const profileInfo = await InstagramScraper.scrapePosts(userName);
  console.log("Profile Info:", profileInfo);

  // =========================
  console.log("Ended........");

  // If url contains "/p/" than post media is either img or carousal of imgs-
  //       - In case of img selector is -> 'article ._aagv img'
}

main();

// -=-=-=-=-=-=-=- functions tested and working -=-=-=-=-=-=-=-
//1.
// await Browser.initialize(2);
// await EnhancedPage.navigateTo("https://www.youtube.com/");
// const els = await EnhancedPage.getAllElementIds();
// 2.
// await InstagramScraper.init();
// 3.
// await Instagram.init();
// await Instagram.navigateToProfile("Jitendra_goswami132");
// const profileInfo = await InstagramScraper.scrapeProfileMetadata();
