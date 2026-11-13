/**
 * Discord Embedded App SDK Integration
 * Initializes Discord Activity and provides hooks for accessing Discord context
 */

import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk';

// Environment detection
const isDiscordEnvironment = typeof window !== 'undefined' && 
  (window.location.pathname.includes('/discord') || 
   window.location.hash.includes('#/discord') ||
   new URLSearchParams(window.location.search).has('frame_id'));

// Initialize appropriate SDK (real or mock for development)
export const discordSdk = isDiscordEnvironment && process.env.DISCORD_CLIENT_ID
  ? new DiscordSDK(process.env.DISCORD_CLIENT_ID)
  : new DiscordSDKMock(
      process.env.DISCORD_CLIENT_ID || 'mock-client-id',
      'mock-guild-id',
      'mock-channel-id',
      'mock-location-id'
    );

let isReady = false;
let readyPromise: Promise<void> | null = null;

/**
 * Initialize Discord SDK and authenticate
 * Call this once when the Discord Activity loads
 */
export async function initializeDiscordSDK(): Promise<void> {
  if (isReady) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    try {
      console.log('[Discord SDK] Initializing...');
      
      // Wait for Discord to be ready
      await discordSdk.ready();
      console.log('[Discord SDK] Ready!');

      // Authenticate the user
      const { code } = await discordSdk.commands.authorize({
        client_id: process.env.DISCORD_CLIENT_ID || 'mock-client-id',
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: [
          'identify',
          'guilds',
          'guilds.members.read',
        ],
      });

      console.log('[Discord SDK] Authorized with code:', code);

      // Exchange code for access token (you'll need a backend endpoint for this)
      // const response = await fetch('/api/discord/token', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ code }),
      // });
      // const { access_token } = await response.json();

      // For now, we'll use the code directly
      // In production, exchange this on your backend and get the access_token
      
      isReady = true;
      console.log('[Discord SDK] Initialization complete');
    } catch (error) {
      console.error('[Discord SDK] Initialization failed:', error);
      // Still mark as ready to allow fallback behavior
      isReady = true;
    }
  })();

  return readyPromise;
}

/**
 * Get the current Discord user
 */
export async function getDiscordUser() {
  if (!isReady) await initializeDiscordSDK();
  
  try {
    // Get the current authenticated user (self)
    const instanceParticipants = await discordSdk.commands.getInstanceConnectedParticipants();
    const participants = instanceParticipants.participants || [];
    
    // Return first participant (current user) if available
    if (participants.length > 0) {
      return participants[0];
    }
    return null;
  } catch (error) {
    console.error('[Discord SDK] Failed to get user:', error);
    return null;
  }
}

/**
 * Get the current Discord channel context
 */
export async function getDiscordChannel() {
  if (!isReady) await initializeDiscordSDK();
  
  try {
    const channel = await discordSdk.commands.getChannel({ channel_id: discordSdk.channelId! });
    return channel;
  } catch (error) {
    console.error('[Discord SDK] Failed to get channel:', error);
    return null;
  }
}

/**
 * Get voice channel participants (for watch party sync)
 */
export async function getVoiceChannelParticipants() {
  if (!isReady) await initializeDiscordSDK();
  
  try {
    const participants = await discordSdk.commands.getInstanceConnectedParticipants();
    return participants.participants || [];
  } catch (error) {
    console.error('[Discord SDK] Failed to get participants:', error);
    return [];
  }
}

/**
 * Subscribe to voice state updates (when users join/leave)
 */
export function subscribeToVoiceStateUpdates(callback: (participants: any[]) => void) {
  if (!isReady) {
    console.warn('[Discord SDK] Not ready, cannot subscribe to voice state updates');
    return () => {};
  }

  let unsubscribe: (() => void) | undefined;

  // Subscribe accepts 3 parameters: event, listener, and channel_id for filtering
  discordSdk.subscribe('VOICE_STATE_UPDATE', async () => {
    const participants = await getVoiceChannelParticipants();
    callback(participants);
  }, { channel_id: discordSdk.channelId || '' }).then((emitter) => {
    // Store unsubscribe function
    unsubscribe = () => emitter.off('VOICE_STATE_UPDATE', () => {});
  }).catch((err) => {
    console.error('[Discord SDK] Failed to subscribe to voice state updates:', err);
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

/**
 * Set Activity (Rich Presence) for the current user
 */
export async function setActivity(details: string, state?: string) {
  if (!isReady) await initializeDiscordSDK();
  
  try {
    await discordSdk.commands.setActivity({
      activity: {
        type: 3, // Watching
        details,
        state,
        timestamps: {
          start: Date.now(),
        },
      },
    });
  } catch (error) {
    console.error('[Discord SDK] Failed to set activity:', error);
  }
}
