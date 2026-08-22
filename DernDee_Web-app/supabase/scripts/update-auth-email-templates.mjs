import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'kpbcumaqscgxxmvhmnbq';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
    console.error('Set SUPABASE_ACCESS_TOKEN then run this script.');
    process.exit(1);
}

const root = dirname(fileURLToPath(import.meta.url));
const confirmHtml = readFileSync(join(root, '../email-templates/confirm-signup.html'), 'utf8');
const recoveryHtml = readFileSync(join(root, '../email-templates/reset-password.html'), 'utf8');

const body = {
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
    mailer_subjects_confirmation: 'รหัสเดินดี {{ .Token }} — กรอกในหน้าเว็บเพื่อยืนยันอีเมล',
    mailer_templates_confirmation_content: confirmHtml,
    mailer_subjects_recovery: 'รหัสเดินดี {{ .Token }} — กรอกในหน้าเว็บเพื่อตั้งรหัสผ่านใหม่',
    mailer_templates_recovery_content: recoveryHtml,
};

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
});

if (!response.ok) {
    console.error(response.status, await response.text());
    process.exit(1);
}

console.log('Updated auth email templates: 6-digit OTP, 1 hour expiry.');
