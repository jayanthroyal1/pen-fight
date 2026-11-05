/**
 * Getting rid of the browser's bars. Android browsers can go full screen after
 * a tap. iPhones can't, so there the only way is adding the site to the Home
 * Screen, which opens it as an app with no bars at all.
 */

const OFF_KEY = 'wildplayers:fullscreen-off';
const INSTALL_DISMISSED_KEY = 'wildplayers:install-dismissed';

/** iPads report themselves as Macs, so touch points tell them apart. */
export const isIosDevice = (userAgent: string, platform: string, touchPoints: number) =>
  /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const hasWindow = typeof window !== 'undefined';

/** Read once at load: `display-mode` also changes while a page is merely full screen. */
export const isInstalled =
  hasWindow &&
  (window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = hasWindow && isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

export const canFullscreen = hasWindow && !isInstalled && document.fullscreenEnabled === true;

export const isFullscreen = () => document.fullscreenElement !== null;

function remember(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Remembering is only a convenience.
  }
}

function recall(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function enter(): void {
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    // The browser said no: the game carries on with its bars.
  });
}

/**
 * Goes full screen on phones and tablets, unless the player turned it off. Must
 * run inside a tap. Computers keep their window: nobody expects a site to take it.
 */
export function autoFullscreen(): void {
  if (!canFullscreen || isFullscreen() || recall(OFF_KEY)) return;
  if (window.matchMedia?.('(pointer: coarse)').matches) enter();
}

/** The player's own switch, which is remembered. */
export function toggleFullscreen(): void {
  if (isFullscreen()) {
    remember(OFF_KEY, true);
    void document.exitFullscreen();
  } else {
    remember(OFF_KEY, false);
    enter();
  }
}

let installEvent: InstallEvent | null = null;
const installListeners = new Set<() => void>();

if (hasWindow) {
  // Android offers this when the site can be installed; keep it for our own button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    installListeners.forEach((f) => f());
  });
}

export const onInstallChange = (f: () => void) => {
  installListeners.add(f);
  return () => void installListeners.delete(f);
};

/** What to offer: an Install button, the iPhone's steps, or nothing. */
export function installOffer(): 'button' | 'steps' | null {
  if (isInstalled || recall(INSTALL_DISMISSED_KEY)) return null;
  if (installEvent) return 'button';
  return isIos ? 'steps' : null;
}

export async function install(): Promise<void> {
  const event = installEvent;
  if (!event) return;
  installEvent = null;
  await event.prompt();
  installListeners.forEach((f) => f());
}

export function dismissInstall(): void {
  remember(INSTALL_DISMISSED_KEY, true);
  installListeners.forEach((f) => f());
}
