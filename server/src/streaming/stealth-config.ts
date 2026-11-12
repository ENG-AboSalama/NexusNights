/**
 * Advanced Stealth Configuration for Playwright
 * Bypasses bot detection by patching browser fingerprints and emulating real user behavior
 * 
 * Based on research from:
 * - playwright-extra-plugin-stealth
 * - rebrowser-patches
 * - undetected-chromedriver
 */

// @ts-nocheck - Browser context code runs in the browser, not Node
import type { BrowserContext, Page } from 'playwright';

/**
 * Real Chrome user agents (updated 2026)
 */
const CHROME_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

/**
 * Get a realistic Chrome user agent
 */
export function getStealthUserAgent(): string {
  return CHROME_USER_AGENTS[Math.floor(Math.random() * CHROME_USER_AGENTS.length)];
}

/**
 * Stealth context options for browser launch
 */
export function getStealthContextOptions() {
  return {
    userAgent: getStealthUserAgent(),
    viewport: { width: 1920, height: 1080 }, // Full HD
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['geolocation', 'notifications'],
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    colorScheme: 'light' as const,
    // NO extra headers - let browser send natural ones
  };
}

export async function applyStealthPatches(page: Page): Promise<void> {
  // Must run before any page navigation
  await page.addInitScript(() => {
    // @ts-ignore - All code here runs in browser context
    
    // ===== CRITICAL: Remove all automation markers =====
    
    // 1. Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // 2. Remove __webdriver_script_fn markers
    delete document.__webdriver_script_fn;
    
    // 3. Remove Playwright/Selenium detection
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete window.$chrome_asyncScriptInfo;
    delete window.$cdc_asdjflasutopfhvcZLmcfl_;
    
    // 4. Fix navigator properties
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        },
        {
          0: { type: "application/pdf", suffixes: "pdf", description: "" },
          description: "",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          length: 1,
          name: "Chrome PDF Viewer"
        },
      ],
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // 5. Fix permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: 'granted' }) :
        originalQuery(parameters)
    );

    // 6. Mock chrome object
    if (!window.chrome) {
      window.chrome = {
        runtime: {
          OnInstalledReason: {
            CHROME_UPDATE: "chrome_update",
            INSTALL: "install",
            SHARED_MODULE_UPDATE: "shared_module_update",
            UPDATE: "update"
          },
          OnRestartRequiredReason: {
            APP_UPDATE: "app_update",
            OS_UPDATE: "os_update",
            PERIODIC: "periodic"
          },
          PlatformArch: {
            ARM: "arm",
            ARM64: "arm64",
            MIPS: "mips",
            MIPS64: "mips64",
            X86_32: "x86-32",
            X86_64: "x86-64"
          },
          PlatformNaclArch: {
            ARM: "arm",
            MIPS: "mips",
            MIPS64: "mips64",
            X86_32: "x86-32",
            X86_64: "x86-64"
          },
          PlatformOs: {
            ANDROID: "android",
            CROS: "cros",
            LINUX: "linux",
            MAC: "mac",
            OPENBSD: "openbsd",
            WIN: "win"
          },
          RequestUpdateCheckStatus: {
            NO_UPDATE: "no_update",
            THROTTLED: "throttled",
            UPDATE_AVAILABLE: "update_available"
          }
        },
        loadTimes: function() {
          return {
            commitLoadTime: Date.now() / 1000 - Math.random() * 2,
            connectionInfo: "h2",
            finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
            finishLoadTime: Date.now() / 1000 - Math.random(),
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000 - Math.random() * 3,
            navigationType: "Other",
            npnNegotiatedProtocol: "h2",
            requestTime: Date.now() / 1000 - Math.random() * 4,
            startLoadTime: Date.now() / 1000 - Math.random() * 5,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true
          };
        },
        csi: function() {
          return {
            onloadT: Date.now(),
            pageT: Date.now() - Math.random() * 5000,
            startE: Date.now() - Math.random() * 10000,
            tran: 15
          };
        },
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: "disabled",
            INSTALLED: "installed",
            NOT_INSTALLED: "not_installed"
          },
          RunningState: {
            CANNOT_RUN: "cannot_run",
            READY_TO_RUN: "ready_to_run",
            RUNNING: "running"
          }
        }
      };
    }

    // 7. Battery API
    if (!navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 0.99,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      });
    }

    // 8. Connection API
    if (!navigator.connection) {
      navigator.connection = {
        effectiveType: '4g',
        rtt: 100,
        downlink: 10,
        saveData: false,
        onchange: null,
      };
    }

    // 9. Fix deviceMemory
    if (!navigator.deviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });
    }

    // 10. Fix hardwareConcurrency
    if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency === 0) {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });
    }

    // 11. WebGL fingerprint protection
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
    
    // 12. Override toString to hide modifications
    const originalToString = Function.prototype.toString;
    Function.prototype.toString = function() {
      if (this === navigator.getBattery ||
          this === navigator.connection ||
          this === WebGLRenderingContext.prototype.getParameter) {
        return 'function () { [native code] }';
      }
      return originalToString.call(this);
    };
    
    // 13. Fix Date to avoid timezone detection
    const originalDate = Date;
    const timezoneOffset = -300; // EST
    Date = function(...args) {
      if (args.length === 0) {
        return new originalDate();
      }
      return new originalDate(...args);
    };
    Date.prototype = originalDate.prototype;
    Date.now = originalDate.now;
    Date.parse = originalDate.parse;
    Date.UTC = originalDate.UTC;

    console.log('[Stealth] Anti-detection patches applied successfully');
  });
}

/**
 * Emulate realistic human behavior
 */
export async function emulateHumanBehavior(page: Page): Promise<void> {
  // Random mouse movements
  const randomMove = async () => {
    const x = Math.floor(Math.random() * 800) + 100;
    const y = Math.floor(Math.random() * 600) + 100;
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
  };

  // Random scroll
  const randomScroll = async () => {
    const scrollY = Math.floor(Math.random() * 500) + 100;
    await page.evaluate((y) => {
      // @ts-ignore - Browser context
      window.scrollTo(0, y);
    }, scrollY);
  };

  // Perform random actions
  await randomMove();
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  await randomScroll();
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
  await randomMove();
}

/**
 * Complete stealth setup for a page
 */
export async function setupStealthPage(page: Page): Promise<void> {
  await applyStealthPatches(page);
  
  // Block common tracking/analytics scripts
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const blockedDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'facebook.com/tr',
      'connect.facebook.net',
      'analytics.twitter.com',
      'stats.g.doubleclick.net',
      'mc.yandex.ru',
      'use.typekit.net',
      'beacon.krxd.net',
      'nexus.ensighten.com',
      'cdn.jsdelivr.net/npm/fingerprintjs',
      'fp-cdn.com',
    ];

    if (blockedDomains.some(domain => url.includes(domain))) {
      route.abort();
    } else {
      route.continue();
    }
  });
}
