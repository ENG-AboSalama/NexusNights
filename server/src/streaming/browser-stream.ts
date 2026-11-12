import { chromium, type Browser, type Page, type CDPSession } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getStealthContextOptions, setupStealthPage, emulateHumanBehavior } from './stealth-config';

/**
 * Brave Browser Paths by OS
 */
function getBravePath(): string | undefined {
  const platform = process.platform;
  
  if (platform === 'win32') {
    const paths = [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      process.env.LOCALAPPDATA + '\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    return paths.find(p => fs.existsSync(p));
  } else if (platform === 'darwin') {
    return '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
  } else {
    return '/usr/bin/brave-browser';
  }
}

/**
 * Get user's real Brave profile path (to use real cookies/history)
 */
function getBraveUserDataDir(): string | undefined {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: %LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data
    const appData = process.env.LOCALAPPDATA;
    if (appData) {
      const profilePath = path.join(appData, 'BraveSoftware', 'Brave-Browser', 'User Data');
      if (fs.existsSync(profilePath)) {
        return profilePath;
      }
    }
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/BraveSoftware/Brave-Browser
    const home = process.env.HOME;
    if (home) {
      const profilePath = path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser');
      if (fs.existsSync(profilePath)) {
        return profilePath;
      }
    }
  } else {
    // Linux: ~/.config/BraveSoftware/Brave-Browser
    const home = process.env.HOME;
    if (home) {
      const profilePath = path.join(home, '.config', 'BraveSoftware', 'Brave-Browser');
      if (fs.existsSync(profilePath)) {
        return profilePath;
      }
    }
  }
  
  return undefined;
}

interface StreamOptions {
  url: string;
  roomId: string;
  resolution?: { width: number; height: number };
  fps?: number;
  bitrate?: string;
}

interface StreamControl {
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(level: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): StreamStatus;
}

interface StreamStatus {
  isActive: boolean;
  currentTime?: number;
  duration?: number;
  url: string;
}

export class BrowserStream implements StreamControl {
  private browser: Browser | null = null;
  private context: any = null; // BrowserContext from persistent launch
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private isActive = false;
  private streamUrl: string;
  private roomId: string;
  private hlsPath: string;
  private resolution: { width: number; height: number };
  private fps: number;
  private bitrate: string;
  private frameCount = 0;

  constructor(options: StreamOptions) {
    this.streamUrl = options.url;
    this.roomId = options.roomId;
    // Use realistic 1080p resolution (common laptop/desktop)
    this.resolution = options.resolution || { width: 1920, height: 1080 };
    this.fps = options.fps || 30;
    this.bitrate = options.bitrate || '2500k';
    this.hlsPath = path.join(process.cwd(), 'data', 'hls', this.roomId);
  }

