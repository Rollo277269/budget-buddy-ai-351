import "@testing-library/jest-dom";

if (typeof window === "undefined") {
  // Node environment: no DOM globals to patch.
} else {
  Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
  });
}
