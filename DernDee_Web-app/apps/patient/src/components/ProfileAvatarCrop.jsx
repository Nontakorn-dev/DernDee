import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEWPORT = 280;
const OUTPUT_SIZE = 512;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const ProfileAvatarCrop = ({ file, onCancel, onConfirm }) => {
  const imageRef = useRef(null);
  const pointerRef = useRef(null);
  const [imageUrl, setImageUrl] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  const minScale = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) {
      return 1;
    }

    return Math.max(VIEWPORT / naturalSize.width, VIEWPORT / naturalSize.height);
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    setOffset((current) => {
      const maxX = Math.max(0, (naturalSize.width * scale - VIEWPORT) / 2);
      const maxY = Math.max(0, (naturalSize.height * scale - VIEWPORT) / 2);
      return {
        x: clamp(current.x, -maxX, maxX),
        y: clamp(current.y, -maxY, maxY),
      };
    });
  }, [naturalSize.height, naturalSize.width, scale]);

  const handleImageLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const nextMinScale = Math.max(VIEWPORT / naturalWidth, VIEWPORT / naturalHeight);
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setScale(nextMinScale);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (event) => {
    if (!pointerRef.current) {
      return;
    }

    const nextX = pointerRef.current.offsetX + (event.clientX - pointerRef.current.x);
    const nextY = pointerRef.current.offsetY + (event.clientY - pointerRef.current.y);
    const maxX = Math.max(0, (naturalSize.width * scale - VIEWPORT) / 2);
    const maxY = Math.max(0, (naturalSize.height * scale - VIEWPORT) / 2);
    setOffset({
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY),
    });
  };

  const stopDrag = () => {
    pointerRef.current = null;
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const nextScale = clamp(scale * (event.deltaY < 0 ? 1.08 : 0.92), minScale, minScale * 4);
    setScale(nextScale);
  };

  const exportCroppedFile = async () => {
    const image = imageRef.current;
    if (!image) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    const ratio = OUTPUT_SIZE / VIEWPORT;
    const drawWidth = naturalSize.width * scale * ratio;
    const drawHeight = naturalSize.height * scale * ratio;
    const drawX = ((VIEWPORT - naturalSize.width * scale) / 2 + offset.x) * ratio;
    const drawY = ((VIEWPORT - naturalSize.height * scale) / 2 + offset.y) * ratio;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });

    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const croppedFile = await exportCroppedFile();
      if (croppedFile) {
        await onConfirm(croppedFile);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <h3 className="text-xl font-extrabold text-gray-800">จัดตำแหน่งรูปโปรไฟล์</h3>
        <p className="mt-1 text-sm text-gray-500">ลากเพื่อเลื่อนรูป ซูมด้วยสองนิ้วหรือสกอลล์ ให้อยู่ในวงกลม</p>

        <div
          className="relative mx-auto mt-5 overflow-hidden rounded-full bg-slate-100 shadow-inner touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onWheel={handleWheel}
        >
          {imageUrl ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              className="pointer-events-none select-none max-w-none"
              style={{
                width: naturalSize.width * scale,
                height: naturalSize.height * scale,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                position: 'absolute',
                left: (VIEWPORT - naturalSize.width * scale) / 2,
                top: (VIEWPORT - naturalSize.height * scale) / 2,
              }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-white/90" />
        </div>

        <label className="mt-4 block text-sm font-semibold text-gray-600">
          ซูม
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step="0.01"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
            className="mt-2 w-full accent-blue-600"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !naturalSize.width}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileAvatarCrop;
