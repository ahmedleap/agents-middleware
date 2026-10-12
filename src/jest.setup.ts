import { jest } from '@jest/globals';

// Preserve existing test style that expects global jest in ESM test runs.
(globalThis as Record<string, unknown>).jest = jest;
