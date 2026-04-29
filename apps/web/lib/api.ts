/**
 * Centralized API configuration for Munjiz OS frontend.
 *
 * Set NEXT_PUBLIC_API_URL in .env.local to override the default.
 * Example: NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 *
 * NOTE: NEXT_PUBLIC_API_BASE_URL is the legacy variable name still present
 * in some older pages (e.g. dashboard, home page). Both are supported for
 * now as part of the stability hardening pass. Consolidate to a single
 * variable name in a future cleanup.
 *
 * Technical debt: .env.local currently uses NEXT_PUBLIC_API_BASE_URL.
 * Align to NEXT_PUBLIC_API_URL in a future environment variable cleanup.
 */
export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:8000";
