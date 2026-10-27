// const testTask = require("testTask.json")
//  Note How to use it:
/* 
// Step 1: define the async function
async function testFunction3() {
  console.log(`Running testFunctions3...`);
}

// (OPTIONAL) Step 2: define the errorHandler function particular for function
testFunction3.errorHandler = async function (err) {
  console.log(`In Error the errorHandler function of testFunction3`);
  console.log(`In Error the errorHandler function of testFunction3`);
  return result
  }
  ---------------------- OR ----------------------
  testFunction3.errorHandler = errorHandlerOftestFunction3;
  - IF NOT DEFINE the errorHandler function then it will use the default errorHandler function (that is presently else block of catch block)

// (OPTIONAL) Step 3: define value of continueOnError
  - By Default value of continueOnError is true even when fn.continueOnError is not defined,
      BUT if you want that execution should stop if any error occured in function then you must set fn.continueOnError = false

// Step 4: wrap the async function using catchAsync function 
  - Must call catchAsync with function as arugument itself to pass the properties with it
  like below:
  - catchAsync(testFunction3)
  - OR
  - catchAsync(testFunction3, {continueOnError: false})
  - OR
  - catchAsync(testFunction3, {errorHandler: errorHandlerOftestFunction3})
  - OR
  - catchAsync(testFunction3, {continueOnError: false, errorHandler: errorHandlerOftestFunction3})
  - OR
  - catchAsync(testFunction3, {continueOnError: true, errorHandler: errorHandlerOftestFunction3})

*/

/**
 * Wraps an async function to handle errors gracefully
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - The wrapped function that forwards errors to error handler
 */
const { askUser } = require("./utils");

const readTaskAgain = async function () {
  // 1. Delete the cached Task
  const taskName = this.task.taskName;
  // 2. Get all Task Objects in newTask
  this.task.splice(this.currentActionIndex);
  const newTask = [...this.task];

  // 3. Delete the this.task from cache
  const taskPath = require.resolve(`../tasks/${taskName}.json`);
  delete require.cache[taskPath];
  // 4. Require the modified Task again
  const tempTask = require(`../tasks/${taskName}.json`);
  // 5. Remove all the actions from tempTask that are not needed.
  tempTask.splice(0, this.currentActionIndex);
  // 6. Add the newTask & tempTask to create this.task
  this.task = [...newTask, ...tempTask];
  this.task.taskName = taskName;
  this.task.push({
    parentModuleName: "devOrTest",
    actionName: "endDevFunction",
  });

  return true;
};

const catchAsync = (fn) => {
  // Create the function with the same name using Object.defineProperty
  const wrappedFn = async function (...args) {
    try {
      const result = await fn.apply(this, args);
      return result;
    } catch (error) {
      fn.continueOnError ??= true;
      if (!fn.continueOnError) {
        throw error;
      } else {
        const modErrorMSG = `Error in ${fn.name}: ${error.message}. \n${error?.stack?.split("\n")[1]?.trim()}`;
        console.log(
          `-1-1-1-1-1-1- in catchAsync.js -1-1-1-1-1-1- the this will be as below:`,
        );
        console.log(this);

        console.error(`\x1b[31m${modErrorMSG}\x1b[0m`);
        /*      This is a big problem the context of this here changes as you closed the browser and call page.waitForPageLoad you will see the error.
        console.log(`this.appLogger`);
        console.log(this);
        this.appLogger.logError(modErrorMSG);
        
        */
        this.appLogger.logError(modErrorMSG);
        const msgForUser =
          "Please resolve the error and press \n---'r' to retry.\n---'ra' if you want to read the task again and then retry the current Action.\n---'cr 5' if you want to read the task again and start the task from index no. 5.\n---'s' if you want to skip.\nPress Enter.....";
        const userInput = (await askUser(`${msgForUser}`)).toLowerCase();
        console.log(`user input is: ${userInput}`);

        switch (userInput) {
          case "s":
          case "skip":
            return;
          case "r":
            this.currentActionIndex--;
            return;
          case "ra":
            // Read task again and retry current action
            console.log(`dir Name is: ${__dirname}`);
            this.currentActionIndex--;

            await readTaskAgain.call(this);
            return;
          default:
            if (userInput.startsWith("cr ")) {
              // Extract the index number after 'cr '
              const newIndex = parseInt(userInput.split(" ")[1]);
              console.log(this.task);

              if (!isNaN(newIndex)) {
                this.currentActionIndex = newIndex - 1; // as currentActionIndex++ in appExecuter.js before next loop
              }
            } else {
              this.currentActionIndex--; // Default behavior: retry current action
            }
            await readTaskAgain.call(this);
            return;
        }
      }
    }
  };
  // Setting the function name for appLogger and console log
  Object.defineProperty(wrappedFn, "name", {
    value: fn.name,
    configurable: true,
  });
  // Copying all other properties like shouldStoreState, etc.
  Object.assign(wrappedFn, fn);
  return wrappedFn;
};

module.exports = catchAsync;
