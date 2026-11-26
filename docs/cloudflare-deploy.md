# Deploying Socratic on Cloudflare Workers Free + D1 (\$0/month)

Everything runs on Cloudflare's **Free Plan** — no credit card required, no Docker, no domain purchase required.

## 1. Create a Free Cloudflare Account
1. Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and verify your email.
2. Copy your **Account ID** (from **Workers & Pages** right sidebar).

## 2. Create Your Free D1 Database
1. In the Cloudflare Dashboard, go to **Storage & Databases → D1 SQL Database → Create**.
2. Name it `socratic-db` and click **Create**.
3. Copy the **Database ID** and paste it into `wrangler.jsonc` (`database_id`).

## 3. Create a Cloudflare API Token for GitHub Actions
1. Go to **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template and also add **Account → D1: Edit**.
3. In **GitHub → `fmalhe/socratic` → Settings → Secrets and variables → Actions → Secrets**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. *(Optional)* Add Actions **Variable** `CLOUDFLARE_DEPLOY_ENABLED=true` to auto-deploy on every push to `main`.

## 4. Deploy & Add Runtime Secrets
1. Run **GitHub → Actions → Deploy to Cloudflare → Run workflow** (applies `migrations/0001_init.sql` to D1 and deploys `https://socratic.<your-subdomain>.workers.dev`).
2. In **Cloudflare Dashboard → Workers & Pages → `socratic` → Settings → Variables and Secrets**, add:
   - `GEMINI_API_KEY` (free tier key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
   - `ALLOWED_IPS` = your home public IP from [ifconfig.me](https://ifconfig.me) (locks the app strictly to your home network, even on free `*.workers.dev`!)
   - *(Optional)* `GOOGLE_TTS_API_KEY` if you want Google Cloud TTS instead of iPad Safari's built-in `speechSynthesis`.

> **Tip:** If you later connect a custom domain, you can also add **Cloudflare Access** (Free) with Policy 1 = `Bypass` for your Home IP and Policy 2 = `Allow` for your parent email (OTP fallback when your ISP rotates your IP).

## 5. Open on iPad Safari
Open `https://socratic.<your-subdomain>.workers.dev` in **Safari on your iPad** (on home Wi-Fi) and tap **Share → Add to Home Screen**.
