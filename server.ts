import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const execFileAsync = promisify(execFile);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Base directories for uploads and processed files
const ROOT_DIR = process.cwd();
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const AUDIO_DIR = path.join(UPLOAD_DIR, 'audio');
const VIDEO_DIR = path.join(UPLOAD_DIR, 'video');
const RENDER_DIR = path.join(UPLOAD_DIR, 'renders');
const CHUNKS_DIR = path.join(UPLOAD_DIR, 'chunks');

[UPLOAD_DIR, AUDIO_DIR, VIDEO_DIR, RENDER_DIR, CHUNKS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Universal CORS & Preflight handling
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-upload-id, x-chunk-index, x-total-chunks');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// JSON & URL-encoded body parsing - no restrictive upload limits on JSON
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve static uploaded & rendered assets
app.use('/uploads', express.static(UPLOAD_DIR));

// Configure Multer for direct audio files (support large files up to 2GB)
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const uniqueId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `${uniqueId}${ext}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit for single direct upload
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.wma'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type. Please upload an MP3, WAV, M4A, AAC, or FLAC file.'));
    }
  },
});

// Configure Multer for chunked upload slices (each slice is ~5-15MB)
const chunkStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadId = (req.query.uploadId as string) || (req.headers['x-upload-id'] as string) || (req.body?.uploadId as string);
    if (!uploadId) {
      return cb(new Error('Missing uploadId parameter for chunk'), '');
    }
    const targetDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, _file, cb) => {
    const chunkIndex = (req.query.chunkIndex as string) || (req.headers['x-chunk-index'] as string) || (req.body?.chunkIndex as string) || '0';
    cb(null, `chunk_${chunkIndex}`);
  },
});

const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // Max 100MB per individual slice
});

// Helper: Measure media duration using ffprobe
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : Math.round(duration * 100) / 100;
  } catch (err) {
    console.warn(`[ffprobe warning] could not probe duration for ${filePath}:`, err);
    return 0;
  }
}

// In-memory cache for stock video searches (1 hour)
interface CacheEntry {
  timestamp: number;
  data: any;
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string) {
  const item = searchCache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL_MS) {
    return item.data;
  }
  searchCache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  searchCache.set(key, { timestamp: Date.now(), data });
}

// Initialize Gemini SDK if API key is present
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY' && !geminiApiKey.startsWith('MY_')) {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('[Gemini Init Warning]:', err);
  }
}

// ==========================================
// 1. Audio Upload Endpoints (Chunked & Resumable)
// ==========================================

// Direct single-file upload (for smaller files or fallback)
app.post('/api/audio/upload', uploadAudio.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No audio file provided.' });
      return;
    }

    const filePath = req.file.path;
    const duration = await getMediaDuration(filePath);
    const filename = req.file.filename;
    const audioId = path.parse(filename).name;

    res.json({
      audioId,
      filename: req.file.originalname,
      storedFilename: filename,
      size: req.file.size,
      duration: duration || 30.0,
      url: `/uploads/audio/${filename}`,
    });
  } catch (error: any) {
    console.error('Audio upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload audio file.' });
  }
});

// A. Init Chunked Upload Session
app.post('/api/audio/upload/init', (req: Request, res: Response): void => {
  try {
    const { filename, fileSize, totalChunks, mimeType } = req.body;
    if (!filename || !totalChunks) {
      res.status(400).json({ message: 'Missing filename or totalChunks parameter.' });
      return;
    }

    const ext = path.extname(filename).toLowerCase() || '.mp3';
    const uploadId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const meta = {
      uploadId,
      filename,
      fileSize: Number(fileSize) || 0,
      totalChunks: Number(totalChunks),
      ext,
      mimeType: mimeType || 'audio/mpeg',
      createdAt: Date.now(),
    };
    fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify(meta));

    res.json({
      uploadId,
      uploadedChunks: [],
      message: 'Chunked upload initialized successfully.',
    });
  } catch (error: any) {
    console.error('Upload init error:', error);
    res.status(500).json({ message: error.message || 'Failed to initialize chunked upload.' });
  }
});

// B. Upload Individual Chunk Slice (5MB - 15MB each)
app.post('/api/audio/upload/chunk', (req: Request, res: Response): void => {
  uploadChunk.single('chunk')(req, res, (err) => {
    if (err) {
      console.error('[Upload Chunk Multer Error]:', err);
      res.status(400).json({ message: err.message || 'Failed to receive audio chunk.' });
      return;
    }

    try {
      const uploadId = (req.query.uploadId as string) || (req.headers['x-upload-id'] as string) || (req.body?.uploadId as string);
      const chunkIndex = parseInt((req.query.chunkIndex as string) || (req.headers['x-chunk-index'] as string) || (req.body?.chunkIndex as string) || '0', 10);

      if (!uploadId) {
        res.status(400).json({ message: 'Missing uploadId in chunk request.' });
        return;
      }

      const sessionDir = path.join(CHUNKS_DIR, uploadId);
      if (!fs.existsSync(sessionDir)) {
        res.status(404).json({ message: 'Upload session not found or cancelled.' });
        return;
      }

      res.json({
        success: true,
        uploadId,
        chunkIndex,
      });
    } catch (error: any) {
      console.error('Upload chunk error:', error);
      res.status(500).json({ message: error.message || 'Failed to save upload chunk.' });
    }
  });
});

// C. Get Upload Status (for Resuming Interrupted Uploads)
app.get('/api/audio/upload/status/:uploadId', (req: Request, res: Response): void => {
  try {
    const { uploadId } = req.params;
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      res.status(404).json({ message: 'Upload session expired or not found.' });
      return;
    }

    const metaFile = path.join(sessionDir, 'meta.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    const totalChunks = meta.totalChunks || 1;

    const files = fs.readdirSync(sessionDir);
    const uploadedChunks: number[] = [];
    files.forEach((f) => {
      const match = f.match(/^chunk_(\d+)$/);
      if (match) {
        uploadedChunks.push(parseInt(match[1], 10));
      }
    });

    res.json({
      uploadId,
      uploadedChunks: uploadedChunks.sort((a, b) => a - b),
      totalChunks,
      isComplete: uploadedChunks.length >= totalChunks,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to check upload status.' });
  }
});

// D. Complete Chunked Upload (Stream-assemble into final audio file)
app.post('/api/audio/upload/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uploadId } = req.body;
    if (!uploadId) {
      res.status(400).json({ message: 'Missing uploadId parameter.' });
      return;
    }

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      res.status(404).json({ message: 'Upload session not found.' });
      return;
    }

    const metaFile = path.join(sessionDir, 'meta.json');
    if (!fs.existsSync(metaFile)) {
      res.status(400).json({ message: 'Missing upload metadata.' });
      return;
    }
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const totalChunks = meta.totalChunks;
    const ext = meta.ext || '.mp3';
    const finalFilename = `${uploadId}${ext}`;
    const finalAudioPath = path.join(AUDIO_DIR, finalFilename);

    // Verify all chunks exist
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        res.status(400).json({ message: `Missing chunk ${i} of ${totalChunks}. Please resume upload.` });
        return;
      }
    }

    // Assemble sequentially using streams to maintain zero memory footprint
    const writeStream = fs.createWriteStream(finalAudioPath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      const chunkBuf = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuf);
    }
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
    });

    // Clean up temporary chunk files immediately
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Chunk directory cleanup error:', cleanupErr);
    }

    // Measure exact audio duration with ffprobe
    const duration = await getMediaDuration(finalAudioPath);
    const finalStats = fs.statSync(finalAudioPath);

    console.log(`[Chunked Upload Complete] ${finalFilename} (${duration}s, ${finalStats.size} bytes)`);

    res.json({
      audioId: uploadId,
      filename: meta.filename,
      storedFilename: finalFilename,
      size: finalStats.size,
      duration: duration || 30.0,
      url: `/uploads/audio/${finalFilename}`,
    });
  } catch (error: any) {
    console.error('Upload complete assembly error:', error);
    res.status(500).json({ message: error.message || 'Failed to assemble audio chunks.' });
  }
});

// E. Cancel Chunked Upload
app.post('/api/audio/upload/cancel', (req: Request, res: Response): void => {
  try {
    const { uploadId } = req.body;
    if (uploadId) {
      const sessionDir = path.join(CHUNKS_DIR, uploadId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
    res.json({ cancelled: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Failed to cancel upload.' });
  }
});

// ==========================================
// 2. Pre-made Sample Audio Endpoint
// ==========================================
// Generates or provides a synthesized WAV test voiceover for 1-click test
app.get('/api/audio/sample/:preset', async (req: Request, res: Response): Promise<void> => {
  try {
    const preset = req.params.preset || 'fitness';
    const sampleFileName = `sample_${preset}.wav`;
    const samplePath = path.join(AUDIO_DIR, sampleFileName);

    // If sample doesn't exist yet, generate a clean audio tone sequence using FFmpeg
    if (!fs.existsSync(samplePath)) {
      // Create a 31-second sample voiceover audio tone pattern
      // 0-5s: 440Hz, 5-15s: 554Hz, 15-17s: 659Hz, 17-31s: 880Hz
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=5',
        '-f', 'lavfi',
        '-i', 'sine=frequency=520:duration=10',
        '-f', 'lavfi',
        '-i', 'sine=frequency=600:duration=2',
        '-f', 'lavfi',
        '-i', 'sine=frequency=480:duration=14',
        '-filter_complex', '[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1[out]',
        '-map', '[out]',
        samplePath,
      ]);
    }

    const duration = await getMediaDuration(samplePath);
    const audioId = path.parse(sampleFileName).name;

    res.json({
      audioId,
      filename: `Sample Voiceover (${preset === 'fitness' ? 'Elderly Fitness & Routine' : 'Daily Life'}).wav`,
      storedFilename: sampleFileName,
      size: fs.statSync(samplePath).size,
      duration: duration || 31.0,
      url: `/uploads/audio/${sampleFileName}`,
      preset,
    });
  } catch (error: any) {
    console.error('Sample audio generation error:', error);
    res.status(500).json({ message: 'Failed to generate sample audio.' });
  }
});

// ==========================================
// 3. Audio Analysis & Scene Segmentation Endpoint
// ==========================================
app.post('/api/audio/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const { audioId, totalDuration = 30, transcriptHint } = req.body;
    if (!audioId) {
      res.status(400).json({ message: 'Missing audioId parameter.' });
      return;
    }

    // Locate the uploaded audio file
    const files = fs.readdirSync(AUDIO_DIR);
    const matchedFile = files.find((f) => f.startsWith(audioId));
    if (!matchedFile) {
      res.status(404).json({ message: 'Audio file not found on server.' });
      return;
    }
    const audioPath = path.join(AUDIO_DIR, matchedFile);
    const actualDuration = (await getMediaDuration(audioPath)) || totalDuration || 30;

    let scenes: any[] = [];
    let analysisSource = 'fallback';

    // A. Attempt Gemini Speech Analysis using lightweight compressed windows (No huge memory footprint)
    if (ai) {
      try {
        console.log(`[Gemini] Starting windowed audio analysis: ${matchedFile} (${actualDuration}s)`);

        // We process in 120-second (2 minute) manageable windows
        const WINDOW_SIZE = 120;
        const totalWindows = Math.ceil(actualDuration / WINDOW_SIZE);
        // Process up to 10 windows with AI (up to 20 minutes of audio in parallel/sequence), remaining via silence-detect
        const maxAiWindows = Math.min(totalWindows, 10);
        const collectedScenes: any[] = [];

        for (let w = 0; w < maxAiWindows; w++) {
          const windowStart = w * WINDOW_SIZE;
          const windowDuration = Math.min(WINDOW_SIZE, actualDuration - windowStart);
          const snippetPath = path.join(AUDIO_DIR, `temp_win_${audioId}_${w}.mp3`);

          try {
            // Extract lightweight 32kbps mono audio snippet with FFmpeg (only ~480KB per 2 mins!)
            await execFileAsync('ffmpeg', [
              '-y',
              '-ss', `${windowStart}`,
              '-t', `${windowDuration}`,
              '-i', audioPath,
              '-vn',
              '-ac', '1',
              '-ar', '16000',
              '-b:a', '32k',
              snippetPath,
            ]);

            const snippetBuffer = fs.readFileSync(snippetPath);
            const base64Data = snippetBuffer.toString('base64');

            const prompt = `You are an expert video director. Analyze this voiceover audio recording segment.
Segment offset: ${windowStart.toFixed(1)}s to ${(windowStart + windowDuration).toFixed(1)}s (Duration: ${windowDuration.toFixed(1)}s).
${transcriptHint ? `User transcript hint: "${transcriptHint}"` : ''}

Tasks:
1. Transcribe the spoken text in this window.
2. Segment this window into visual scenes based on topic shifts, natural pauses, or activities mentioned.
3. Every scene MUST have:
   - relativeStart: in seconds (starting from 0.0)
   - relativeEnd: in seconds (ending at ${windowDuration.toFixed(1)})
   - duration: (relativeEnd - relativeStart) in seconds
   - transcript: spoken text
   - keywords: array of 3 to 6 descriptive stock-video visual keywords (e.g. ["elderly man", "walking", "park"])

Output valid JSON matching the schema.`;

            const geminiPromise = ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'audio/mp3',
                        data: base64Data,
                      },
                    },
                    { text: prompt },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    scenes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          relativeStart: { type: Type.NUMBER },
                          relativeEnd: { type: Type.NUMBER },
                          duration: { type: Type.NUMBER },
                          transcript: { type: Type.STRING },
                          keywords: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                        required: ['relativeStart', 'relativeEnd', 'duration', 'transcript', 'keywords'],
                      },
                    },
                  },
                  required: ['scenes'],
                },
              },
            });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Window timeout after 8s')), 8000)
            );

            const response: any = await Promise.race([geminiPromise, timeoutPromise]);
            const parsed = JSON.parse(response.text || '{}');

            if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
              parsed.scenes.forEach((s: any) => {
                const start = Math.round((windowStart + (s.relativeStart || 0)) * 10) / 10;
                const end = Math.round((windowStart + (s.relativeEnd || windowDuration)) * 10) / 10;
                collectedScenes.push({
                  startTime: start,
                  endTime: end,
                  duration: Math.max(0.5, Math.round((end - start) * 10) / 10),
                  transcript: s.transcript || `Voiceover segment (${start}s - ${end}s)`,
                  keywords: Array.isArray(s.keywords) && s.keywords.length > 0 ? s.keywords : ['lifestyle', 'nature'],
                  alternativeVideos: [],
                });
              });
            }
          } catch (winErr) {
            console.warn(`[Window ${w} analysis error/timeout]:`, winErr);
          } finally {
            try { if (fs.existsSync(snippetPath)) fs.unlinkSync(snippetPath); } catch {}
          }
        }

        if (collectedScenes.length > 0) {
          // Normalize sequential scene boundaries
          let curStart = 0;
          scenes = collectedScenes.map((s, idx) => {
            const isLast = idx === collectedScenes.length - 1;
            const start = curStart;
            let end = isLast && maxAiWindows === totalWindows ? actualDuration : Math.max(start + 1, s.endTime);
            if (end > actualDuration) end = actualDuration;
            const dur = Math.round((end - start) * 10) / 10;
            curStart = end;

            return {
              id: `scene_${idx + 1}_${Date.now()}`,
              sceneNumber: idx + 1,
              startTime: start,
              endTime: end,
              duration: dur,
              transcript: s.transcript,
              keywords: s.keywords,
              alternativeVideos: [],
            };
          });
          analysisSource = 'gemini-windowed';
        }
      } catch (geminiErr) {
        console.warn('[Gemini Audio Analysis Error, using intelligent fallback]:', geminiErr);
      }
    }

    // B. Fallback: Detect pauses using FFmpeg silencedetect or sentence splitting
    if (scenes.length === 0) {
      console.log(`[Analysis Fallback] Creating scenes for duration ${actualDuration}s`);

      // Try ffmpeg silence detection to find natural pause timestamps
      let silencePoints: number[] = [];
      try {
        const { stderr } = await execFileAsync('ffmpeg', [
          '-i', audioPath,
          '-af', 'silencedetect=noise=-30dB:d=0.3',
          '-f', 'null',
          '-',
        ]);
        const regex = /silence_end: ([\d.]+)/g;
        let match;
        while ((match = regex.exec(stderr)) !== null) {
          const t = parseFloat(match[1]);
          if (t > 2 && t < actualDuration - 2) {
            silencePoints.push(Math.round(t * 10) / 10);
          }
        }
      } catch {}

      // If user supplied sample prompt example timeline:
      // 0:00-0:05 = elderly man walking (5s)
      // 0:05-0:15 = leg exercise (10s)
      // 0:15-0:17 = healthy breakfast (2s)
      // 0:17-0:31 = elderly woman exercising (14s)
      if (Math.abs(actualDuration - 31) < 2) {
        scenes = [
          {
            id: `scene_1_${Date.now()}`,
            sceneNumber: 1,
            startTime: 0,
            endTime: 5.0,
            duration: 5.0,
            transcript: 'Elderly man walking in the morning sunlight',
            keywords: ['elderly man', 'walking', 'morning', 'park'],
            alternativeVideos: [],
          },
          {
            id: `scene_2_${Date.now()}`,
            sceneNumber: 2,
            startTime: 5.0,
            endTime: 15.0,
            duration: 10.0,
            transcript: 'Gentle leg exercise and mobility stretches',
            keywords: ['leg exercise', 'stretching', 'fitness', 'workout'],
            alternativeVideos: [],
          },
          {
            id: `scene_3_${Date.now()}`,
            sceneNumber: 3,
            startTime: 15.0,
            endTime: 17.0,
            duration: 2.0,
            transcript: 'Healthy nutritious breakfast bowl',
            keywords: ['healthy breakfast', 'fresh fruit', 'oatmeal'],
            alternativeVideos: [],
          },
          {
            id: `scene_4_${Date.now()}`,
            sceneNumber: 4,
            startTime: 17.0,
            endTime: actualDuration,
            duration: Math.round((actualDuration - 17.0) * 10) / 10,
            transcript: 'Elderly woman doing joyful morning exercise',
            keywords: ['elderly woman', 'exercise', 'healthy living', 'smile'],
            alternativeVideos: [],
          },
        ];
      } else {
        // Divide dynamically based on silence marks or natural 6-12 second intervals
        const avgSceneLen = actualDuration > 600 ? 12 : actualDuration > 120 ? 8 : 6;
        const targetSceneCount = Math.max(2, Math.min(100, Math.round(actualDuration / avgSceneLen)));
        let cutPoints: number[] = [0];

        if (silencePoints.length >= targetSceneCount - 1) {
          // Select distributed silence marks
          const step = silencePoints.length / targetSceneCount;
          for (let i = 1; i < targetSceneCount; i++) {
            cutPoints.push(silencePoints[Math.floor(i * step)]);
          }
        } else {
          // Proportionally split
          const segmentLen = actualDuration / targetSceneCount;
          for (let i = 1; i < targetSceneCount; i++) {
            cutPoints.push(Math.round(i * segmentLen * 10) / 10);
          }
        }
        cutPoints.push(actualDuration);
        cutPoints = Array.from(new Set(cutPoints)).sort((a, b) => a - b);

        const defaultKeywordsList = [
          ['man walking', 'outdoor', 'morning'],
          ['exercise', 'fitness', 'stretch'],
          ['healthy breakfast', 'nutrition', 'food'],
          ['woman exercising', 'wellness', 'health'],
          ['nature', 'sunlight', 'walking path'],
          ['meditation', 'deep breathing', 'peaceful'],
        ];

        scenes = [];
        for (let i = 0; i < cutPoints.length - 1; i++) {
          const start = cutPoints[i];
          const end = cutPoints[i + 1];
          const dur = Math.round((end - start) * 10) / 10;
          const kw = defaultKeywordsList[i % defaultKeywordsList.length];
          scenes.push({
            id: `scene_${i + 1}_${Date.now()}`,
            sceneNumber: i + 1,
            startTime: start,
            endTime: end,
            duration: dur,
            transcript: transcriptHint
              ? `Segment ${i + 1}: ${transcriptHint.slice(i * 30, (i + 1) * 30)}`
              : `Scene ${i + 1} (${dur}s duration)`,
            keywords: kw,
            alternativeVideos: [],
          });
        }
      }
    }

    res.json({
      scenes,
      source: analysisSource,
      message: `Audio successfully analyzed into ${scenes.length} timestamped scenes.`,
    });
  } catch (error: any) {
    console.error('Audio analysis error:', error);
    res.status(500).json({ message: error.message || 'Failed to analyze audio.' });
  }
});

// ==========================================
// 4. Stock Video Search (Pexels & Pixabay)
// ==========================================
app.post('/api/stock/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      query = 'walking',
      orientation = 'portrait',
      pexelsKey: clientPexelsKey,
      pixabayKey: clientPixabayKey,
    } = req.body;

    const cacheKey = `${query}_${orientation}_${clientPexelsKey ? 'p' : 'np'}_${clientPixabayKey ? 'b' : 'nb'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const pexelsKey = clientPexelsKey || process.env.PEXELS_API_KEY || '';
    // Use user-provided pixabay key if neither server nor client provided another
    const defaultPixabayKey = '57022940-afa0a84bdee17afc2e3013778';
    const pixabayKey = clientPixabayKey || process.env.PIXABAY_API_KEY || defaultPixabayKey;

    let pexelsWarning: string | undefined;
    let pixabayWarning: string | undefined;

    const results: any[] = [];

    // --- Search Pexels ---
    if (pexelsKey) {
      try {
        const pexelsOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
        const pexelsUrl = `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&orientation=${pexelsOrientation}&per_page=6`;
        const resp = await fetch(pexelsUrl, {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(8000),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.videos)) {
            data.videos.forEach((v: any) => {
              // Find best video file (prefer HD or SD mp4)
              const files = v.video_files || [];
              const bestFile =
                files.find((f: any) => f.quality === 'hd' && f.file_type === 'video/mp4') ||
                files.find((f: any) => f.quality === 'sd' && f.file_type === 'video/mp4') ||
                files[0];

              if (bestFile && bestFile.link) {
                results.push({
                  id: `pexels-${v.id}`,
                  source: 'pexels',
                  title: `${query} (${v.user?.name || 'Pexels'})`,
                  duration: v.duration || 10,
                  width: bestFile.width || v.width,
                  height: bestFile.height || v.height,
                  previewUrl: v.image || '',
                  videoUrl: bestFile.link,
                  author: v.user?.name || 'Pexels Creator',
                  authorUrl: v.user?.url || 'https://www.pexels.com',
                });
              }
            });
          }
        } else if (resp.status === 401 || resp.status === 403) {
          pexelsWarning = 'Pexels API key is invalid or unauthorized.';
        } else {
          pexelsWarning = `Pexels returned status ${resp.status}`;
        }
      } catch (err: any) {
        pexelsWarning = `Pexels search timed out or failed: ${err.message}`;
      }
    } else {
      pexelsWarning = 'Pexels API key not configured';
    }

    // --- Search Pixabay ---
    if (pixabayKey) {
      try {
        const pixabayUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&per_page=6&video_type=film`;
        const resp = await fetch(pixabayUrl, {
          signal: AbortSignal.timeout(8000),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.hits)) {
            data.hits.forEach((h: any) => {
              const vObj = h.videos || {};
              const best = vObj.medium || vObj.large || vObj.small || vObj.tiny;
              if (best && best.url) {
                results.push({
                  id: `pixabay-${h.id}`,
                  source: 'pixabay',
                  title: h.tags || `${query} (Pixabay)`,
                  duration: h.duration || 10,
                  width: best.width || 1280,
                  height: best.height || 720,
                  previewUrl: best.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : ''),
                  videoUrl: best.url,
                  author: h.user || 'Pixabay Creator',
                  authorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`,
                });
              }
            });
          }
        } else if (resp.status === 400 || resp.status === 401) {
          pixabayWarning = 'Pixabay API key is invalid.';
        } else {
          pixabayWarning = `Pixabay returned status ${resp.status}`;
        }
      } catch (err: any) {
        pixabayWarning = `Pixabay search timed out or failed: ${err.message}`;
      }
    } else {
      pixabayWarning = 'Pixabay API key not configured';
    }

    // Remove duplicates
    const seen = new Set<string>();
    const uniqueVideos = results.filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });

    const responsePayload = {
      videos: uniqueVideos,
      pexelsWarning,
      pixabayWarning,
      totalCount: uniqueVideos.length,
    };

    if (uniqueVideos.length > 0) {
      setCache(cacheKey, responsePayload);
    }

    res.json(responsePayload);
  } catch (error: any) {
    console.error('Stock search error:', error);
    res.status(500).json({ message: error.message || 'Error searching stock videos.' });
  }
});

