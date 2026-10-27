const fs = require("fs/promises"); // <-- Changed from "fs" to "fs/promises"
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
  try {
    // 1. Define the directory and file paths properly
    const logsDir = path.join(process.cwd(), "data", "logs");
    const logFileName = `${getFormattedTimestamp(undefined, true)}.txt`;
    const logFilePath = path.join(logsDir, logFileName);

    // Ensure the directory structure exists
    await fs.mkdir(logsDir, { recursive: true });

    // Use getFormattedTimestamp() for the initial content
    const currentTimestamp = getFormattedTimestamp();
    const initialContent = `======= Instagram Automation Started (New Architecture) =======\n-=-=-=-=-=-= This Log Created on ${currentTimestamp} =-=-=-=-=-=-\n`;

    // 2. 'wx' flag fails if the file already exists, protecting existing data
    await fs.writeFile(logFilePath, initialContent, { flag: "wx" });

    console.log("Log File created successfully.");
    return false; // Returns false because the file did NOT exist previously
  } catch (err) {
    // 3. If the error code is EEXIST, it means the file already existed
    if (err.code === "EEXIST") {
      console.log("Log File already exists.");
      return true; // Returns true because the file already existed
    }
    throw err; // Rethrow any other unexpected errors (e.g., permission issues)
  }
}

(async () => {
  const result = await createLogFile();
  console.log(`Did file exist? ${result}`);
})();
