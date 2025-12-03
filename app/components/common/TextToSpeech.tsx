'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface TextToSpeechProps {
  /** The element ID or ref to read text from */
  targetElementId?: string;
  /** Direct text to read (alternative to targetElementId) */
  text?: string;
  /** Custom button label */
  buttonLabel?: string;
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'icon';
  /** Additional CSS styles for the button */
  style?: React.CSSProperties;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech ends */
  onEnd?: () => void;
  /** Callback when speech is paused */
  onPause?: () => void;
  /** Callback when speech resumes */
  onResume?: () => void;
}

/**
 * TextToSpeech Component
 * 
 * A reusable text-to-speech component using the Web Speech API.
 * Can read text from a target element by ID or from direct text input.
 * 
 * Usage:
 * <TextToSpeech targetElementId="mda-executive-summary-container" />
 * or
 * <TextToSpeech text="Your text to read here" />
 */
export const TextToSpeech: React.FC<TextToSpeechProps> = ({
  targetElementId,
  text,
  buttonLabel = 'Listen',
  variant = 'primary',
  style,
  onStart,
  onEnd,
  onPause,
  onResume,
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [rate, setRate] = useState(1.0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check for Web Speech API support
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true);
      
      // Load voices
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length > 0) {
          setVoices(availableVoices);
          // Prefer English voices, with US English as first choice
          const preferredVoice = availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                                  availableVoices.find(v => v.lang === 'en-US') ||
                                  availableVoices.find(v => v.lang.startsWith('en')) ||
                                  availableVoices[0];
          setSelectedVoice(preferredVoice);
        }
      };

      loadVoices();
      
      // Chrome loads voices asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }

    // Cleanup on unmount
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Extract readable text from an element
  const extractTextFromElement = useCallback((elementId: string): string => {
    const element = document.getElementById(elementId);
    if (!element) return '';

    // Clone the element to manipulate without affecting the DOM
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Remove elements that shouldn't be read
    const removeSelectors = [
      'button',
      'script',
      'style',
      '.no-read',
      '[aria-hidden="true"]',
      'svg',
      'canvas',
    ];
    
    removeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get the text content
    let textContent = clone.textContent || clone.innerText || '';
    
    // Clean up the text
    textContent = textContent
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\n+/g, '. ') // Convert newlines to sentence breaks
      .replace(/\s*\.\s*\./g, '.') // Remove double periods
      .replace(/\s*,\s*,/g, ',') // Remove double commas
      .trim();

    return textContent;
  }, []);

  // Handle speech with Chrome bug workaround (chunking long text)
  const speak = useCallback(() => {
    if (!isSupported) return;

    // Get the text to read
    let textToRead = text || '';
    if (targetElementId && !text) {
      textToRead = extractTextFromElement(targetElementId);
    }

    if (!textToRead) {
      alert('No text found to read. Make sure the report content is loaded.');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Chrome bug workaround: Split long text into sentences/chunks
    // Chrome cuts off speech after ~15 seconds or ~300 characters
    const sentences = textToRead.match(/[^.!?]+[.!?]+/g) || [textToRead];
    const chunks: string[] = [];
    let currentChunk = '';
    
    sentences.forEach(sentence => {
      if ((currentChunk + sentence).length < 200) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    });
    if (currentChunk) chunks.push(currentChunk.trim());

    let chunkIndex = 0;
    let isCancelled = false;

    const speakNextChunk = () => {
      if (isCancelled || chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        setIsPaused(false);
        if (!isCancelled) onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utteranceRef.current = utterance;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        if (chunkIndex === 0) {
          setIsSpeaking(true);
          setIsPaused(false);
          onStart?.();
        }
      };

      utterance.onend = () => {
        chunkIndex++;
        // Small pause between chunks
        setTimeout(speakNextChunk, 50);
      };

      utterance.onerror = (event) => {
        if (event.error === 'interrupted') {
          isCancelled = true;
        } else {
          console.error('Speech error:', event.error);
        }
        setIsSpeaking(false);
        setIsPaused(false);
      };

      window.speechSynthesis.speak(utterance);
    };

    speakNextChunk();
  }, [isSupported, text, targetElementId, selectedVoice, rate, extractTextFromElement, onStart, onEnd]);

  // Pause speech
  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      onPause?.();
    }
  }, [onPause]);

  // Resume speech
  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      onResume?.();
    }
  }, [onResume]);

  // Stop speech
  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  // Handle main button click
  const handleButtonClick = useCallback(() => {
    if (isSpeaking && !isPaused) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      speak();
    }
  }, [isSpeaking, isPaused, pause, resume, speak]);

  if (!isSupported) {
    return null; // Don't render anything if not supported
  }

  // Base styles
  const baseButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: variant === 'icon' ? '10px' : '12px 20px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ...style,
  };

  const primaryStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: isSpeaking ? (isPaused ? '#f59e0b' : '#ef4444') : '#8b5cf6',
    color: 'white',
    boxShadow: isSpeaking 
      ? (isPaused ? '0 2px 8px rgba(245, 158, 11, 0.3)' : '0 2px 8px rgba(239, 68, 68, 0.3)')
      : '0 2px 8px rgba(139, 92, 246, 0.3)',
  };

  const secondaryStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: 'transparent',
    color: isSpeaking ? (isPaused ? '#f59e0b' : '#ef4444') : '#8b5cf6',
    border: `2px solid ${isSpeaking ? (isPaused ? '#f59e0b' : '#ef4444') : '#8b5cf6'}`,
  };

  const iconStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: isSpeaking ? (isPaused ? '#fef3c7' : '#fee2e2') : '#f3e8ff',
    color: isSpeaking ? (isPaused ? '#d97706' : '#dc2626') : '#7c3aed',
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    padding: '0',
    justifyContent: 'center',
  };

  const getButtonStyle = () => {
    switch (variant) {
      case 'secondary': return secondaryStyle;
      case 'icon': return iconStyle;
      default: return primaryStyle;
    }
  };

  const getButtonIcon = () => {
    if (isSpeaking && !isPaused) {
      return '⏸️'; // Pause icon
    } else if (isPaused) {
      return '▶️'; // Resume/Play icon
    }
    return '🔊'; // Speaker icon
  };

  const getButtonText = () => {
    if (variant === 'icon') return '';
    if (isSpeaking && !isPaused) return 'Pause';
    if (isPaused) return 'Resume';
    return buttonLabel;
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
      {/* Main Play/Pause Button */}
      <button
        onClick={handleButtonClick}
        style={getButtonStyle()}
        title={isSpeaking ? (isPaused ? 'Resume reading' : 'Pause reading') : 'Read aloud'}
        className="no-print"
      >
        <span style={{ fontSize: variant === 'icon' ? '18px' : '16px' }}>{getButtonIcon()}</span>
        {getButtonText()}
      </button>

      {/* Stop Button (only shown when speaking) */}
      {isSpeaking && (
        <button
          onClick={stop}
          style={{
            ...baseButtonStyle,
            background: '#fee2e2',
            color: '#dc2626',
            padding: variant === 'icon' ? '10px' : '12px 16px',
            borderRadius: variant === 'icon' ? '50%' : '8px',
            width: variant === 'icon' ? '44px' : 'auto',
            height: variant === 'icon' ? '44px' : 'auto',
            justifyContent: 'center',
          }}
          title="Stop reading"
          className="no-print"
        >
          <span style={{ fontSize: variant === 'icon' ? '18px' : '16px' }}>⏹️</span>
          {variant !== 'icon' && 'Stop'}
        </button>
      )}

      {/* Settings Button */}
      <button
        onClick={() => setShowVoiceSelector(!showVoiceSelector)}
        style={{
          ...baseButtonStyle,
          background: showVoiceSelector ? '#e0e7ff' : '#f1f5f9',
          color: showVoiceSelector ? '#4f46e5' : '#64748b',
          padding: '10px',
          borderRadius: '50%',
          width: '44px',
          height: '44px',
          justifyContent: 'center',
        }}
        title="Voice settings"
        className="no-print"
      >
        ⚙️
      </button>

      {/* Voice Settings Dropdown */}
      {showVoiceSelector && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '8px',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '16px',
            minWidth: '280px',
            zIndex: 1000,
          }}
          className="no-print"
        >
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Voice
            </label>
            <select
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = voices.find(v => v.name === e.target.value);
                if (voice) setSelectedVoice(voice);
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              {voices
                .filter(v => v.lang.startsWith('en'))
                .map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Speed: {rate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              <span>Slow</span>
              <span>Normal</span>
              <span>Fast</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextToSpeech;

