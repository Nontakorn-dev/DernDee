import React, { useEffect, useRef, useState } from 'react';

const tapClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2';

const OTP_LENGTH = 6;

function digitsFromValue(value) {
    return value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
}

function EmailOtpPanel({
    email,
    title,
    description,
    notice,
    error,
    isVerifying,
    isResending,
    verifyLabel = 'ยืนยันรหัส',
    resendLabel = 'ส่งรหัสใหม่',
    backLabel = 'ย้อนกลับ',
    onVerify,
    onResend,
    onBack,
}) {
    const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(''));
    const inputRefs = useRef([]);

    const code = digits.join('');

    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const applyDigits = (nextDigits) => {
        const padded = [...nextDigits, ...Array(OTP_LENGTH).fill('')].slice(0, OTP_LENGTH);
        setDigits(padded);
        const filled = padded.join('');
        const nextIndex = Math.min(filled.length, OTP_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
        return filled;
    };

    const handleChange = (index, raw) => {
        if (isVerifying) {
            return;
        }

        const nextChar = raw.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[index] = nextChar;
        const filled = applyDigits(next);

        if (nextChar && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }

        if (filled.length === OTP_LENGTH) {
            void onVerify(filled);
        }
    };

    const handleKeyDown = (index, event) => {
        if (event.key === 'Backspace' && !digits[index] && index > 0) {
            event.preventDefault();
            const next = [...digits];
            next[index - 1] = '';
            setDigits(next);
            inputRefs.current[index - 1]?.focus();
        }

        if (event.key === 'ArrowLeft' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }

        if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (event) => {
        event.preventDefault();
        const filled = applyDigits(digitsFromValue(event.clipboardData.getData('text')));
        if (filled.length === OTP_LENGTH) {
            void onVerify(filled);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (isVerifying || code.length !== OTP_LENGTH) {
            return;
        }
        void onVerify(code);
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-[22px] font-bold tracking-tight text-sky-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-sky-800/80">{description}</p>
                <p className="mt-1 break-all text-sm font-semibold text-sky-700">{email}</p>
            </div>

            <ol className="space-y-1.5 rounded-2xl border-2 border-sky-100 bg-sky-50/80 px-4 py-3 text-sm leading-6 text-sky-900">
                <li>1. เปิดเมลจาก <span className="font-semibold">เดินดี &lt;noreply@stepdee.com&gt;</span></li>
                <li>2. ถ้าไม่เจอ ให้ดูที่ Spam, โปรโมชัน หรือ Updates</li>
                <li>3. คัดลอกรหัส 6 หลักล่าสุด แล้วพิมพ์หรือวางด้านล่าง</li>
            </ol>

            {notice ? (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {notice}
                </div>
            ) : null}

            {error ? (
                <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {error}
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
                <fieldset>
                    <legend className="mb-2 block text-sm font-semibold text-sky-950">รหัส 6 หลัก</legend>
                    <div className="flex justify-between gap-2">
                        {digits.map((digit, index) => (
                            <input
                                key={index}
                                ref={(node) => {
                                    inputRefs.current[index] = node;
                                }}
                                type="text"
                                inputMode="numeric"
                                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                aria-label={`หลักที่ ${index + 1}`}
                                maxLength={1}
                                value={digit}
                                onChange={(event) => handleChange(index, event.target.value)}
                                onKeyDown={(event) => handleKeyDown(index, event)}
                                onPaste={handlePaste}
                                className="h-14 w-full rounded-2xl border-2 border-sky-200 bg-white text-center text-2xl font-bold tracking-wider text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                            />
                        ))}
                    </div>
                </fieldset>

                <button
                    type="submit"
                    disabled={isVerifying || code.length !== OTP_LENGTH}
                    className={`inline-flex min-h-12 w-full items-center justify-center rounded-full bg-sky-600 text-base font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-70 ${tapClass}`}
                >
                    {isVerifying ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
                    ) : (
                        verifyLabel
                    )}
                </button>
            </form>

            <button
                type="button"
                onClick={onResend}
                disabled={isResending}
                className={`min-h-11 w-full rounded-full border-2 border-sky-300 bg-white text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-70 ${tapClass}`}
            >
                {isResending ? 'กำลังส่ง...' : resendLabel}
            </button>

            {onBack ? (
                <button
                    type="button"
                    onClick={onBack}
                    className={`min-h-11 w-full text-sm font-semibold text-sky-600 hover:text-sky-800 ${tapClass}`}
                >
                    {backLabel}
                </button>
            ) : null}
        </div>
    );
}

export default EmailOtpPanel;
