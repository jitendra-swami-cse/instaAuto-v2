// Tasks should be done by this script are as below
// 1. One helper function to find the media that needs to be edited (which are downloaded and not already edited).
//    1.1. search for all image files and video files exists in child directory of "./data" and return there paths array.
//    1.2. now using that array check that same folder have any file with that same name just having preffix "em".
//    1.3. if file exsits means that post Media is already edited so just remove that path from array.
//            - So the array will have paths of unedited media only.
//  2. Update the code of function "editPostsBeforeUpload" to use the "unEditedFiles" array return in step 1.
//    2.1. use path to determine the type of file to edit
//    2.2. if it is an image file than use "imageEditor" function to edit that
//    2.3. else if it is an video file than use "videoEditor" function to edit that
//  Note - Check the functioning of imageEditor function and videoEditor function that should create edited file in the same directory of original file and named them as same as original file just with preffuix "em".

//      - 1. get list of all resources and their userDataPath for that
//                - profilesData = db.readProfilesData()
//                - filter profilesData array, profiles that are type = "resource"

const fs = require("fs-extra");
const db = require("./db.js");
const path = require("path");
const { spawn } = require("child_process");

// ---- Main Functions ----
const editPostsBeforeUpload = async function (userName) {
  if (!userName) throw new Error(`editPostsBeforeUpload function needs a userName as argument.`);

  //   1. Read the data to user profile
  const profileData = await db.readUserProfileData(userName);

  //   2. Creating list of posts available to edit
  if (profileData.postsDownloaded === 0) throw new Error(`There are no (0) posts downloaded to edit.`);
  else if (profileData.postsDownloaded === profileData.postsEdited)
    throw new Error(`All ${profileData.postsDownloaded} posts already downloaded and ${profileData.postsEdited} posts edited.`);

  const postsToEdit = profileData.posts.filter((post) => !("isEdited" in post) || !post.isEdited);

  //   3. Edit Posts (from postsToEdit) one-by-one
  for (const post of postsToEdit) {
    // 3.1 Loop through all media paths of the post and call the editor function according to the type of media.
    for (const mediaPath of post.mediaPathArr) {
      if (mediaPath.split(".").pop().toLowerCase() === "mp4") {
        // Call Video Editor Function and pass mediaPath to that function
        console.log(`According to mediaPath(${mediaPath}) this media is a video.`);
        try {
          await videoEditor(mediaPath);
          console.log(`Successfully edited video: ${mediaPath}`);
        } catch (error) {
          console.error(`Failed to edit video ${mediaPath}: ${error.message}`);
        }
      } else if (mediaPath.split(".").pop().toLowerCase() === "webp") {
        // Call Image Editor Function and pass mediaPath to that function
        console.log(`According to mediaPath(${mediaPath}) this media is an image of type webp.`);
        try {
          await imageEditor(mediaPath);
          console.log(`Successfully edited image: ${mediaPath}`);
        } catch (error) {
          console.error(`Failed to edit image ${mediaPath}: ${error.message}`);
        }
      } else {
        // Call Image Editor Function and pass mediaPath to that function
        console.log(`According to mediaPath(${mediaPath}) this media is an image of type jpg.`);
        try {
          await imageEditor(mediaPath);
          console.log(`Successfully edited image: ${mediaPath}`);
        } catch (error) {
          console.error(`Failed to edit image ${mediaPath}: ${error.message}`);
        }
      }
    }

    // 3.2 Update the post in the database
    post.isEdited = true;
  }
  await updateDatabaseAfterEditingPosts(profileData);
  console.log(`========= Posts Editing completed for ${userName}. =========`);
};

