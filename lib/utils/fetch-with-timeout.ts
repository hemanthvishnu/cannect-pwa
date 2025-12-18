// =====================================================
// Lie-Fi Protection: Fetch with Timeout
// =====================================================
// Prevents the app from hanging on ghost connections
// Default browser timeout is 60s - we reduce to 10s

const DEFAULT_TIMEOUT = 10000; // 10 seconds

interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

/**
 * Fetch with timeout protection against "Lie-Fi" (ghost connections)
 * 
 * Mobile networks often report as "online" but are so slow they're
 * effectively dead. This wrapper ensures requests fail fast (10s)
 * instead of hanging for the browser's default 60s timeout.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    
    throw error;
  }
}

// =====================================================
// Race: Network vs Cache
// =====================================================
// Returns cached data if network is too slow

/**
 * Race network request against timeout, fallback to cached data
 * 
 * This is the "Diamond Standard" for handling unreliable networks:
 * - Try network first (for fresh data)
 * - If network is too slow (5s default), fail fast
 * - Return cached data so user isn't staring at a blank screen
 */
export async function fetchWithCacheFallback<T>(
  fetchFn: () => Promise<T>,
  getCached: () => Promise<T | null>,
  timeout = 5000
): Promise<{ data: T; fromCache: boolean }> {
  
  // Create a race between network and timeout
  const networkPromise = fetchFn().then(data => ({ 
    data, 
    fromCache: false 
  }));
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Network timeout')), timeout);
  });

  try {
    // Try network first with timeout
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch (error) {
    // Network failed or timed out - try cache
    console.log('[Fetch] Network slow/failed, falling back to cache');
    
    const cached = await getCached();
    if (cached) {
      return { data: cached, fromCache: true };
    }
    
    // No cache available - throw original error
    throw error;
  }
}

// =====================================================
// Network Status Detection
// =====================================================

interface NetworkQuality {
  isOnline: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData?: boolean;
}

/**
 * Get current network quality information
 * 
 * Uses the Network Information API (where available) to determine
 * if the connection is good enough for heavy operations like video upload.
 */
export function getNetworkQuality(): NetworkQuality {
  if (typeof navigator === 'undefined') {
    return { isOnline: true };
  }

  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;

  const quality: NetworkQuality = {
    isOnline: navigator.onLine,
  };

  if (connection) {
    quality.effectiveType = connection.effectiveType;
    quality.downlink = connection.downlink;
    quality.rtt = connection.rtt;
    quality.saveData = connection.saveData;
  }

  return quality;
}

/**
 * Check if network is good enough for heavy operations
 * Returns false for 2g/slow-2g or very high latency connections
 */
export function isNetworkGoodForUpload(): boolean {
  const quality = getNetworkQuality();
  
  if (!quality.isOnline) return false;
  
  // Block on very slow connections
  if (quality.effectiveType === 'slow-2g' || quality.effectiveType === '2g') {
    return false;
  }
  
  // Block if user has data saver enabled
  if (quality.saveData) {
    return false;
  }
  
  // Block on very high latency (> 1 second RTT)
  if (quality.rtt && quality.rtt > 1000) {
    return false;
  }
  
  return true;
}
