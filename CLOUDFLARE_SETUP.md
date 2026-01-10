# Setting up Cloudflare Tunnel

This guide will help you expose your local Web App to the internet using your domain via Cloudflare Tunnel.

## Prerequisites

- A Cloudflare account.
- Your domain must be active on Cloudflare (DNS managed by Cloudflare).

## Step 1: Install `cloudflared`

Since you are on Linux, run the following commands to install `cloudflared`:

```bash
# Add Cloudflare's package signing key
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# Add Cloudflare's apt repository
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# Update and install
sudo apt-get update && sudo apt-get install cloudflared
```

*Note: If you are not on Ubuntu/Debian, check the [official downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).*

## Step 2: Authenticate

Run the following command to login. This will open a browser window (or give you a URL) to authorize the tunnel with your Cloudflare account.

```bash
cloudflared tunnel login
```

Select your domain when prompted.

## Step 3: Create a Tunnel

Create a new tunnel. You can name it whatever you want, e.g., `chat-app`.

```bash
cloudflared tunnel create chat-app
```

This will output a **Tunnel ID**. Note this ID.

## Step 4: Configure DNS

Route a subdomain (e.g., `chat.your-domain.com`) to your tunnel.

```bash
# Replace <Tunnel-Name> with 'chat-app' or your chosen name
cloudflared tunnel route dns chat-app chat.your-domain.com
```

## Step 5: Configure the Tunnel

Create a configuration file `config.yml` in `~/.cloudflared/` (or locally).

```bash
nano ~/.cloudflared/config.yml
```

Add the following content (replace `<Tunnel-UUID>` with the ID from Step 3):

```yaml
tunnel: <Tunnel-UUID>
credentials-file: /home/your-username/.cloudflared/<Tunnel-UUID>.json

ingress:
  - hostname: chat.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

## Step 6: Run the Tunnel

Start the tunnel to serve your app:

```bash
cloudflared tunnel run chat-app
```

## Step 7: Keep it Running (Optional)

To run the tunnel as a system service, you need to move your configuration to the system directory `/etc/cloudflared/`.

1. Create the directory and move your files:
```bash
sudo mkdir -p /etc/cloudflared/
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/*.json /etc/cloudflared/
```

2. Update the `credentials-file` path in `/etc/cloudflared/config.yml`:
```bash
sudo nano /etc/cloudflared/config.yml
```
Change:
`credentials-file: /home/your-username/.cloudflared/<Tunnel-UUID>.json`
To:
`credentials-file: /etc/cloudflared/<Tunnel-UUID>.json`

3. Install and start the service:
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
```

Now you can access your app at `https://chat.your-domain.com`!
