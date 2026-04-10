/**
 * UI Configuration
 * Centralized UI dimensions, breakpoints, and responsive design settings
 */

// Responsive design breakpoints
export const BREAKPOINTS = {
  // Mobile breakpoint (xs)
  MOBILE: 640,

  // Tablet breakpoint (sm)
  TABLET: 768,

  // Desktop breakpoint (md)
  DESKTOP: 1024,

  // Large desktop (lg)
  LARGE_DESKTOP: 1280,
};

// Webcam popup dimensions
export const WEBCAM_POPUP_DIMENSIONS = {
  // Normal/expanded state
  NORMAL: {
    WIDTH_PX: 240,
    HEIGHT_PX: 200,
  },

  // Minimized state
  MINIMIZED: {
    WIDTH_PX: 60,
    HEIGHT_PX: 60,
  },

  // Drag boundaries (offset from screen edges)
  DRAG_BOUNDARIES: {
    // Max X position: window.innerWidth - NORMAL.WIDTH
    MAX_X_OFFSET: 200,
    // Max Y position: window.innerHeight - NORMAL.HEIGHT
    MAX_Y_OFFSET: 160,
  },
};

/** Space reserved at bottom during exam: keyboard log bar + status bar + margin */
export const EXAM_SESSION_BOTTOM_CHROME_PX = 72;

// Responsive utilities
export const RESPONSIVE = {
  // Mobile breakpoint for use in hooks
  IS_MOBILE_BREAKPOINT: BREAKPOINTS.TABLET,
};

// Z-index layers
export const Z_INDICES = {
  // Background
  BACKGROUND: 0,

  // Default
  DEFAULT: 10,

  // Dropdown/Popover
  DROPDOWN: 100,

  // Modal/Dialog
  MODAL: 1000,

  // Webcam popup
  WEBCAM_POPUP: 1500,

  // Toast notifications
  TOAST: 2000,

  // Tooltip
  TOOLTIP: 3000,
};
