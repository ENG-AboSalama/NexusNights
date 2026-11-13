/**
 * React Hook for Discord Activity Integration
 * Provides easy access to Discord context and functions
 */

import { useEffect, useState } from 'react';
import {
  initializeDiscordSDK,
  getDiscordUser,
  getDiscordChannel,
  getVoiceChannelParticipants,
  subscribeToVoiceStateUpdates,
  setActivity,
} from './DiscordSDK';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null | undefined;
  global_name: string | null | undefined;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id: string | null | undefined;
  name?: string;
}

export interface DiscordParticipant {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null | undefined;
  global_name: string | null | undefined;
}

export interface UseDiscordReturn {
  isReady: boolean;
  isLoading: boolean;
  error: Error | null;
  user: DiscordUser | null;
  channel: DiscordChannel | null;
  participants: DiscordParticipant[];
  updateActivity: (details: string, state?: string) => Promise<void>;
}

/**
 * Hook to access Discord Activity context
 * Automatically initializes SDK and provides user, channel, and participant data
 */
export function useDiscord(): UseDiscordReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [channel, setChannel] = useState<DiscordChannel | null>(null);
  const [participants, setParticipants] = useState<DiscordParticipant[]>([]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      try {
        setIsLoading(true);
        
        // Initialize Discord SDK
        await initializeDiscordSDK();
        
        if (!mounted) return;

        // Get Discord context
        const [discordUser, discordChannel, discordParticipants] = await Promise.all([
          getDiscordUser(),
          getDiscordChannel(),
          getVoiceChannelParticipants(),
        ]);

        if (!mounted) return;

        setUser(discordUser as any);
        setChannel(discordChannel as any);
        setParticipants(discordParticipants as any);
        setIsReady(true);

        // Subscribe to participant updates
        const unsub = subscribeToVoiceStateUpdates((newParticipants) => {
          if (mounted) {
            setParticipants(newParticipants as any);
          }
        });
        unsubscribe = unsub;
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Discord initialization failed'));
          console.error('[useDiscord] Initialization error:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const updateActivity = async (details: string, state?: string) => {
    try {
      await setActivity(details, state);
    } catch (err) {
      console.error('[useDiscord] Failed to update activity:', err);
    }
  };

  return {
    isReady,
    isLoading,
    error,
    user,
    channel,
    participants,
    updateActivity,
  };
}

/**
 * Simpler hook if you only need to know if Discord is ready
 */
export function useDiscordReady(): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initializeDiscordSDK()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error('[useDiscordReady] Initialization error:', err);
        setIsReady(false);
      });
  }, []);

  return isReady;
}
