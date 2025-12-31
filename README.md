# Mellowcake AI

Mellowcake AI is a comprehensive AI character chat application featuring persistent memory, dynamic personas, and rich media integration. It combines advanced Large Language Models (LLM), Text-to-Speech (TTS), and Image/Video generation into a unified, responsive Progressive Web App (PWA).

## Features

- **Character Chat**: Interactive chat with AI characters using **Ollama** as the backend.
- **Persistent Memory**: Characters remember past interactions using a vector-enhanced memory system stored in **SQLite**.
- **Dynamic Personas**: Create and manage user personas that can be linked to specific characters for tailored interactions.
- **Lorebook System**: Advanced world-building with "Lore" entries that can be injected into prompts based on context.
- **Text-to-Speech (TTS)**: High-quality, emotive speech generation using **F5-TTS**, optimized for AMD GPUs via **ROCm**.
- **Video Generation**: Create and manage character videos using **ComfyUI** workflows directly from the interface.
- **Progressive Web App (PWA)**: Installable on mobile and desktop devices with secure, persistent authentication.
- **Responsive Design**: Modern, "wow-factor" UI built with **Next.js 16**, **React 19**, and **Tailwind CSS v4**.

## Prerequisites

Before setting up, ensure you have the following installed:

- **Node.js**: Version 20 or higher
- **Python**: Version 3.10 or higher
- **Ollama**: For running LLMs (local or remote)
- **ComfyUI**: For image/video generation (running locally on port 8188 by default)
- **AMD GPU (Optional)**: The TTS service comes pre-configured for AMD ROCm 6.2. Adjustments may be needed for NVIDIA/CPU.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/maociao/mellowcake-ai.git
cd mellowcake-ai
```

### 2. Frontend Setup

Install Node.js dependencies:

```bash
npm install
```

### 3. Environment Configuration

Rename `env.example` file to `.env.local` file in the root directory and configure the following variables (only required if you plan to expose the app to the public using Cloudflare Tunnel):

```bash
# Authentication
AUTH_SECRET="your-secure-random-secret-key" # Used for signing JWTs
BASIC_AUTH_USER="admin"                     # Admin username
BASIC_AUTH_PASS="password"                  # Admin password        # Default SQLite path
```

### 4. Database Setup

Initialize the SQLite database using Drizzle Kit:

```bash
npx drizzle-kit push
```

### 5. TTS Service Setup

The TTS service runs as a separate Python application using F5-TTS.

```bash
cd tts_service
./setup.sh
```

**Note:** The setup script installs PyTorch with ROCm support (AMD). If you are using NVIDIA, change the torch installation command in `tts_service/setup.sh` to use the appropriate CUDA version.

## Running the Application

### Development Mode

1. **Start the Frontend**:
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:3000`.

2. **Start the TTS Service**:
   Open a new terminal:
   ```bash
   cd tts_service
   ./start.sh
   ```
   The TTS API will run on `http://localhost:8000` (or specified port).

3. **External Services**:
   - Ensure **Ollama** is running.
   - Ensure **ComfyUI** is running (default: `http://127.0.0.1:8188`).

### Production & Services

For Linux environments, you can set up systemd services to run the application and ComfyUI automatically.

```bash
./scripts/setup_services.sh
```

This will install and enable:
- `mellowcake-ai.service`: Nginx/Next.js app service
- `comfyui.service`: ComfyUI backend service
- `f5-tts.service`: F5-TTS backend service

## Project Structure

- `src/`
  - `app/` - Next.js App Router pages and API routes.
  - `components/` - React UI components.
  - `lib/` - Shared utilities, database, and auth logic.
  - `services/` - Client-side services for API interaction.
- `tts_service/` - Python-based F5-TTS API server.
- `drizzle/` - Database migration files.
- `scripts/` - Utility scripts for setup and deployment.
- `public/` - Static assets, including PWA manifest and icons.

## Deployment

For deploying with Cloudflare Tunnel, refer to [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md).

## Built With

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [F5-TTS](https://github.com/SWivid/F5-TTS)
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)
