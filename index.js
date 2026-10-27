const ConfigManager = require("./modules/ConfigManager");
const utils = require("./utils/utils");
const AppLogger = require("./modules/AppLogger");
const Browser = require("./modules/Browser");

async function main() {
  console.log("Starting.....");
  ConfigManager.loadAll();
  // =========================
  await Browser.initialize(2);
  await Browser.page.navigateTo("https://www.youtube.com/");
  console.log("let's Click");
  await Browser.page.clickNotClickable(`[name="search_query"]`);
  console.log("Click Done.");
  await Browser.page.typeHuman(`[name="search_query"]`, "David Guetta");

  // =========================
  console.log("Ended........");
}

main();
