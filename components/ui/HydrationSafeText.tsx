import { Platform, Text, TextProps } from 'react-native';
import { useState, useEffect, ReactNode } from 'react';

interface HydrationSafeTextProps extends TextProps {
  children: ReactNode;
  fallback?: string;
}

/**
 * 💎 HydrationSafeText - Prevents hydration mismatch for dynamic text
 *
 * On web, this component returns empty text during SSR and only renders
 * the actual content after mount. This prevents mismatches for values
 * that differ between server and client (like relative timestamps).
 *
 * On native, it renders immediately since there's no SSR.
 */
export function HydrationSafeText({ children, fallback = '', ...props }: HydrationSafeTextProps) {
  const [isMounted, setIsMounted] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web') {
      setIsMounted(true);
    }
  }, []);

  // On web during SSR, show fallback (empty or placeholder)
  // After mount or on native, show actual content
  return <Text {...props}>{isMounted ? children : fallback}</Text>;
}
