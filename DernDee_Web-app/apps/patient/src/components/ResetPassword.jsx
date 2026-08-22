import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { getSupabaseClient } from '@shared/supabase/client.js';
import AuthBrandPanel from '@patient/components/AuthBrandPanel.jsx';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const tapClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2';

const fieldClass =
    'w-full min-h-12 px-4 rounded-2xl border-2 border-sky-200 bg-white text-base text-sky-950 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 lg:landscape:min-h-[52px] lg:landscape:rounded-xl lg:landscape:border-slate-200';

function ResetPassword() {
    const { loading, user } = useUserAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (loading) {
            return;
        }

        setReady(true);
    }, [loading]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');

        if (password.length < 6) {
            setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
            return;
        }

        if (password !== confirmPassword) {
            setError('รหัสผ่านทั้งสองช่องต้องตรงกัน');
            return;
        }

        setIsSaving(true);
        try {
            const supabase = getSupabaseClient();
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) {
                throw updateError;
            }
            setNotice('ตั้งรหัสผ่านใหม่แล้ว');
            window.setTimeout(() => navigate('/home'), 800);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[#D7E6F2] text-slate-900 lg:landscape:bg-[#E8EEF4]"
            style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
        >
            <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 md:portrait:max-w-[33.6rem] md:portrait:px-10 lg:landscape:max-w-[1100px] lg:landscape:px-8">
                <div className="grid w-full gap-5 lg:landscape:min-h-[680px] lg:landscape:grid-cols-[0.92fr_1.08fr] lg:landscape:items-stretch lg:landscape:gap-0 lg:landscape:overflow-hidden lg:landscape:rounded-[32px] lg:landscape:bg-white lg:landscape:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                    <AuthBrandPanel
                        description={(
                            <>
                                ตั้งรหัสผ่านใหม่
                                <br />
                                เพื่อเข้าใช้งานเดินดีต่อได้ทันที
                            </>
                        )}
                    />

                    <section className="flex flex-col justify-center rounded-[32px] border-2 border-sky-200 bg-white p-6 shadow-[0_8px_28px_rgba(14,165,233,0.10)] sm:p-8 md:portrait:min-h-[40rem] md:portrait:px-10 md:portrait:py-14 lg:landscape:min-h-0 lg:landscape:rounded-none lg:landscape:border-0 lg:landscape:shadow-none lg:landscape:px-10 lg:landscape:py-9">
                        <img src={derndeeLogo} alt="DernDee" className="mb-6 h-10 object-contain lg:landscape:hidden" />
                        <h2 className="text-[28px] font-bold tracking-tight text-sky-950">ตั้งรหัสผ่านใหม่</h2>
                        <p className="mb-6 mt-1 text-sky-800/70">กรอกรหัสผ่านใหม่สำหรับบัญชีนี้</p>

                        {!ready ? (
                            <p className="text-sky-800/70">กำลังตรวจสอบลิงก์...</p>
                        ) : !user ? (
                            <div className="space-y-4">
                                <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                    ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์รีเซ็ตใหม่จากหน้าเข้าสู่ระบบ
                                </div>
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className={`min-h-12 w-full rounded-full bg-sky-600 text-base font-bold text-white hover:bg-sky-700 ${tapClass}`}
                                >
                                    กลับไปเข้าสู่ระบบ
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error ? (
                                    <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                        {error}
                                    </div>
                                ) : null}
                                {notice ? (
                                    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                        {notice}
                                    </div>
                                ) : null}
                                <div className="text-left">
                                    <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-sky-950">
                                        รหัสผ่านใหม่
                                    </label>
                                    <input
                                        type="password"
                                        id="new-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className={fieldClass}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <div className="text-left">
                                    <label htmlFor="confirm-new-password" className="mb-2 block text-sm font-semibold text-sky-950">
                                        ยืนยันรหัสผ่าน
                                    </label>
                                    <input
                                        type="password"
                                        id="confirm-new-password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        className={fieldClass}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className={`min-h-12 w-full rounded-full bg-sky-600 text-base font-bold text-white hover:bg-sky-700 disabled:opacity-70 ${tapClass}`}
                                >
                                    {isSaving ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
                                </button>
                            </form>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

export default ResetPassword;
