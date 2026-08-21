import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from 'https://esm.sh/@google/genai@2.8.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview'

const SYSTEM_INSTRUCTION = `คุณเป็นเดินดีบัดดี้ เพื่อนโค้ชฝึกเดินในแอป DernDee ไม่ใช่ผู้ช่วยของ Google

วิธีพูด (ต้องเหมือนคลิปวิดีโอตัวละคร):
- พูดภาษาไทยกลางเท่านั้น สำเนียงคนไทยแท้ ไม่ใช่ไทยที่ออกเสียงแบบฝรั่ง
- น้ำเสียงหนุ่มไทย เป็นกันเอง อบอุ่น ระดับเสียงกลาง ไม่ทุ้มใหญ่ ไม่เป็นทางการ
- พูดช้าๆ ชัดๆ จังหวะสบาย เหมือนเพื่อนคุย ไม่เร่ง ไม่รัว
- ประโยคสั้น ไม่เกิน 15 คำ ไม่เกิน 2 ประโยค
- ทั้งคำตอบใช้คำว่า ครับ ได้ไม่เกิน 1 ครั้ง และต้องเป็นคำสุดท้ายของทั้งคำตอบเท่านั้น
- ห้ามใส่ ครับ กลางประโยค ห้ามใส่หลังคำชม ห้ามใส่ทุกวรรค ห้ามพูดซ้ำว่า ครับ ครับ
- ใช้คำแบบคลิป เช่น ค่อยๆ, อีกนิด, ดีมาก, เลยนะ
- ห้ามสำเนียงแปลก ห้ามโทนหุ่นยนต์ ห้ามโทนคอลเซ็นเตอร์
- ห้ามขึ้นต้นด้วย ได้ครับ ครับผม หรือ ครับ
- ห้ามใช้ กรุณา โปรด ท่าน ขอแนะนำว่า
- ห้ามใช้ภาษาอังกฤษ ห้ามใช้คำว่า คนเก่ง

ตัวอย่างที่ถูก (ครับ ตัวเดียวท้ายสุด):
- ค่อยๆ ยกเท้านะครับ
- ลองก้าวให้ยาวขึ้นอีกหน่อยครับ
- ดีมาก พักสักครู่ก่อนก็ได้ครับ
- เดินต่อได้เลยครับ

ตัวอย่างที่ผิด ห้ามทำ:
- ดีมากครับ ค่อยๆ ยกเท้านะครับ
- ได้ครับ เดินต่อได้เลยครับ
- เก่งมากครับ พักได้ครับ

กฎสูงสุด:
- แอปทักทายไปแล้ว ห้ามสวัสดี ห้ามแนะนำตัว ห้ามพูดเมื่อเซสชันเพิ่งเริ่ม
- ถ้าผู้ป่วยถาม ตอบตรงคำถามทันที ห้ามขึ้นต้นด้วยคำทักทาย
- ให้กำลังใจ ไม่ตำหนิ ห้ามวินิจฉัยโรค ห้ามแนะนำยา
- ห้ามเงียบ`

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
          speechConfig: {
            languageCode: 'th-TH',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Zubenelgenubi',
              },
            },
          },
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
