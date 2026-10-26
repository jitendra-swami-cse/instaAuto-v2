const Browser = require("./modules/Browser");
const ConfigManager = require("./modules/ConfigManager");

async function main() {
  console.log("Starting.....");
  // =========================
  await Browser.initialize(2);

  // =========================
  console.log("Ended........");
}

main();
