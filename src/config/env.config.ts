/**
 * Environment flags
 * Centralized runtime toggles controlled by Vite env variables.
 */

import { resolveProductionFlag } from "./runtime-shared";

// When true, all development bypasses must be hard-disabled.
export const PRODUCTION = resolveProductionFlag({
	nodeEnv: import.meta.env.MODE,
	viteProduction: import.meta.env.VITE_PRODUCTION,
});
