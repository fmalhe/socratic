# Deploying Socratic on Cloudflare Containers + R2 + Cloudflare Access

This guide deploys the Java 25 Spring Boot backend, iPad Safari PWA, and MCP Server to **Cloudflare Containers**, persists SQLite in **Cloudflare R2** via **Litestream**, and restricts access to your home network using **Cloudflare Access**.

## Prerequisites
- Cloudflare account on the **Workers Paid** plan (required for Cloudflare Containers).
- A domain managed in Cloudflare DNS (e.g., `yourdomain.com`).
- Docker (for building the `linux/amd64` container image) and Node.js 22+.

---

## 1. Create a Cloudflare R2 Bucket & Scoped API Token
1. In the Cloudflare Dashboard, go to **R2 Object Storage → Create bucket** and name it `socratic-db`.
2. Go to **R2 → Manage R2 API Tokens → Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: `socratic-db`
   - Copy the **Access Key ID**, **Secret Access Key**, and your **S3 Endpoint** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

---

## 2. Configure Your Domain Route & Secrets
1. Edit [cloudflare/wrangler.jsonc](../cloudflare/wrangler.jsonc) and replace `socratic.yourdomain.com` with your real subdomain.
2. Install Wrangler dependencies and push your secrets:
   ```bash
   cd cloudflare
   npm install

   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put LITESTREAM_R2_BUCKET        # e.g. socratic-db
   npx wrangler secret put LITESTREAM_R2_ENDPOINT      # e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   npx wrangler secret put LITESTREAM_ACCESS_KEY_ID
   npx wrangler secret put LITESTREAM_SECRET_ACCESS_KEY
   ```

---

## 3. Deploy
```bash
cd cloudflare
npm run deploy
```
Wrangler builds `../Dockerfile`, pushes the image to Cloudflare's container registry, and deploys the Worker + singleton `SocraticContainer` Durable Object (`max_instances: 1`, sleeps automatically after 15 minutes of inactivity).

---

## 4. Lock Access to Your Home Network (Cloudflare Access)
Because `workers_dev` is `false`, all traffic goes through `https://socratic.yourdomain.com`. Protect it in **Cloudflare Zero Trust → Access → Applications → Add an application → Self-hosted**:

1. **Application domain:** `socratic.yourdomain.com`
2. **Policy 1 — Home Wi-Fi Seamless Bypass:**
   - **Action:** `Bypass`
   - **Include → IP ranges:** `<YOUR_HOME_PUBLIC_IP>/32`
   - Result: Your iPad on home Wi-Fi opens Socratic directly with zero login prompts.
3. **Policy 2 — Family Fallback (when ISP rotates IP):**
   - **Action:** `Allow`
   - **Include → Emails:** your parent email address(es)
   - Result: If your home IP changes (or you're traveling), Cloudflare prompts for a quick 6-digit email OTP.

---

## 5. Install on iPad Safari
1. On your iPad (connected to home Wi-Fi), open `https://socratic.yourdomain.com` in **Safari**.
2. Tap **Share → Add to Home Screen** for a full-screen iPad app with camera capture and audio playback.
