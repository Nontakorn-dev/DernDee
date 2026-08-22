import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { getAuthRedirectUrl, getSupabaseClient } from '@shared/supabase/client.js';
import AuthBrandPanel from '@patient/components/AuthBrandPanel.jsx';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const tapClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2';

const fieldClass =
    'w-full min-h-12 px-4 rounded-2xl border-2 border-sky-200 bg-white text-base text-sky-950 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 lg:landscape:min-h-[52px] lg:landscape:rounded-xl lg:landscape:border-slate-200 lg:landscape:pl-11';

const GoogleMark = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

const isConfirmationError = (message = '') => (
    /confirm|verified|verification|ยืนยัน/i.test(message)
);

const REMEMBER_EMAIL_KEY = 'derndee-remember-email';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const { logIn, profile, resendSignUpConfirmation, signInWithGoogle, user, loading } = useUserAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const savedEmail = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
        if (savedEmail) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
    }, []);

    useEffect(() => {
        if (loading || !user) {
            return;
        }

        if ((profile?.role || user.role) === 'doctor') {
            window.location.assign('/clinic');
            return;
        }

        navigate('/home');
    }, [loading, navigate, profile?.role, user]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        setIsLoading(true);

        try {
            const authenticatedUser = await logIn(email, password);

            if (rememberMe) {
                window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
            } else {
                window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
            }

            if (authenticatedUser?.role === 'doctor') {
                window.location.assign('/clinic');
                return;
            }

            navigate('/home');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setNotice('');
        setIsGoogleLoading(true);

        try {
            await signInWithGoogle();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const handleResendConfirmation = async () => {
        if (!email) {
            setError('กรอกอีเมลก่อนเพื่อส่งลิงก์ยืนยันอีกครั้ง');
            return;
        }

        setError('');
        setNotice('');
        setIsResendingConfirmation(true);

        try {
            await resendSignUpConfirmation(email);
            setNotice('ส่งอีเมลยืนยันใหม่แล้ว เปิดอีเมลล่าสุดแล้วกดลิงก์ในนั้น');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsResendingConfirmation(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('กรอกอีเมลก่อนเพื่อรีเซ็ตรหัสผ่าน');
            return;
        }

        setError('');
        setNotice('');
        setIsResettingPassword(true);

        try {
            const supabase = getSupabaseClient();
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: getAuthRedirectUrl('/login'),
            });

            if (resetError) {
                throw resetError;
            }

            setNotice('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsResettingPassword(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[#D7E6F2] text-slate-900 lg:landscape:bg-[#E8EEF4]"
            style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
        >
            <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:landscape:max-w-[1100px] lg:landscape:px-8">
                <div className="grid w-full gap-5 lg:landscape:min-h-[680px] lg:landscape:grid-cols-[0.92fr_1.08fr] lg:landscape:items-stretch lg:landscape:gap-0 lg:landscape:overflow-hidden lg:landscape:rounded-[32px] lg:landscape:bg-white lg:landscape:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                    <AuthBrandPanel
                        description={(
                            <>
                                เริ่มต้นการฝึกเดินของคุณ
                                <br />
                                เพื่อการฟื้นฟูที่ดีขึ้นในทุกวัน
                            </>
                        )}
                    />

                    <section className="flex flex-col justify-center rounded-[32px] border-2 border-sky-200 bg-white p-6 shadow-[0_8px_28px_rgba(14,165,233,0.10)] sm:p-8 lg:landscape:rounded-none lg:landscape:border-0 lg:landscape:shadow-none lg:landscape:px-10 lg:landscape:py-9">
                        <img src={derndeeLogo} alt="DernDee" className="mb-6 h-10 object-contain lg:landscape:hidden" />
                        <h2 className="text-[28px] font-bold tracking-tight text-sky-950">เข้าสู่ระบบ</h2>
                        <p className="mb-6 mt-1 text-sky-800/70">
                            <span className="lg:landscape:hidden">Sign in with Google or your email</span>
                            <span className="hidden lg:landscape:inline">ลงชื่อเข้าใช้ด้วย Google หรืออีเมลของคุณ</span>
                        </p>

                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isGoogleLoading}
                            className={`inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-2 border-sky-200 bg-sky-50 text-base font-semibold text-sky-950 hover:bg-sky-100 disabled:opacity-70 lg:landscape:rounded-xl lg:landscape:border-slate-200 lg:landscape:bg-white ${tapClass}`}
                        >
                            {isGoogleLoading ? (
                                <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-sky-200 border-t-sky-600" />
                            ) : (
                                <>
                                    <GoogleMark />
                                    Continue with Google
                                </>
                            )}
                        </button>

                        <div className="my-6 flex items-center gap-3">
                            <span className="h-px flex-1 bg-sky-200 lg:landscape:bg-slate-200" />
                            <span className="text-sm font-medium text-sky-800/70">หรือใช้อีเมล</span>
                            <span className="h-px flex-1 bg-sky-200 lg:landscape:bg-slate-200" />
                        </div>

                        {notice ? (
                            <div className="mb-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                {notice}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mb-4 rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                {error}
                            </div>
                        ) : null}

                        {isConfirmationError(error) ? (
                            <button
                                type="button"
                                onClick={handleResendConfirmation}
                                disabled={isResendingConfirmation}
                                className={`mb-4 min-h-11 w-full rounded-full border-2 border-sky-300 bg-white text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-70 ${tapClass}`}
                            >
                                {isResendingConfirmation ? 'กำลังส่ง...' : 'ส่งอีเมลยืนยันอีกครั้ง'}
                            </button>
                        ) : null}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="text-left">
                                <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-sky-950">
                                    <span className="lg:landscape:hidden">Email</span>
                                    <span className="hidden lg:landscape:inline">อีเมล</span>
                                </label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-400 lg:landscape:block" aria-hidden="true" />
                                    <input
                                        type="email"
                                        id="login-email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className={fieldClass}
                                        placeholder="you@email.com"
                                        autoComplete="email"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="text-left">
                                <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-sky-950">
                                    <span className="lg:landscape:hidden">Password</span>
                                    <span className="hidden lg:landscape:inline">รหัสผ่าน</span>
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-400 lg:landscape:block" aria-hidden="true" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="login-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className={`${fieldClass} lg:landscape:pr-12`}
                                        placeholder="รหัสผ่าน"
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        className={`absolute right-3 top-1/2 hidden -translate-y-1/2 text-slate-400 hover:text-slate-600 lg:landscape:inline-flex ${tapClass}`}
                                        aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="hidden items-center justify-between gap-3 lg:landscape:flex">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-sky-700">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(event) => setRememberMe(event.target.checked)}
                                        className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-400"
                                    />
                                    จดจำฉัน
                                </label>
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    disabled={isResettingPassword}
                                    className={`text-sm font-semibold text-sky-600 hover:text-sky-800 disabled:opacity-70 ${tapClass}`}
                                >
                                    {isResettingPassword ? 'กำลังส่ง...' : 'ลืมรหัสผ่าน?'}
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`relative inline-flex min-h-12 w-full items-center justify-center rounded-full bg-sky-600 text-base font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-70 lg:landscape:min-h-[52px] lg:landscape:rounded-xl ${tapClass}`}
                            >
                                {isLoading ? (
                                    <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
                                ) : (
                                    <>
                                        <span className="lg:landscape:hidden">Log in</span>
                                        <span className="hidden lg:landscape:inline">เข้าสู่ระบบ</span>
                                        <ArrowRight className="absolute right-5 hidden h-5 w-5 lg:landscape:block" aria-hidden="true" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-6 flex items-center gap-3 lg:landscape:mt-7">
                            <span className="hidden h-px flex-1 bg-slate-200 lg:landscape:block" />
                            <p className="flex-none text-center text-sm text-sky-800/70">ยังไม่มีบัญชี?</p>
                            <span className="hidden h-px flex-1 bg-slate-200 lg:landscape:block" />
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/register')}
                            className={`mt-2 min-h-12 w-full rounded-full border-2 border-sky-400 bg-white text-base font-semibold text-sky-700 hover:bg-sky-50 lg:landscape:rounded-xl ${tapClass}`}
                        >
                            สมัครสมาชิก
                        </button>

                        <p className="mt-6 hidden items-center justify-center gap-2 text-center text-xs text-slate-500 lg:landscape:flex">
                            <ShieldCheck className="h-4 w-4 text-sky-500" aria-hidden="true" />
                            ระบบของเราปกป้องข้อมูลของคุณด้วยมาตรฐานความปลอดภัยระดับสูง
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default Login;
