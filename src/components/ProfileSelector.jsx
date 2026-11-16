import { useState, useRef } from 'react';
import './ProfileSelector.css';
// import dummyImage from '../assets/dummy-placeholder.svg';

const PROFILES = [
  {
    id: 'pfp-1',
    code: 'PF-1',
    codeLabel: 'NM-1',
    name: 'dummy-desc',
    subtitle: 'dummy-desc',
    image: '',
  },
  {
    id: 'pfp-2',
    code: 'PF-2',
    codeLabel: 'NM-2',
    name: 'dummy-desc',
    subtitle: 'dummy-desc',
    image: '',
  },
  {
    id: 'pfp-3',
    code: 'PF-3',
    codeLabel: 'NM-3',
    name: 'dummy-desc',
    subtitle: 'dummy-desc',
    image: dummyImage,
  },
  {
    id: 'pfp-4',
    code: 'PF-4',
    codeLabel: 'NM-4',
    name: 'dummy-desc',
    subtitle: 'dummy-desc',
    image: '',
  },
];

export const PROFILE_PRELOAD_ASSETS = PROFILES.map(({ image, name }) => ({
  src: image,
  type: 'image',
  label: name.trim() || 'profile photo',
}));

function playSoftChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (error) {
    console.error('Unable to play the profile selection sound.', error);
  }
}

export default function ProfileSelector({ onSelect }) {
  const [selectedId, setSelectedId] = useState(null);
  const [animatingCardStyle, setAnimatingCardStyle] = useState(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [isDissolving, setIsDissolving] = useState(false);

  const cardRefs = useRef({});

  const handleSelect = (profile) => {
    if (selectedId) return;
    const el = cardRefs.current[profile.id];
    if (!el) return;

    setSelectedId(profile.id);
    playSoftChime();

    // Calculate exact FLIP translation to the absolute center of viewport
    const rect = el.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight / 2 - 28; // slightly above true center for spinner

    const deltaX = targetX - cardCenterX;
    const deltaY = targetY - cardCenterY;

    // Apply smooth glide to center
    setAnimatingCardStyle({
      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.15)`,
      zIndex: 100,
    });

    // Fade in Netflix/Apple spinner after card arrives in center
    setTimeout(() => {
      setShowSpinner(true);
    }, 600);

    // Transition to main canvas
    setTimeout(() => {
      setIsDissolving(true);
      setTimeout(() => {
        onSelect(profile);
      }, 650);
    }, 2200);
  };

  return (
    <div
      className={`profile-gate ${selectedId ? 'has-selection' : ''} ${
        isDissolving ? 'is-dissolving' : ''
      }`}
    >

      <div className="profile-stage">
        {/* Header: WHO'S VISITING? (design.png Frame 1) */}
        <div className={`profile-header ${selectedId ? 'header-vanish' : ''}`}>
          <h1 className="profile-title">dumy-heading</h1>
        </div>

        {/* 4 Profile Cards Row (PF-1, PF-2, PF-3, PF-4 / NM-1, NM-2, NM-3, NM-4) */}
        <div className="profile-row" role="list">
          {PROFILES.map((profile) => {
            const isSelected = selectedId === profile.id;
            const isSibling = selectedId && !isSelected;

            return (
              <div
                key={profile.id}
                ref={(el) => (cardRefs.current[profile.id] = el)}
                className={`profile-card-item ${isSelected ? 'is-selected' : ''} ${
                  isSibling ? 'is-faded' : ''
                }`}
                style={isSelected ? animatingCardStyle : undefined}
                onClick={() => handleSelect(profile)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelect(profile);
                }}
              >
                {/* Rounded square card matching design.png & frame1-2.mp4 */}
                <div className="profile-avatar-box">
                  <img
                    src={profile.image}
                    alt={profile.name}
                    className="profile-photo"
                    loading="eager"
                  />
                 
                </div>

                <div className={`profile-meta-text ${isSelected ? 'meta-fade' : ''}`}>
                  <span className="profile-name-label">{profile.name}</span>
                </div>

                {/* Authentic Netflix / Apple minimalist ring spinner */}
                {isSelected && showSpinner && (
                  <div className="netflix-spinner-container">
                    <svg className="netflix-spinner" viewBox="0 0 50 50">
                      <circle
                        className="spinner-path"
                        cx="25"
                        cy="25"
                        r="20"
                        fill="none"
                        strokeWidth="3.2"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      
      </div>
    </div>
  );
}
