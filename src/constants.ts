// src/constants.ts

/**
 * The backend's built-in demo pull request (pr-analyzer/fixtures/demoPR.js).
 *
 * Analysing it exercises the real parsers, SQL rules, in-depth review, risk registry
 * and write-path planning — only the GitHub fetch is replaced by a fixture, so
 * it needs no token and consumes no API rate limit. Confirmed writes against
 * it are refused by the backend: there is no real pull request behind it.
 */
export const DEMO_PR_URL = 'https://github.com/test/test/pull/1';
