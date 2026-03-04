/* ============================================================
 * Module: config.js
 * ── KONFIGURASI UTAMA EXTENSION ──────────────────────────────
 *
 * Edit file ini sebelum membangun / merilis extension:
 *   1. API_BASE     → URL backend Purifyt
 *   2. WEBSITE_URL  → URL website / frontend Purifyt
 *   3. VERSION      → harus sama dengan "version" di manifest.json
 *
 * GitHub Release workflow otomatis memperbarui VERSION &
 * manifest.json saat kamu push git tag (misal: git tag v1.2.0).
 * ============================================================ */

const PurifytConfig = Object.freeze({

  // ── Backend API ─────────────────────────────────────────────────
  // URL default server backend Purifyt.
  // Pengguna dapat mengubahnya melalui popup Pengaturan setelah instalasi.
  API_BASE: 'http://localhost:9000',

  // ── Website / Frontend ──────────────────────────────────────────
  // Digunakan untuk link Daftar dan deep-link ke web app.
  WEBSITE_URL: 'http://localhost:3000',

  // ── Versi Extension ─────────────────────────────────────────────
  // HARUS sama dengan field "version" di manifest.json.
  // Release workflow otomatis mensinkronkan keduanya saat build.
  VERSION: '1.0.0'

})
