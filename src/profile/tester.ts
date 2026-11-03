/**
 * The test account, for trying every pen and power. Its name and passcode come
 * from environment variables (`VITE_TESTER_USER`, `VITE_TESTER_PASSCODE`), so
 * they stay out of the repository; with none set, there is no test login.
 *
 * This is a convenience, not security: like everything in the build, the
 * values end up in the page's JavaScript, and wallets live in the browser.
 */
const USER = (import.meta.env.VITE_TESTER_USER as string | undefined)?.trim().toLowerCase() ?? '';
const PASSCODE = (import.meta.env.VITE_TESTER_PASSCODE as string | undefined)?.trim() ?? '';

export const testerEnabled = USER !== '' && PASSCODE !== '';

/** The test account's name, if the name and passcode are right. */
export function checkTester(name: string, passcode: string): string | null {
  if (!testerEnabled) return null;
  return name.trim().toLowerCase() === USER && passcode.trim() === PASSCODE ? USER : null;
}
