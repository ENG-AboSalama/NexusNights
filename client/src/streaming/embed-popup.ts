/**
 * Embed Popup Helper - AUTOMATIC capture without user selection!
 */

let popupWindow: Window | null = null;
let captureInterval: number | null = null;

export function openEmbedPopup(embedUrl: string): Window | null {
  popupWindow = window.open(embedUrl, '_blank');

  if (!popupWindow) {
    throw new Error('فشل فتح نافذة المشغل. يرجى السماح بالنوافذ المنبثقة.');
  }

  return popupWindow;
}

/**
 * Capture popup screen using getDisplayMedia
 * User selects the player tab for 100% clean digital audio isolation
 */
export async function capturePopupVideo(popup: Window, maxWaitTime = 30000): Promise<MediaStream> {
  console.log('[PopupCapture] Requesting screen capture...');
  
  // Give popup time to load (2 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Show user instruction for clean audio
  alert(
    '🎬 خطوة هامة لضمان صوت نقي ومنع أي تكرار أو صدى:\n\n' +
    '1. في نافذة المشاركة، اختر "تبويب Chrome" (Chrome Tab).\n' +
    '2. اختر تبويب "NexusNight Player Proxy".\n' +
    '3. تأكد من تفعيل "مشاركة صوت التبويب" (Share tab audio).\n\n' +
    '💡 اختيار تبويب Chrome يعزل صوت الفيلم رقمياً ويمنع أي صدى نهائياً!'
  );
  
  try {
    // Request screen capture prioritizing Chrome Tab for isolated digital audio
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        // @ts-ignore - 'browser' hint prioritizes Chrome Tab list
        displaySurface: 'browser',
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // @ts-ignore
        preferCurrentTab: false,
      } as MediaTrackConstraints,
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        channelCount: 2,
        sampleRate: 48000,
      } as MediaTrackConstraints,
    });
    
    // Ensure only one audio track is present (isolate tab audio, discard any mic bleed)
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 1) {
      console.log('[PopupCapture] Multiple audio tracks detected, isolating first audio track');
      for (let i = 1; i < audioTracks.length; i++) {
        audioTracks[i].stop();
        stream.removeTrack(audioTracks[i]);
      }
    }

    console.log('[PopupCapture] ✓ Screen captured!', {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });
    
    // If no audio track (user didn't check share audio or window has no sound), provide silent audio fallback so FFmpeg doesn't fail
    if (stream.getAudioTracks().length === 0) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const dest = ctx.createMediaStreamDestination();
          const silentTrack = dest.stream.getAudioTracks()[0];
          if (silentTrack) {
            stream.addTrack(silentTrack);
            console.log('[PopupCapture] Added silent audio track fallback');
          }
        }
      } catch (e) {
        console.warn('[PopupCapture] Failed to create silent audio track:', e);
      }
    }

    // Detect if user stopped sharing
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        console.warn('[PopupCapture] User stopped screen sharing');
        if (popup && !popup.closed) {
          popup.close();
        }
      });
    }
    
    return stream;
  } catch (err) {
    console.error('[PopupCapture] Failed to capture screen:', err);
    
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        throw new Error('تم إلغاء مشاركة الشاشة. يرجى المحاولة مرة أخرى.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('لم يتم العثور على شاشة للمشاركة.');
      }
    }
    
    throw new Error('فشل التقاط الشاشة: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Clean up popup and intervals
 */
export function cleanupPopup() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  
  if (popupWindow && !popupWindow.closed) {
    popupWindow.close();
    popupWindow = null;
  }
}
