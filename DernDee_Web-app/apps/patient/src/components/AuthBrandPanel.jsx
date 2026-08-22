import derndeeLogo from '@shared/assets/images/derndee-logo.png';
import { Activity, Footprints, Heart, Plus, Shield } from 'lucide-react';

const LOGIN_AVATAR_SRC = '/login-avatar.png';

const AuthBrandPanel = ({ description }) => (
    <section className="relative hidden min-h-[620px] overflow-hidden rounded-[32px] bg-gradient-to-br from-[#2563EB] via-[#38BDF8] to-[#2DD4BF] shadow-[0_14px_40px_rgba(14,165,233,0.28)] lg:landscape:flex lg:landscape:h-full lg:landscape:min-h-0 lg:landscape:rounded-none lg:landscape:shadow-none">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -right-10 -top-8 h-44 w-44 rounded-full bg-cyan-100/20" />
        <div className="absolute bottom-36 left-8 h-28 w-28 rounded-full bg-white/10" />
        <Activity className="absolute right-10 top-24 h-[72px] w-[72px] text-white/15" aria-hidden="true" />
        <Heart className="absolute left-8 top-56 h-14 w-14 text-white/10" aria-hidden="true" />
        <Footprints className="absolute right-24 top-44 h-12 w-12 text-white/10" aria-hidden="true" />
        <Shield className="absolute left-[42%] top-32 h-16 w-16 text-white/10" aria-hidden="true" />
        <Plus className="absolute right-16 top-[46%] h-8 w-8 text-white/20" aria-hidden="true" />
        <Plus className="absolute left-16 top-48 h-6 w-6 text-white/15" aria-hidden="true" />
        <Plus className="absolute right-8 bottom-40 h-5 w-5 text-white/20" aria-hidden="true" />

        <div className="relative z-10 flex h-full w-full flex-col px-8 pt-8 lg:landscape:px-10 lg:landscape:pt-10">
            <div className="w-fit rounded-full bg-white px-4 py-2 shadow-sm">
                <img src={derndeeLogo} alt="DernDee" className="h-8 object-contain" />
            </div>
            <div className="mt-8 max-w-[280px]">
                <h1 className="text-[52px] font-extrabold leading-[0.95] tracking-tight text-white">Therapy</h1>
                <p className="mt-3 text-[22px] font-semibold leading-snug text-white">กายภาพบำบัด</p>
                <p className="mt-4 text-[15px] font-medium leading-7 text-white/90">{description}</p>
            </div>
        </div>

        <img
            src={LOGIN_AVATAR_SRC}
            alt=""
            className="pointer-events-none absolute bottom-0 right-0 z-10 h-[68%] w-auto max-w-[96%] object-contain object-bottom select-none drop-shadow-2xl"
        />
    </section>
);

export default AuthBrandPanel;
