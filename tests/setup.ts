import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// React 19 needs this for act() to work in test environments
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/e/test-slug",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
