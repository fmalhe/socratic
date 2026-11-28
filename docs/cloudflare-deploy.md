# Deploying Socratic on Cloudflare Workers Free + D1 + R2 (\$0/month)

Everything runs on Cloudflare's **Free Plan** — no credit card required, no Docker, no domain purchase required.

## 1. Create a Free Cloudflare Account
1. Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and verify your email.
2. Copy your **Account ID** (from **Workers & Pages** right sidebar).

## 2. Create Your Free D1 Database & R2 Bucket
1. In the Cloudflare Dashboard, go to **Storage & Databases → D1 SQL Database → Create**.
2. Name it `socratic-db` and click **Create**.
3. Copy the **Database ID** (you'll add it as a GitHub Secret in Step 3 — `wrangler.jsonc` intentionally keeps `"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"` in git and injects the real ID during CI deploy).
4. *(Recommended, 10 GB Free Tier)* Go to **Storage & Databases → R2 Object Storage → Create bucket**, name it `socratic-uploads` (for scanned page photos and cached TTS audio), and click **Create**.

## 3. Create a Cloudflare API Token & Add GitHub Secrets
1. Go to **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template and also add **Account → D1: Edit** (and **Account → Workers R2 Storage: Edit** if binding R2).
3. In **GitHub → `fmalhe/socratic` → Settings → Secrets and variables → Actions → Secrets**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `D1_DATABASE_ID` (from Step 2)
   - `R2_BUCKET_NAME` *(optional Secret or Actions Variable, e.g. `socratic-uploads` — binds the `UPLOADS` R2 bucket at deploy time)*
4. *(Optional)* Add Actions **Variable** `CLOUDFLARE_DEPLOY_ENABLED=true` to auto-deploy on every push to `main`.

## 4. Deploy & Add Runtime Secrets
1. Run **GitHub → Actions → Deploy to Cloudflare → Run workflow** (applies `migrations/0001_init.sql` through `migrations/0006_kid_ux_reading_passage.sql` to D1 and deploys `https://socratic.<your-subdomain>.workers.dev`).
2. In **Cloudflare Dashboard → Workers & Pages → `socratic` → Settings → Variables and Secrets**, add:
   - `GEMINI_API_KEY` (free tier key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — powers both `gemini-4-hydrogen` OCR/Socratic tutoring and primary Gemini 3.8 TTS `gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts` → `gemini-2.5-flash-preview-tts` with `/api/audio/stream` SSE-to-PCM streaming and R2 WAV caching)
   - `ALLOWED_IPS` = your home public IP from [ifconfig.me](https://ifconfig.me) (locks the app strictly to your home network, even on free `*.workers.dev`!)
   - *(Optional)* `GOOGLE_TTS_API_KEY` as a fallback Cloud TTS provider (Google Cloud TTS Wavenet MP3, stored in an isolated fallback R2 namespace) when Gemini 3.8 TTS is temporarily unavailable or rate-limited, before falling back to device `speechSynthesis`.

> **Tip:** If you later connect a custom domain, you can also add **Cloudflare Access** (Free) with Policy 1 = `Bypass` for your Home IP and Policy 2 = `Allow` for your parent email (OTP fallback when your ISP rotates your IP).

## 5. Open on iPad Safari
Open `https://socratic.<your-subdomain>.workers.dev` in **Safari on your iPad** (on home Wi-Fi) and tap **Share → Add to Home Screen**.
