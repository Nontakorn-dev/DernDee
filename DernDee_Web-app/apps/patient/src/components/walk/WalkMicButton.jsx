import React, { useRef } from 'react';
import { Mic } from 'lucide-react';

const HOLD_MS = 450;

const WalkMicButton = ({ active, busy = false, disabled, onPressStart, onPressEnd }) => {
  const downAtRef = useRef(0);
  const holdingRef = useRef(false);
  const startPromiseRef = useRef(Promise.resolve());
  const endingRef = useRef(false);
  const end = () => {
    if (endingRef.current) return;
    endingRef.current = true;
    // Releasing while permission/connection is pending must still stop capture.
    void startPromiseRef.current.then(() => onPressEnd?.()).finally(() => {
      endingRef.current = false;
    });
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-busy={busy}
      onClick={(event) => {
        // Pointer gestures are handled below; keyboard/assistive clicks have detail=0.
        if (event.detail !== 0) return;
        if (active || busy) end();
        else startPromiseRef.current = Promise.resolve(onPressStart?.());
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || endingRef.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        downAtRef.current = Date.now();

        if (active || busy) {
          holdingRef.current = false;
          end();
          return;
        }

        holdingRef.current = true;
        startPromiseRef.current = Promise.resolve(onPressStart?.());
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        const heldMs = Date.now() - downAtRef.current;
        if (heldMs >= HOLD_MS && holdingRef.current) {
          holdingRef.current = false;
          end();
        }
      }}
      onPointerCancel={() => {
        holdingRef.current = false;
        end();
      }}
      className={`walk-controls__btn walk-controls__ask touch-none select-none ${
        active ? 'is-live' : ''
      } ${disabled ? 'is-disabled' : ''}`}
    >
      <Mic className="h-6 w-6 sm:h-7 sm:w-7" />
      <span>
        {active ? 'Listening' : 'Ask'}
      </span>
    </button>
  );
};

export default WalkMicButton;
