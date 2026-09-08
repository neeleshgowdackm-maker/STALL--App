# Stall — real backend

A small Node.js app: shop owners sign up with email + password, pay a real ₹1
subscription through Cashfree (verified server-side, not on the honor
system), then manage a list of product links with photos and a background.
Each owner gets a public link at `/s/<their-id>` that shows visitors only
the logo and products — never any account details.

## What you need before deploying

1. **A Cashfree account.** Go to https://www.cashfree.com/, sign up as a
   merchant. You do NOT need to be fully KYC-verified to test — sandbox mode
   works immediately.
   - In the Cashfree dashboard, switch to **Sandbox** mode (toggle top-right).
   - Go to **Developers → API Keys** and copy your **Client ID** and
     **Client Secret**.
   - Later, once you finish KYC and want real money to move, switch to
     **Production** mode and copy the production keys instead.

2. **A place to host it.** [Render.com](https://render.com) has a free tier
   that's simple for this. (Any Node.js host works the same way — Railway,
   Fly.io, a VPS, etc.)

## Step 1 — Get the code online

1. Create a free GitHub account if you don't have one, and create a new
   empty repository (e.g. `stall-app`).
2. Upload every file in this folder into that repository (GitHub's web
   "Add file → Upload files" works fine, no command line needed).

## Step 2 — Deploy on Render

1. Sign up at https://render.com (free).
2. Click **New → Web Service**, connect your GitHub account, and pick the
   `stall-app` repository.
3. Fill in:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Under **Environment Variables**, add these (values from Cashfree and
   your own choices):

   | Key | Value |
   |---|---|
   | `JWT_SECRET` | any long random string (mash the keyboard) |
   | `CASHFREE_ENV` | `sandbox` (switch to `production` later) |
   | `CASHFREE_CLIENT_ID` | from Cashfree dashboard |
   | `CASHFREE_CLIENT_SECRET` | from Cashfree dashboard |
   | `BASE_URL` | leave blank for now — see step 3 |

5. Click **Create Web Service**. Render will build and give you a URL like
   `https://stall-app-xxxx.onrender.com`.

## Step 3 — Finish the URL

1. Copy the URL Render gave you.
2. Go back to your service's **Environment** tab, set `BASE_URL` to that
   exact URL (no trailing slash), and save — Render will redeploy
   automatically.

## Step 4 — Test it

1. Open your Render URL. You'll land on the dashboard — create an account
   with any email + password.
2. You'll be asked to pay ₹1. Since `CASHFREE_ENV` is `sandbox`, no real
   money moves — Cashfree's sandbox checkout gives you test UPI/card details
   to complete a fake payment (check Cashfree's docs for the current sandbox
   test credentials, they're on your dashboard).
3. Once it says paid, add a couple of products with photos and set a
   background.
4. Copy your storefront link (shown at the bottom of the dashboard) and open
   it in a private/incognito window — that's exactly what a visitor sees.

## Step 5 — Go live

1. Finish KYC verification in the Cashfree dashboard (they'll walk you
   through it — usually PAN + bank account details).
2. Switch Cashfree to **Production** mode, get the production Client ID/
   Secret, and update `CASHFREE_ENV=production` and the two key values in
   Render's environment settings.
3. Real ₹1 payments will now actually move money into your Cashfree
   account, which you can withdraw to your bank.

## How data is stored

Everything (accounts, products, logos) lives in one file: `data/db.json` on
the server. That's fine for getting started, but it means:
- If you redeploy on some free hosts, that file can be wiped — check
  whether your host offers a "persistent disk" and attach one at `/data`
  if so (on Render: Settings → Disks).
- For real scale later, this is the piece to swap out for a proper database
  (e.g. Postgres) — everything else (auth, payments, routes) stays the same.

## Local testing (optional, if you're comfortable with a terminal)

```
cp .env.example .env
# fill in .env with your sandbox keys
npm install
npm start
```
Then open http://localhost:3000
