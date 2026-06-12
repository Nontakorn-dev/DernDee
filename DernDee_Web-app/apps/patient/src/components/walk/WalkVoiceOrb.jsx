import React from 'react';

const DERN_DEE_LOGO = '/DernDee_logo.png';

const WalkVoiceOrb = ({ isSpeaking, isListening }) => {
  const active = isSpeaking || isListening;

  return (
    <div className="relative flex h-full w-full min-h-[200px] max-h-[min(56vh,480px)] items-center justify-center">
      <style>{`
        @keyframes walk-voice-ring {
          0% {
            transform: scale(0.88);
            opacity: 0.55;
          }
          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }

        @keyframes walk-orb-float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        .walk-voice-ring {
          animation: walk-voice-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }

        .walk-orb-float {
          animation: walk-orb-float 4s ease-in-out infinite;
        }
      `}</style>

      {active && (
        <>
          <span
            className="walk-voice-ring absolute aspect-square w-[min(72vw,340px)] rounded-full border-2 border-emerald-300/70 lg:w-[min(42vw,380px)]"
            style={{ animationDelay: '0s' }}
          />
          <span
            className="walk-voice-ring absolute aspect-square w-[min(72vw,340px)] rounded-full border-2 border-teal-300/55 lg:w-[min(42vw,380px)]"
            style={{ animationDelay: '0.55s' }}
          />
          <span
            className="walk-voice-ring absolute aspect-square w-[min(72vw,340px)] rounded-full border-2 border-cyan-300/40 lg:w-[min(42vw,380px)]"
            style={{ animationDelay: '1.1s' }}
          />
        </>
      )}

      <div
        className={`walk-orb-float relative z-10 flex aspect-square w-[min(58vw,280px)] items-center justify-center rounded-full border border-white/80 bg-white p-[min(8vw,2.5rem)] shadow-[0_20px_60px_rgba(37,99,235,0.18)] transition-transform duration-300 lg:w-[min(34vw,320px)] ${
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
