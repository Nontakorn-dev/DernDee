import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from 'https://esm.sh/@google/genai@2.8.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview'

const SYSTEM_INSTRUCTION = `คุณเป็นโค้ชช่วยฝึกเดินสำหรับผู้ป่วยฟื้นฟูหลัง stroke ในแอป DernDee

ภาษา (บังคับ):
- RESPOND IN THAI. YOU MUST RESPOND UNMISTAKABLY IN THAI.
- ห้ามใช้ภาษาอังกฤษเด็ดขาด
- พูดสั้นมาก: ไม่เกิน 1 ประโยค หรือสูงสุด 12 คำ
- ห้ามอธิบายตัวเลขยาว ห้ามถามคำถามกลับ

บทบาท:
- ให้กำลังใจ ไม่ตำหนิ
- ห้ามวินิจฉัยโรค ห้ามแนะนำยา

เมื่อได้รับข้อมูลการเดิน:
- พูดเฉพาะประเด็นสำคัญ (ก้าวสั้น ยกเข่าต่ำ cadence ช้า) หรือเมื่อผู้ป่วยถาม
- ตัวอย่างที่ดี: "ก้าวได้ดีมาก เดินต่อเลย" หรือ "ลองก้าวยาวขึ้นอีกนิดนะครับ"`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Coach unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString()

    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    })
    const token = await ai.authTokens.create({
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveEphemeralParameters: {
        model: LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: SYSTEM_INSTRUCTION,
          outputAudioTranscription: {},
        },
      },
    })

    return new Response(JSON.stringify({
      token: token.name,
      model: LIVE_MODEL,
      userId: user.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: 'Failed to create live session', detail: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
