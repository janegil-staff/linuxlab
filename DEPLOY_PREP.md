# Deploy Prep — plain-English checklist (do this before the deploy session)

Goal: get the pieces in place so the actual deploy goes smoothly. Do these in
order. None are hard; a couple involve short waits.

---

## 1. DigitalOcean account
- Sign up at digitalocean.com (you'll add a card; new accounts often get free
  credit).

## 2. Create a droplet (your server)
A "droplet" = a Linux server you rent, running 24/7.
- Create Droplet → choose:
  - **Image:** Ubuntu (latest LTS, e.g. 24.04)
  - **Plan:** Basic → Regular → the **$6/mo (1GB RAM)** option to start.
    (You can resize to 2GB later in 2 clicks if sandboxes need more room.)
  - **Region:** closest to you (e.g. Amsterdam/Frankfurt for Norway)
  - **Authentication:** SSH key if you have one, else password (simpler to start)
- After ~1 minute you get an **IP address** (like 203.0.113.5). Write it down.

## 3. Get a domain (needed for HTTPS — protects passwords)
You DO need this. Without it, logins travel unencrypted. Two options:
- **Free:** duckdns.org → sign in, pick a subdomain (e.g. `qupterm.duckdns.org`),
  point it at your droplet's IP. Done in 2 minutes, free forever.
- **Paid (~$10/yr):** Namecheap/Cloudflare → buy a domain → add an "A record"
  pointing to the droplet's IP.
Either works. DuckDNS is the fast free path for now.

> After pointing the domain at the IP, it can take a few minutes to an hour to
> "propagate". You can check with: `ping yourname.duckdns.org` — when it shows
> your droplet's IP, you're ready.

## 4. Have these ready for the deploy session
- The droplet's **IP address**
- Your **domain** (e.g. qupterm.duckdns.org), pointed at that IP
- Your code on **GitHub** (already done) so the droplet can clone it
- ~1-2 focused hours with a clear head

---

## What happens in the deploy session (so you know the shape)
We'll follow DEPLOY.md together, command by command:
1. SSH into the droplet
2. Install Docker + compose
3. Clone your repo
4. Generate FRESH secrets on the server (not the dev ones)
5. Build the sandbox image
6. Write the Caddyfile with your domain (Caddy auto-fetches the HTTPS cert)
7. `docker compose up -d`
8. Point the app at `https://yourdomain` and test

## Recommended FIRST-deploy settings (safe start)
In the server's `.env`:
- `REGISTRATION_OPEN=false`  ← seed just your own account first
- `SANDBOX_NETWORK=none`     ← safest; turn on later if needed
Prove the whole stack works end-to-end on your domain BEFORE opening
registration to the public. Open it up only once you've watched it run.

---

When steps 1-3 are done and you've got the IP + domain in hand, start a fresh
session and we'll do the deploy. It goes much smoother with these ready.
