# Voiceover → Stock Video Creator

An automated application that turns a user's **voiceover audio file (MP3/WAV)** into a complete, professional stock video synchronized to speech timing.

---

## Features

- **Voiceover-First Input:** Upload an MP3, WAV, M4A, AAC, or FLAC file of any size (100MB, 200MB, 500MB, 1GB+) or duration (30 mins, 1 hr, 2 hrs+).
- **Chunked & Resumable Upload:** Files are streamed in 15MB slices directly from disk via `file.slice()` without loading into browser RAM. If an upload is interrupted, you can resume from where you left off.
- **Persistent State:** Never lose your selected audio or project timeline on re-renders or page refreshes.
- **Intelligent Long Audio Scene Segmentation:** Analyzes voiceovers in sequential windows using AI and FFmpeg silence detection, preserving continuous timestamps across the entire duration (e.g., 5s, 10s, 2s, 14s—never arbitrary fixed lengths).
- **Dual Stock Video Integration:**
  - **Pexels Videos API** (Portrait 9:16 and Landscape 16:9 search)
  - **Pixabay Videos API**
  - **Built-in Curated Fallbacks** so you can test end-to-end even before entering API keys!
- **Interactive Scene Timeline:** Visual, proportional color-coded timeline bar with quick timestamp adjustment controls.
- **Scene Cards:**
  - View spoken transcript & visual search keywords
  - Video preview with loop
  - 3–5 alternative matching video choices
  - "Use this video" one-click switcher
  - "Replace / Search" custom keyword queries
  - **"Download Clip"** button to download trimmed & cropped individual clips for any scene!
- **FFmpeg Server Processing:**
  - Exact duration trimming
  - Intelligent center-cropping (9:16 vertical and 16:9 landscape) without distortion
  - Smooth 0.4s crossfades between clips without altering voiceover audio timing
  - Seamless original continuous voiceover audio muxing
  - Clean video (no captions/subtitles)
- **Synchronized Preview:** Play your voiceover in the browser with live scene transitions before rendering.
- **Download Final Video:** One-click download of the complete rendered MP4 video.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
The server will start on port `3000` (e.g. `http://localhost:3000`).

---

## API Keys Configuration

You can configure your stock video API keys in two ways:

### Option A: In the Website UI (Easiest)
1. Click the **"API Settings"** button in the top-right corner of the website.
2. Enter your **Pexels API Key** and/or **Pixabay API Key**.
3. Click **"Test Pexels"** and **"Test Pixabay"** to verify connection.
4. Click **"Save Keys"**.

### Option B: Environment Variables
Create a `.env` file in the root directory:
```env
PEXELS_API_KEY="your_pexels_key_here"
PIXABAY_API_KEY="your_pixabay_key_here"
```

*Note: Free API keys can be obtained instantly from [Pexels](https://www.pexels.com/api/) and [Pixabay](https://pixabay.com/api/docs/).*

---

## Testing Your First Voiceover in 3 Clicks

1. Open the application in your browser.
2. In the "Upload Voiceover" box, either:
   - Drag & drop your own MP3/WAV file, OR
   - Click the **"Sample (31s)"** button to load a ready-made test voiceover.
3. Click **"Analyze Voiceover"**.
4. The system will create timestamped scenes and automatically match stock videos.
5. Click **"Render Final Video (FFmpeg)"** and then **"Download Final Video"**!
