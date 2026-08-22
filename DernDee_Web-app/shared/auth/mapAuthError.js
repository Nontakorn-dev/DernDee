export function isEmailConfirmationError(error) {
    const haystack = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return /email not confirmed|email_not_confirmed|confirm|verified|verification|ยืนยัน/.test(haystack);
}

export function mapAuthError(error) {
    const message = error?.message || String(error || 'เกิดข้อผิดพลาด');
    const code = error?.code || '';
    const haystack = `${code} ${message}`.toLowerCase();

    if (haystack.includes('over_email_send_rate_limit') || haystack.includes('rate limit')) {
        return 'ส่งเมลบ่อยเกินไป กรุณารอประมาณ 1 นาทีแล้วกดส่งรหัสใหม่';
    }

    if (code === 'otp_expired' || haystack.includes('otp_expired')) {
        return 'รหัสหมดอายุแล้ว กดส่งรหัสใหม่ได้';
    }

    if (
        haystack.includes('token has expired or is invalid')
        || haystack.includes('invalid otp')
        || haystack.includes('otp_disabled')
    ) {
        return 'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาตรวจเมลล่าสุด หรือกดส่งรหัสใหม่';
    }

    if (code === 'email_not_confirmed' || haystack.includes('email not confirmed')) {
        return 'บัญชียังไม่ได้ยืนยันอีเมล กรอกรหัส 6 หลักจากเมลเพื่อยืนยัน';
    }

    if (haystack.includes('invalid login credentials') || haystack.includes('invalid_credentials')) {
        return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    }

    if (haystack.includes('user already registered')) {
        return 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ';
    }

    if (haystack.includes('same password')) {
        return 'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม';
    }

    return message;
}

export function isExistingEmailSignUp(data) {
    return Boolean(data?.user) && !data?.session && (data.user.identities?.length ?? 0) === 0;
}
