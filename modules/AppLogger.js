const fs = require("fs-extra");
const path = require("path");

function getFormattedTimestamp(timestampDateObject, onlyDate) {
  timestampDateObject ||= new Date();
  const dd = String(timestampDateObject.getDate()).padStart(2, "0");
  const mm = String(timestampDateObject.getMonth() + 1).padStart(2, "0");
  const yy = String(timestampDateObject.getFullYear()).slice(-2);
  const HH = String(timestampDateObject.getHours()).padStart(2, "0");
  const MM = String(timestampDateObject.getMinutes()).padStart(2, "0");
  const SS = String(timestampDateObject.getSeconds()).padStart(2, "0");

  if (onlyDate) return `${dd}-${mm}-${yy}`;
  return `${dd}-${mm}-${yy} ${HH}-${MM}-${SS}`;
}

async function createLogFile() {
  // 1. Define the directory and file paths properly
  const logsDir = path.join(process.cwd(), "data", "logs");
  const logFileName = `${getFormattedTimestamp(undefined, true)}.txt`;
  const logFilePath = path.join(logsDir, logFileName);
  try {
    // Ensure the directory structure exists
    await fs.ensureDir(logsDir);

    const initialContent = `======= Instagram Automation Started (New Architecture) =======\n-=-=-=-=-=-= This Log Created on ${getFormattedTimestamp()} =-=-=-=-=-=-\n`;

    // 2. 'wx' flag fails if the file already exists, protecting existing data
    await fs.writeFile(logFilePath, initialContent, { flag: "wx" });

    console.log("Log File created successfully.");
    return logFilePath; // Returns false because the file did NOT exist previously
  } catch (err) {
    // 3. If the error code is EEXIST, it means the file already existed
    if (err.code === "EEXIST") {
      console.log("Log File already exists.");
      return logFilePath; // Returns true because the file already existed
    }
    throw err; // Rethrow any other unexpected errors (e.g., permission issues)
  }
}

class Applogger {
  constructor() {
    this.startTime = Date.now();
  }

  async init() {
    this.logFilePath = await createLogFile();
  }

  async logMSG(message) {
    if (!this.logFilePath) {
      console.log("Log File not exists so first creating Log File");
      this.logFilePath = await this.init();
    }
    fs.appendFileSync(this.logFilePath, `${message}\n`);
  }

  async logLineBreak() {
    let lineBreak = `===================================================================================`;
    await this.logMSG(lineBreak);
  }

  async logError(message, error) {
    const errorMessage = `${message}\nError: ${error?.message}\n`;
    await this.logMSG(errorMessage);
  }

  async logTask() {
    await this.logMSG(JSON.stringify(this.task, null, 2) + "\n\n");
    await this.logLineBreak();
  }

  async logAction() {
    await this.logMSG(JSON.stringify(this.currentAction, null, 2) + "\n\n");
    await this.appLogger.logLineBreak();
  }

  async logState() {
    await this.logMSG(JSON.stringify(this.state, null, 2) + "\n\n");
    await this.logLineBreak();
  }

  async getExecutionTime() {
    const totalSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")} minutes & ${String(seconds).padStart(2, "0")} seconds`;
  }

  async logTaskResult(status = "success") {
    const executionTime = await this.getExecutionTime();
    let resultMessage = "";

    switch (status.toLowerCase()) {
      case "error":
        resultMessage = `--------- Failed Execution - Time Taken - ${executionTime} ---------`;
        break;
      case "terminated":
        resultMessage = `--------- Terminated Execution - Time Taken - ${executionTime} ---------`;
        break;
      default:
        resultMessage = `--------- Successful Execution - Time Taken - ${executionTime} ---------`;
    }

    this.logMSG(`\n${resultMessage}\n`);
  }
}

module.exports = new Applogger();
