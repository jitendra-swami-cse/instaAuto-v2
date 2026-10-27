const ConfigManager = require("./modules/ConfigManager");
const utils = require("./utils/utils");
const AppLogger = require("./modules/AppLogger");
const Browser = require("./modules/Browser");
const EnhancedPage = require("./modules/EnhancedPage");

async function main() {
  console.log("Starting.....");
  ConfigManager.loadAll();
  // =========================
  await Browser.initialize(2);
  await EnhancedPage.navigateTo("https://www.youtube.com/");
  console.log("let's Click");
  await EnhancedPage.clickNotClickable(`[name="search_query"]`);
  console.log("Click Done.");
  await EnhancedPage.typeHuman(`[name="search_query"]`, "David Guetta");

  // =========================
  console.log("Ended........");
}

main();
