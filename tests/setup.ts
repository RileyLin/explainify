import "@testing-library/jest-dom/vitest";

// React 19 needs this for act() to work in test environments
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
