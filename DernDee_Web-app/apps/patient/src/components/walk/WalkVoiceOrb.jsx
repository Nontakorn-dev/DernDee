import React from 'react';

const DERN_DEE_LOGO = '/DernDee_logo.png';

const WalkVoiceOrb = ({ isSpeaking, isListening }) => {
  const active = isSpeaking || isListening;

  return (
    <div className="relative flex items-center justify-center py-6 sm:py-8 min-h-[220px] sm:min-h-[260px]">
      <style>{`
        @keyframes walk-voice-ring {
          0% {
            transform: scale(0.9);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        .walk-voice-ring {
          animation: walk-voice-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
      `}</style>

      {active && (
        <>
          <span
            className="walk-voice-ring absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border-2 border-emerald-300/70"
            style={{ animationDelay: '0s' }}
          />
          <span
            className="walk-voice-ring absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border-2 border-teal-300/55"
            style={{ animationDelay: '0.55s' }}
          />
          <span
            className="walk-voice-ring absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border-2 border-cyan-300/40"
            style={{ animationDelay: '1.1s' }}
          />
        </>
      )}

      <div
        className={`relative z-10 flex h-40 w-40 sm:h-48 sm:w-48 items-center justify-center rounded-full bg-white p-8 shadow-xl transition-transform duration-300 ${
          active ? 'scale-105' : 'scale-100'
        }`}
      >
        <img
          src={DERN_DEE_LOGO}
          alt="DernDee"
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
};

export default WalkVoiceOrb;
