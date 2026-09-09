import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bluetooth } from 'lucide-react';

const WalkConnectionPills = ({ connected = false }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/device-connection', { state: { returnTo: '/walk-session' } })}
      className={`walk-connection ${connected ? 'is-on' : 'is-off'}`}
      aria-label={connected ? 'อุปกรณ์เชื่อมต่อแล้ว' : 'ไปหน้าเชื่อมต่ออุปกรณ์'}
    >
      <span className="walk-connection__dot" aria-hidden="true" />
      <Bluetooth className="h-4 w-4" strokeWidth={2.4} />
      <span>{connected ? 'Connected' : 'Connect'}</span>
    </button>
  );
};

export default WalkConnectionPills;