// ---- Video Editor Function ----
const videoEditor = async function (videoPath) {
  return new Promise((resolve, reject) => {
    if (!videoPath) {
      const error = new Error("videoEditor function requires a video file path as an argument.");
      console.error(error.message);
      return reject(error);
    }

    if (!fs.existsSync(videoPath)) {
      const error = new Error(`Video file does not exist at path: ${videoPath}`);
      console.error(error.message);
      return reject(error);
    }

    const pythonScriptPath = path.join(__dirname, "videoEditor", "scr.py");
    console.log(`Starting video editing for: ${videoPath}`);
    console.log(`Using Python script: ${pythonScriptPath}`);

    const pythonProcess = spawn("python", [pythonScriptPath, videoPath]);

    let outputLogs = [];
    let errorLogs = [];

    pythonProcess.stdout.on("data", (data) => {
      const log = data.toString();
      console.log(`Video Editor [stdout]: ${log}`);
      outputLogs.push(log);
    });

    pythonProcess.stderr.on("data", (data) => {
      const errorLog = data.toString();
      console.error(`Video Editor [stderr]: ${errorLog}`);
      errorLogs.push(errorLog);
    });

    pythonProcess.on("error", (error) => {
      console.error(`Video Editor Process Error: ${error.message}`);
      errorLogs.push(error.message);
      reject(new Error(`Failed to start video editing process: ${error.message}`));
    });

    pythonProcess.on("close", (code) => {
      console.log(`Video editing process exited with code ${code} for file: ${videoPath}`);
      if (code === 0) {
        const outputFile = path.join(path.dirname(videoPath), `edited_${path.basename(videoPath)}`);
        if (fs.existsSync(outputFile)) {
          console.log(`Video successfully edited: ${outputFile}`);
          resolve({ success: true, outputFile, logs: outputLogs, errors: errorLogs });
        } else {
          const error = new Error(`Edited video file not found at expected path: ${outputFile}`);
          console.error(error.message);
          errorLogs.push(error.message);
          reject(error);
        }
      } else {
        const error = new Error(`Video editing failed with exit code ${code}. Check logs for details.`);
        console.error(error.message);
        errorLogs.push(`Exit code: ${code}`);
        reject(error);
      }
    });
  });
};

// ---- Image Editor Function ----
const imageEditor = async function (imagePath, options = { mirrorImage: true, highOpacityOverlay: false, showConsoleLogs: true }) {
  return new Promise((resolve, reject) => {
    if (!imagePath) {
      const error = new Error("imageEditor function requires an image file path as an argument.");
      console.error(error.message);
      return reject(error);
    }

    if (!fs.existsSync(imagePath)) {
      const error = new Error(`Image file does not exist at path: ${imagePath}`);
      console.error(error.message);
      return reject(error);
    }

    const pythonScriptPath = path.join(__dirname, "imageEditor", "imgEditorScr.py");
    console.log(`Starting image editing for: ${imagePath}`);
    console.log(`Using Python script: ${pythonScriptPath}`);

    const args = [pythonScriptPath, imagePath, options.mirrorImage.toString(), options.highOpacityOverlay.toString()];
    const pythonProcess = spawn("python", args);

    let outputLogs = [];
    let errorLogs = [];

    pythonProcess.stdout.on("data", (data) => {
      const log = data.toString();
      if (options.showConsoleLogs) {
        console.log(`Image Editor [stdout]: ${log}`);
      }
      outputLogs.push(log);
    });

    pythonProcess.stderr.on("data", (data) => {
      const errorLog = data.toString();
      if (options.showConsoleLogs) {
        console.error(`Image Editor [stderr]: ${errorLog}`);
      }
      errorLogs.push(errorLog);
    });

    pythonProcess.on("error", (error) => {
      console.error(`Image Editor Process Error: ${error.message}`);
      errorLogs.push(error.message);
      reject(new Error(`Failed to start image editing process: ${error.message}`));
    });

    pythonProcess.on("close", (code) => {
      console.log(`Image editing process exited with code ${code} for file: ${imagePath}`);
      if (code === 0) {
        const outputFile = path.join(path.dirname(imagePath), `edited_${options.highOpacityOverlay ? "high_opac" : "low_opac"}_${path.basename(imagePath)}`);
        if (fs.existsSync(outputFile)) {
          console.log(`Image successfully edited: ${outputFile}`);
          resolve({ success: true, outputFile, logs: outputLogs, errors: errorLogs });
        } else {
          const error = new Error(`Edited image file not found at expected path: ${outputFile}`);
          console.error(error.message);
          errorLogs.push(error.message);
          reject(error);
        }
      } else {
        const error = new Error(`Image editing failed with exit code ${code}. Check logs for details.`);
        console.error(error.message);
        errorLogs.push(`Exit code: ${code}`);
        reject(error);
      }
    });
  });
};

// ----- Update Data-base with latest information after Editing Posts -----
const updateDatabaseAfterEditingPosts = async function (profileData) {
  const userName = profileData.userName;

  // 1. Calculating how many posts are edited
  profileData.postsEdited = profileData.posts.reduce((acc, post) => acc + (post.isEdited ? 1 : 0), 0);

  // 2. Update allProfilesData.json
  const allProfilesData = await db.readProfilesData();
  const tempMiniProfileData = allProfilesData.find((profile) => profile.userName === userName);
  tempMiniProfileData.postsEdited = profileData.postsEdited;

  tempMiniProfileData.lastMediaEditingDate = new Date().toISOString();
  profileData.lastMediaEditingDate = new Date().toISOString();

  // 3. Update user's Data
  await db.writeUserProfileData(profileData); // Updates the data of user about which post isDownloaded.
  await db.writeProfilesData.call(this, allProfilesData);
  return true;
};

// editPostsBeforeUpload("jitendra_goswami132");
