const ConfigManager = require("./modules/CoreModules/ConfigManager.js");
const Logger = require("./modules/CoreModules/Logger.js");
const Browser = require("./modules/CoreModules/Browser");
const EnhancedPage = require("./modules/CoreModules/EnhancedPage");
const InstagramScraper = require("./modules/InstagramModules/InstagramScraper.js");
const Instagram = require("./modules/InstagramModules/Instagram.js");

async function main() {
  console.log("Starting.....");

  // -=-=-=-=-=-=-= Init Configs and Logger -=-=-=-=-=-=-=

  await Logger.init();

  // =========== Code under testing and Development ==============
  const username = "Jitendra_goswami132";

  const profileInfo = await InstagramScraper.scrapePosts(username);
  console.log("Profile Info:", profileInfo);

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
// await InstagramScraper.init();
// 3.
// await Instagram.init();
// await Instagram.navigateToProfile("Jitendra_goswami132");
// const profileInfo = await InstagramScraper.scrapeProfileMetadata();
