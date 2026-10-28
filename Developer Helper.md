# Permissions Popup Handling -

Question - In Browser.js (Browser Module) What the 2 Important Line as given below do and what happen if i remove Them?

```javascript
// Set permissions
const context = this.browser.defaultBrowserContext();
await context.overridePermissions("https://www.youtube.com/", []);
```

Answer -
Here's what those two lines do:

- `const context = this.browser.defaultBrowserContext();`
  - Gets the default [BrowserContext](https://pptr.dev/api/puppeteer.browsercontext) from the Puppeteer browser instance. A browser context holds the set of pages, cookies, permissions, etc. The "default" context is the one your browser launched with.

- `await context.overridePermissions("https://www.youtube.com/", []);`
  - Overrides browser permissions for `https://www.youtube.com/` with an **empty array** — meaning it **denies all permissions** (notifications, geolocation, camera, microphone, etc.) for YouTube. This prevents YouTube from prompting things like "Allow notifications?" while your automation is running.

- **What happens if you remove them?**
  - Practically speaking — **nothing will break**. Your automation targets Instagram, not YouTube. These lines only affect YouTube's permissions. Removing them means:
  - YouTube pages (if any are opened during automation) could show permission prompts (e.g., notification popups), which might interfere if you ever navigate there.
  - Everything Instagram-related stays completely unaffected.

- **For All URLs it Works on Browser Level not on Page Level**
  - Unfortunately, overridePermissions() requires a specific origin — there's no wildcard or "all URLs" option in Puppeteer. But you can achieve the same result (suppressing all permission prompts globally) via browser launch args. Let me check how you're launching the browser: Since you're launching Chrome via spawn with command-line flags (line 105 in getBrowser.js), the simplest way to deny all permission prompts globally is to add a Chrome launch flag. Replace the overridePermissions lines in Browser.js L42-43 with nothing (remove them), and instead add --deny-permission-prompts to your Chrome launch command in getBrowser.js L105:
  ```js
  const openCommand = `"${chromePath}" --user-data-dir="${userDataDir}"  --profile-directory="Profile ${profileTarget}" --remote-debugging-port=${port} --window-size=${w},${h} --window-position=${x},${y} --deny-permission-prompts`;
  ```
  What this does: --deny-permission-prompts is a Chromium flag that automatically denies every permission request (notifications, geolocation, camera, mic, etc.) for all origins, without needing to specify URLs one by one. It works at the browser level, so it covers every page your automation visits.

---

# JavaScript `this` Context & Arrow Functions (Lexical Scope)

### Problem: `TypeError: Cannot read properties of undefined (reading 'xyz')`

Inside JavaScript ES6 classes, the code executes in **strict mode** by default. When you pass an instance method as a standalone callback/argument:

```javascript
// ❌ WRONG: Passing `this.waitForElementRobust` as an unbound parameter
await utils.robustPolling(
  waitSearchnClick,
  options,
  this.page,
  textOrSelectorOrElement,
  text,
  this.waitForElementRobust, // Passed as a bare function reference!
);
```

And inside `waitSearchnClick` you call it as:

```javascript
await waitForElementRobust(...); // Invoked without a receiver object!
```

Because it was invoked without `this.`, its execution context (`this`) is lost and becomes `undefined`. When the method tries to access `this.page`, it fails with:
`TypeError: Cannot read properties of undefined (reading 'page')`

---

## Technique 1: Helper Arrow Functions Inside Methods

Unlike traditional `function` declarations (which define their own `this`), **arrow functions `() => {}` do not have their own `this`**. Instead, they inherit `this` directly from the enclosing scope (the class method where they are written). They also capture outer variables via **closure**.

You **do not need** `.bind()`, `.call()`, or `.apply()`.

#### ✅ The Clean & Optimized Pattern:

Write the helper inside the method as an arrow function:

```javascript
async clickNotClickable(textOrSelectorOrElement, text) {
  await this.waitForPageLoad();
  await utils.randomDelay(0.75);

  // Arrow function automatically captures `this` from EnhancedPage instance
  // and outer variables (textOrSelectorOrElement, text) via closure!
  const waitSearchnClick = async () => {
    const element =
      typeof textOrSelectorOrElement === "string"
        ? await this.waitForElementRobust(textOrSelectorOrElement, text) // `this` is preserved!
        : textOrSelectorOrElement;

    if (!element) {
      throw new Error(`Element not found: ${textOrSelectorOrElement}`);
    }

    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      throw new Error(`Bounding Box not found for: ${textOrSelectorOrElement}`);
    }

    const { x, y, width, height } = boundingBox;
    await this.page.mouse.click(x + width / 2, y + height / 2); // `this.page` is preserved!
    return true;
  };

  // No need to pass 4 arguments into robustPolling!
  await utils.robustPolling(waitSearchnClick, {
    maxAttempts: 9,
    delayMs: 3000,
    timeoutMs: 30000,
    retryCondition: (result) => result === true,
  });

  await this.waitForPageLoad();
}
```

---

## Technique 2: Class Methods Defined Directly as Arrow Functions (Class Field Syntax)

You can define methods **directly on the class body** using arrow functions:

```javascript
class EnhancedPage {
  constructor() {
    this.page = null;
  }

  // ✅ Arrow Function Method (Public Class Field):
  // Lexically bound to the instance at construction time!
  getText = async (selectorStringOrElement) => {
    let el;
    if (typeof selectorStringOrElement === "string") {
      el = await this.page.locator(selectorStringOrElement).waitHandle();
    } else {
      el = selectorStringOrElement;
    }
    const text = await this.page.evaluate((element) => element.textContent, el);
    return text;
  };
}
```

### Why define class methods as arrow functions?

1. **Auto-bound `this` (Cannot be lost):**
   Normal prototype methods (`async getText() {}`) lose `this` if passed as a callback or detached from the object. Arrow function methods (`getText = async () => {}`) are permanently bound to the class instance.

2. **Safe to pass as bare callbacks:**
   You can pass this method directly to utilities, event listeners, or pollers without `.bind(this)` and without wrapping it:

   ```javascript
   // ✅ 100% safe: `this` will NEVER be undefined inside getText!
   await utils.robustPolling(this.getText, options, "[name='search_query']");

   // ✅ Safe to destructure as well:
   const { getText } = EnhancedPage;
   await getText("[name='search_query']");
   ```

3. **Instance vs. Prototype:**
   - **Standard method (`async myMethod() {}`)**: Lives on `ClassName.prototype`. Shared across all instances. Requires `.bind(this)` or arrow wrapper if passed as a standalone callback.
   - **Arrow method (`myMethod = async () => {}`)**: Stored directly on each class instance (`this.myMethod`). Since `EnhancedPage` is used as a **singleton** (`module.exports = new EnhancedPage()`), there is zero memory overhead, and it guarantees complete safety against `this` loss.

---

### Quick Mental Checklist When `this` Is `undefined`:

1. **Did I pass a class method as a callback or parameter without `()`?** (e.g. `poll(this.myMethod)`). If yes, `this` is lost because it was detached from the instance.
2. **Fix Option A (Arrow Method)**: Define the method on the class using arrow syntax:
   `myMethod = async (...) => { ... }` (it will stay bound forever).
3. **Fix Option B (Inner Arrow Helper)**: Inside the caller method, write a helper arrow function:
   `const helper = async () => { await this.myMethod(); }` and pass `helper`.
4. **Fix Option C (Inline Arrow Wrapper)**: Wrap the call directly at the callsite:
   `poll(() => this.myMethod())`.

<!-- Some Usefull Chrome dev tools commands -->

let el = [...document.querySelectorAll('*')].find(el => el.textContent.trim() === 'Create')
let el2 = [...document.querySelectorAll('*')].filter(el => el.textContent.trim() === 'Create')
let el3 = Array.from(document.querySelectorAll('\*')).filter(el => Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === 'Create'));
