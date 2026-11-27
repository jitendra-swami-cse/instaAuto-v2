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

  writeJson = (filePath, valueToWrite) => {
    try {
      fs.outputJsonSync(filePath, valueToWrite, { spaces: 2 });
      return true;
    } catch (error) {
      console.error(`[ConfigManager] Error writing file ${filePath}:`, error.message);
      return false;
    }
  };

  createProfileStructure = async (username) => {
    const profilePath = path.resolve(process.cwd(), "data", username);

    await fs.ensureDir(profilePath);
    await fs.ensureDir(path.join(profilePath, "images"));
    await fs.ensureDir(path.join(profilePath, "videos"));
    await fs.ensureDir(path.join(profilePath, "carousels"));

    return profilePath;
  };

  getProfile = async (username) => {
    const profilePath = path.resolve(process.cwd(), "data", username, `${username}.json`);
    const profileData = await this.loadJson(profilePath, { posts: [] });
    profileData.posts ||= [];
    return profileData;
  };

  /* ────────────────────────────── Check status of current Profile or Post ────────────────────────────── */
  checkPostStatus = async (postMediaDetailsArr, username) => {
    let profile;
    if (username) profile = await this.getProfile(username);
    else profile = this.currentProfile;

    postMediaDetailsArr = postMediaDetailsArr.map((postToCheckStatus) => {
      postToCheckStatus.postDataExists = profile.posts.some((post) => {
        if (!post.imgIndex) return post.postCode === postToCheckStatus.postCode;
        else post.postCode === postToCheckStatus.postCode && post.imgIndex === postToCheckStatus.imgIndex;
      });

      if (!postToCheckStatus.postDataExists) return { ...postToCheckStatus, postNeedUpdate: true };
      else {
        // -=-=-=- postStatus.postExists = true means post exists then perform other validation checks like -
        //  lastScapedAt-currentDateTime > maxTimeLimitToRescrape...etc

        console.log(`Post ${postToCheckStatus.postCode} exists in ${this.currentProfile.username}.json.`);
        console.log(`\x1b[38;5;166mNo need to scrape this post again.\x1b[0m`);
        return { ...postToCheckStatus, postNeedUpdate: false };
      }
    });
    return postMediaDetailsArr;
  };

  updatePostStatus = async (postToUpdate, mustUpdate) => {
    let foundPost;
    foundPost = this.currentProfile?.posts?.find((post) => post.postCode === postToUpdate.postCode);
    if (mustUpdate) {
      if (foundPost) foundPost = { ...foundPost, ...postToUpdate };
      else this.currentProfile.posts.push(postToUpdate);
      return "postUpdatedSuccessfully";
    } else if (!foundPost) return "needUpdate";
  };
  /* ────────────────────────────── Write data of current Profile or Post ────────────────────────────── */
  writeCurrenProfileStatus = async (username) => {
    username ||= this.currentProfile.username;
    const filePath = path.resolve(process.cwd(), "data", username, `${username}.json`);
    this.writeJson(filePath, this.currentProfile || {});
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
