const fs = require("fs-extra");
const path = require("path");

// require("dotenv").config({
//   path: require("path").join(__dirname, "../../.env"),
// });

class ConfigManager {
  constructor() {
    // Paths
    // const userDataDir = require("path").resolve(__dirname, "../profiles");

    this.configPath = path.join(__dirname, "..", "..", "config");
    this.instaConfigPath = path.join(this.configPath, "instaConfig.json");
    this.browserConfigPath = path.join(this.configPath, "borwserConfig.json");

    this.dataDirPath = path.join(__dirname, "..", "data");
    this.profilesDataDirPath = path.join(this.dataDirPath, "allProfilesData.json");

    this.logsDirPath = path.join(this.dataDirPath, "logs");

    // Variables/Properties
    this.environment = process.env.ENVIRONMENT || "development";
    this.instaConfig = {};
    this.browserConfig = {};

    this.instaConfig = this.loadJson(this.instaConfigPath, {});
    this.browserConfig = this.loadJson(this.browserConfigPath, {});
  }

  loadAll = () => {
    this.instaConfig = this.loadJson(this.instaConfigPath, {});
    this.browserConfig = this.loadJson(this.browserConfigPath, {});
    console.log("[ConfigManager] Configuration loaded.");
  };

  loadJson = (filePath, defaultValue) => {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`[ConfigManager] Error reading file ${filePath}:`, error.message);
    }
    return defaultValue;
  };

  createDownloadStructure = async (userName, createDirectories = true) => {
    if (!createDirectories) {
      return `./downloads/${userName}`;
    }

    const basePath = `./downloads/${userName}`;
    const datePath = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const downloadPath = path.join(basePath, datePath);

    await fs.ensureDir(downloadPath);
    await fs.ensureDir(path.join(downloadPath, "images"));
    await fs.ensureDir(path.join(downloadPath, "videos"));
    await fs.ensureDir(path.join(downloadPath, "carousels"));

    return downloadPath;
  };
  //   getAccounts() {
  //   return this.accounts;
  // }

  // getEnabledAccounts() {
  //   return this.accounts.filter((acc) => acc.enabled);
  // }

  // getAppConfig() {
  //   return this.appConfig;
  // }
}

module.exports = new ConfigManager();
