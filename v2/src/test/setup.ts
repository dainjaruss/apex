// src/test/setup.ts
// Global test setup for APEX v2 Vitest suite.

import '@testing-library/jest-dom';

// Mock IndexedDB (Dexie uses it) — not available in jsdom
import 'fake-indexeddb/auto';