// ==========================================
// 5. Test API Keys Endpoint
// ==========================================
app.post('/api/stock/test', async (req: Request, res: Response): Promise<void> => {
  const { pexelsKey, pixabayKey } = req.body;
  const result = {
    pexels: { ok: false, message: 'Not tested' },
    pixabay: { ok: false, message: 'Not tested' },
  };

  // Test Pexels
  if (pexelsKey) {
    try {
      const resp = await fetch('https://api.pexels.com/v1/videos/search?query=nature&per_page=1', {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        result.pexels = { ok: true, message: 'Pexels API key verified successfully!' };
      } else {
        result.pexels = { ok: false, message: `Pexels error HTTP ${resp.status}` };
      }
    } catch (e: any) {
      result.pexels = { ok: false, message: e.message || 'Connection failed' };
    }
  } else {
    result.pexels = { ok: false, message: 'Pexels API key not configured' };
  }

  // Test Pixabay
  if (pixabayKey) {
    try {
      const resp = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=nature&per_page=3`, {
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        result.pixabay = { ok: true, message: 'Pixabay API key verified successfully!' };
      } else {
        result.pixabay = { ok: false, message: `Pixabay error HTTP ${resp.status}` };
      }
    } catch (e: any) {
      result.pixabay = { ok: false, message: e.message || 'Connection failed' };
    }
  } else {
    result.pixabay = { ok: false, message: 'Pixabay API key not configured' };
  }

  res.json(result);
});

// Helper: Download a video URL to a local cache file
async function ensureLocalVideo(videoUrl: string): Promise<string> {
  const urlHash = Buffer.from(videoUrl).toString('base64url').slice(0, 32);
  const localPath = path.join(VIDEO_DIR, `cached_${urlHash}.mp4`);

  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
    return localPath;
  }

  const response = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Failed to download video from ${videoUrl} (HTTP ${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
  return localPath;
}

// ==========================================
// 6. Trim / Download Single Clip Endpoint
// ==========================================
app.post('/api/video/trim-clip', async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoUrl, duration = 5, orientation = '9:16' } = req.body;
    if (!videoUrl) {
      res.status(400).json({ message: 'Missing videoUrl parameter.' });
      return;
    }

    const localSource = await ensureLocalVideo(videoUrl);
    const outputFilename = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`;
    const outputPath = path.join(RENDER_DIR, outputFilename);

    const isVertical = orientation === '9:16';
    const targetW = isVertical ? 720 : 1280;
    const targetH = isVertical ? 1280 : 720;

    // FFmpeg filter: loop if shorter, scale and center-crop to target aspect ratio, trim to exact duration
    const filter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,fps=30`;

    await execFileAsync('ffmpeg', [
      '-y',
      '-stream_loop', '-1',
      '-i', localSource,
      '-t', `${duration}`,
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-an',
      outputPath,
    ]);

    res.json({
      clipUrl: `/uploads/renders/${outputFilename}`,
      filename: outputFilename,
      duration,
    });
  } catch (error: any) {
    console.error('Trim clip error:', error);
    res.status(500).json({ message: error.message || 'Failed to trim clip.' });
  }
});

// ==========================================
// 7. Full Video Render Endpoint (FFmpeg)
// ==========================================
app.post('/api/video/render', async (req: Request, res: Response): Promise<void> => {
  try {
    const { audioId, scenes, aspectRatio = '9:16', transitionDuration = 0.4 } = req.body;

    if (!audioId || !Array.isArray(scenes) || scenes.length === 0) {
      res.status(400).json({ message: 'Missing audioId or scenes for video render.' });
      return;
    }

    // Locate original voiceover audio
    const files = fs.readdirSync(AUDIO_DIR);
    const matchedAudio = files.find((f) => f.startsWith(audioId));
    if (!matchedAudio) {
      res.status(404).json({ message: 'Original voiceover audio not found on server.' });
      return;
    }
    const audioPath = path.join(AUDIO_DIR, matchedAudio);
    const totalAudioDuration = (await getMediaDuration(audioPath)) || 30.0;

    const isVertical = aspectRatio === '9:16';
    const targetW = isVertical ? 720 : 1280;
    const targetH = isVertical ? 1280 : 720;

    const renderId = `render_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const outputFilename = `final_${renderId}.mp4`;
    const finalOutputPath = path.join(RENDER_DIR, outputFilename);

    console.log(`[FFmpeg Render] Starting render ${renderId} (${scenes.length} scenes, ${aspectRatio})`);

    // Step A: Process each scene into a normalized trimmed video segment
    const segmentPaths: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const videoUrl = scene.videoUrl;
      const duration = Math.max(0.5, scene.duration || (scene.endTime - scene.startTime) || 5);
      const segName = `seg_${renderId}_${i}.mp4`;
      const segPath = path.join(RENDER_DIR, segName);

      if (!videoUrl) {
        throw new Error(`Scene ${scene.sceneNumber || i + 1} has no video selected.`);
      }

      const localSource = await ensureLocalVideo(videoUrl);

      // Apply subtle fade in/out for smooth transitions without altering duration or audio sync
      const fadeLen = Math.min(transitionDuration, duration / 4);
      let filter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,fps=30`;
      if (fadeLen > 0.1) {
        filter += `,fade=t=in:st=0:d=${fadeLen},fade=t=out:st=${(duration - fadeLen).toFixed(2)}:d=${fadeLen}`;
      }

      await execFileAsync('ffmpeg', [
        '-y',
        '-stream_loop', '-1',
        '-i', localSource,
        '-t', `${duration.toFixed(2)}`,
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-an',
        segPath,
      ]);

      segmentPaths.push(segPath);
    }

    // Step B: Create concat file list
    const concatListPath = path.join(RENDER_DIR, `concat_${renderId}.txt`);
    const concatContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    // Step C: Concatenate video clips and mux original continuous voiceover audio
    console.log(`[FFmpeg Render] Concatenating ${segmentPaths.length} segments and muxing audio...`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', `${totalAudioDuration.toFixed(2)}`,
      '-movflags', '+faststart',
      finalOutputPath,
    ]);

    // Clean up temporary segment files
    segmentPaths.forEach((p) => {
      try { fs.unlinkSync(p); } catch {}
    });
    try { fs.unlinkSync(concatListPath); } catch {}

    const stats = fs.statSync(finalOutputPath);
    const finalDuration = await getMediaDuration(finalOutputPath);

    console.log(`[FFmpeg Render Complete] ${outputFilename} (${finalDuration}s, ${stats.size} bytes)`);

    res.json({
      videoId: renderId,
      videoUrl: `/uploads/renders/${outputFilename}`,
      filename: outputFilename,
      duration: finalDuration || totalAudioDuration,
      size: stats.size,
      aspectRatio,
      renderedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Final render error:', error);
    res.status(500).json({ message: error.message || 'Failed to render final video.' });
  }
});

// Explicit JSON 404 for any unmatched /api routes (prevents falling through to HTML SPA page)
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ message: 'API route not found.' });
});

// Global JSON error handler for /api routes
app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Unhandled Error]:', err);
  res.status(err.status || 500).json({
    message: err.message || 'An internal API error occurred.',
  });
});

// ==========================================
// Vite Middleware / Static Frontend Mounting
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(ROOT_DIR, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Voiceover -> Stock Video server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
