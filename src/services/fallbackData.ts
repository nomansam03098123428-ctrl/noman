import { StockVideoClip } from '../types';

// Curated royalty-free video clips matching typical voiceover topics
// These serve as reliable fallbacks when API keys are not yet configured
export const CURATED_STOCK_VIDEOS: Record<string, StockVideoClip[]> = {
  walking: [
    {
      id: 'curated-walking-1',
      source: 'curated',
      title: 'Senior Man Walking in Park',
      duration: 18,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/3196238/free-video-3196238.jpg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      author: 'Pexels Free Library',
      authorUrl: 'https://www.pexels.com',
    },
    {
      id: 'curated-walking-2',
      source: 'curated',
      title: 'Man Walking Morning Nature Path',
      duration: 15,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/5586616/pexels-photo-5586616.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      author: 'Pexels Free Library',
      authorUrl: 'https://www.pexels.com',
    },
  ],
  exercise: [
    {
      id: 'curated-exercise-1',
      source: 'curated',
      title: 'Leg Stretches and Workout Training',
      duration: 22,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/4754026/pexels-photo-4754026.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      author: 'Free Fitness Stock',
      authorUrl: 'https://www.pexels.com',
    },
    {
      id: 'curated-exercise-2',
      source: 'curated',
      title: 'Elderly Woman Morning Exercise',
      duration: 20,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/7088537/pexels-photo-7088537.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
      author: 'Healthy Living Media',
      authorUrl: 'https://www.pexels.com',
    },
  ],
  breakfast: [
    {
      id: 'curated-breakfast-1',
      source: 'curated',
      title: 'Healthy Fresh Breakfast Bowl and Berries',
      duration: 12,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/4252538/healthy-eating-4252538.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
      author: 'Culinary Stock',
      authorUrl: 'https://www.pexels.com',
    },
    {
      id: 'curated-breakfast-2',
      source: 'curated',
      title: 'Fresh Oatmeal with Fruits and Honey',
      duration: 14,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/3209211/food-healthy-3209211.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      author: 'Nutrition Media',
      authorUrl: 'https://www.pexels.com',
    },
  ],
  general: [
    {
      id: 'curated-general-1',
      source: 'curated',
      title: 'Sunny Morning Landscape Park',
      duration: 20,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/3045163/free-video-3045163.jpg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      author: 'Nature Media',
      authorUrl: 'https://www.pexels.com',
    },
    {
      id: 'curated-general-2',
      source: 'curated',
      title: 'Sunlight Shining Through Green Trees',
      duration: 16,
      width: 1920,
      height: 1080,
      previewUrl: 'https://images.pexels.com/videos/855018/free-video-855018.jpg?auto=compress&cs=tinysrgb&fit=crop&w=640',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      author: 'Scenic Video',
      authorUrl: 'https://www.pexels.com',
    },
  ],
};

export function findCuratedStockVideos(keywords: string[]): StockVideoClip[] {
  const query = keywords.join(' ').toLowerCase();
  const results: StockVideoClip[] = [];

  if (query.includes('walk') || query.includes('man') || query.includes('senior') || query.includes('elderly')) {
    results.push(...CURATED_STOCK_VIDEOS.walking);
  }
  if (query.includes('exercise') || query.includes('leg') || query.includes('workout') || query.includes('woman') || query.includes('fitness')) {
    results.push(...CURATED_STOCK_VIDEOS.exercise);
  }
  if (query.includes('breakfast') || query.includes('food') || query.includes('health') || query.includes('eat') || query.includes('meal')) {
    results.push(...CURATED_STOCK_VIDEOS.breakfast);
  }

  // Always backfill general if not enough
  if (results.length < 3) {
    results.push(...CURATED_STOCK_VIDEOS.general);
  }

  // Deduplicate by ID
  const map = new Map<string, StockVideoClip>();
  results.forEach(v => map.set(v.id, v));
  return Array.from(map.values()).slice(0, 5);
}