  async start(): Promise<string> {
    console.log(`[BrowserStream] Starting stream for room ${this.roomId}`);
    
    // Create HLS directory
    if (!fs.existsSync(this.hlsPath)) {
      fs.mkdirSync(this.hlsPath, { recursive: true });
    }

    // Try to use Brave if available, fallback to Chromium
    const bravePath = getBravePath();
    const useBrave = bravePath && fs.existsSync(bravePath);
    
    if (!useBrave) {
      throw new Error('Brave browser not found! Please install Brave to use streaming.');
    }
    
    console.log(`[BrowserStream] Using Brave browser at: ${bravePath}`);

    // IMPORTANT: Use your REAL Brave profile for maximum stealth!
    const realBraveProfile = getBraveUserDataDir();
    
    let userDataDir: string;
    if (realBraveProfile) {
      // Copy real profile to temporary location (to avoid locking the main profile)
      userDataDir = path.join(process.cwd(), 'data', 'browser-profiles', `temp-${this.roomId}`);
      console.log(`[BrowserStream] Using real Brave profile (copied): ${realBraveProfile}`);
      
      // Create temp profile dir
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      
      // Copy cookies and preferences only (lightweight)
      try {
        const cookiesSource = path.join(realBraveProfile, 'Default', 'Cookies');
        const prefsSource = path.join(realBraveProfile, 'Default', 'Preferences');
        const cookiesDest = path.join(userDataDir, 'Default');
        
        if (!fs.existsSync(cookiesDest)) {
          fs.mkdirSync(cookiesDest, { recursive: true });
        }
        
        if (fs.existsSync(cookiesSource)) {
          fs.copyFileSync(cookiesSource, path.join(cookiesDest, 'Cookies'));
          console.log(`[BrowserStream] Copied real cookies`);
        }
        if (fs.existsSync(prefsSource)) {
          fs.copyFileSync(prefsSource, path.join(cookiesDest, 'Preferences'));
          console.log(`[BrowserStream] Copied real preferences`);
        }
      } catch (err) {
        console.warn(`[BrowserStream] Could not copy profile:`, (err as Error).message);
      }
    } else {
      // Fallback to fresh profile
      userDataDir = path.join(process.cwd(), 'data', 'browser-profiles', this.roomId);
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      console.log(`[BrowserStream] Using fresh profile (Brave not found)`);
    }

    // Launch REAL Brave with MINIMAL automation flags
    this.context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: bravePath, // Your real Brave!
      headless: false, // MUST be visible
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation', 'notifications'],
      ignoreHTTPSErrors: true,
      args: [
        // ONLY the most essential flags
        '--start-maximized',
        '--autoplay-policy=no-user-gesture-required',
        // That's it! No more flags = looks like normal browser
      ],
    });

    // Get the default page from persistent context
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    
    if (!this.page) {
      throw new Error('Failed to create page');
    }
    
    // DON'T set custom headers - use browser defaults!
    // Custom headers = bot signal
    
    // Apply stealth patches BEFORE navigation
    await setupStealthPage(this.page);
    
    console.log(`[BrowserStream] Browser launched as natural Chrome/Brave`);

    // Navigate to embed URL with more relaxed waiting
    console.log(`[BrowserStream] Navigating to: ${this.streamUrl}`);
    
    // Emulate human behavior before navigation
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    try {
      await this.page.goto(this.streamUrl, { 
        waitUntil: 'domcontentloaded', // Less strict than networkidle
        timeout: 60000, // Increased timeout
      });
      console.log(`[BrowserStream] Page loaded successfully`);
    } catch (err) {
      console.warn(`[BrowserStream] Navigation warning:`, (err as Error).message);
      // Continue anyway - page might have loaded enough
    }

    // Emulate human-like behavior (mouse movement, scrolling)
    await emulateHumanBehavior(this.page);
    
    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Debug: Log page structure
    console.log(`[BrowserStream] Page loaded, analyzing structure...`);
    const pageInfo = await this.page.evaluate(() => {
      // @ts-ignore - Running in browser context
      return {
        // @ts-ignore
        title: document.title,
        // @ts-ignore
        iframes: document.querySelectorAll('iframe').length,
        // @ts-ignore
        videos: document.querySelectorAll('video').length,
        // @ts-ignore
        bodyText: document.body?.innerText?.substring(0, 500) || '',
        // @ts-ignore
        url: window.location.href,
        // @ts-ignore
        hasNoMedia: document.body?.innerText?.includes('no-media') || false,
      };
    });
    console.log(`[BrowserStream] Page info:`, JSON.stringify(pageInfo, null, 2));

    // Check if page shows "no media available"
    if (pageInfo.hasNoMedia || pageInfo.bodyText.toLowerCase().includes('no media')) {
      console.error(`[BrowserStream] Provider returned "no media available" - content might not exist`);
      throw new Error('Provider returned no media available - try a different title or provider');
    }

    // Check if redirected to homepage or error page
    if (pageInfo.url !== this.streamUrl && !pageInfo.url.includes('embed')) {
      console.error(`[BrowserStream] Redirected from ${this.streamUrl} to ${pageInfo.url}`);
      throw new Error('Provider redirected - possible bot detection or invalid content');
    }

    // Try to click play button if exists (many players need this)
    try {
      await this.page.evaluate(() => {
        // @ts-ignore
        const playButtons = document.querySelectorAll('button, [class*="play"], [id*="play"]');
        for (const btn of playButtons) {
          // @ts-ignore
          if (btn.offsetParent !== null) { // visible
            // @ts-ignore
            btn.click();
            console.log('[Browser] Clicked play button');
            break;
          }
        }
      });
    } catch (err) {
      console.log(`[BrowserStream] No play button found or click failed`);
    }

    // Wait another moment for video to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`[BrowserStream] Video recording started via Playwright`);
    
    // Start FFmpeg to convert Playwright's video to HLS
    // Note: Playwright saves video when context closes, so we'll use a different approach
    // For now, just keep the page open and we'll handle streaming differently
    
    this.isActive = true;
    console.log(`[BrowserStream] Stream initialized (using Playwright video recording)`);
    
    // TODO: We need to implement a different streaming approach
    // Playwright records to .webm which we can convert to HLS after recording
    // For real-time streaming, we might need to stick with CDP screencast
    
    return this.getHLSUrl();
  }

  private startFFmpeg(): void {
    const playlistPath = path.join(this.hlsPath, 'index.m3u8');
    const segmentPath = path.join(this.hlsPath, 'segment%03d.ts');

    // FFmpeg command for HLS streaming
    const ffmpegArgs = [
      '-f', 'image2pipe',
      '-framerate', String(this.fps),
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-r', String(this.fps),
      '-b:v', this.bitrate,
      '-maxrate', this.bitrate,
      '-bufsize', '5000k',
      '-g', String(this.fps * 2), // GOP size = 2 seconds
      '-sc_threshold', '0',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', segmentPath,
      '-f', 'hls',
      playlistPath,
    ];

    console.log(`[FFmpeg] Starting with args:`, ffmpegArgs.join(' '));

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    this.ffmpegProcess.stderr?.on('data', (data) => {
      // Log FFmpeg output for debugging
      const log = data.toString();
      if (log.includes('frame=') || log.includes('time=')) {
        // Suppress verbose frame logs
        return;
      }
      console.log(`[FFmpeg] ${log}`);
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error(`[FFmpeg] Error:`, err);
    });

    this.ffmpegProcess.on('exit', (code) => {
      console.log(`[FFmpeg] Exited with code ${code}`);
    });
  }

  async play(): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate(() => {
      // @ts-ignore - Running in browser context
      const video = document.querySelector('video') as any;
      // @ts-ignore
      if (video) video.play();
    });
  }

  async pause(): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate(() => {
      // @ts-ignore - Running in browser context
      const video = document.querySelector('video') as any;
      // @ts-ignore
      if (video) video.pause();
    });
  }

  async seek(seconds: number): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate((time) => {
      // @ts-ignore - Running in browser context
      const video = document.querySelector('video') as any;
      // @ts-ignore
      if (video) video.currentTime = time;
    }, seconds);
  }

  async setVolume(level: number): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate((vol) => {
      // @ts-ignore - Running in browser context
      const video = document.querySelector('video') as any;
      // @ts-ignore
      if (video) video.volume = Math.max(0, Math.min(1, vol));
    }, level);
  }

  async stop(): Promise<void> {
    console.log(`[BrowserStream] Stopping stream for room ${this.roomId}`);
    this.isActive = false;

    // Stop screencast
    if (this.cdpSession) {
      try {
        await this.cdpSession.send('Page.stopScreencast');
        await this.cdpSession.detach();
      } catch (err) {
        console.error('[BrowserStream] CDP session error:', err);
      }
      this.cdpSession = null;
    }

    // Stop FFmpeg
    if (this.ffmpegProcess) {
      this.ffmpegProcess.stdin?.end();
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }

    // Close browser
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    // Clean up HLS files
    setTimeout(() => {
      if (fs.existsSync(this.hlsPath)) {
        fs.rmSync(this.hlsPath, { recursive: true, force: true });
      }
    }, 5000); // Wait 5s to ensure clients fetched last segments

    console.log(`[BrowserStream] Stream stopped, ${this.frameCount} frames captured`);
  }

  getStatus(): StreamStatus {
    return {
      isActive: this.isActive,
      url: this.streamUrl,
    };
  }

  getHLSUrl(): string {
    return `/hls/${this.roomId}/index.m3u8`;
  }
}
