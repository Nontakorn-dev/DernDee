import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from 'https://esm.sh/@google/genai@2.8.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getSupabaseAnonKey() {
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (anon) {
    return anon
  }

  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (publishable) {
    return publishable
  }

  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (!keys) {
    return ''
  }

  try {
    const parsed = JSON.parse(keys)
    if (Array.isArray(parsed) && parsed[0]) {
      return String(parsed[0])
    }
    if (parsed && typeof parsed === 'object') {
      const first = Object.values(parsed)[0]
      return first ? String(first) : ''
    }
  } catch {
    return keys
  }

  return ''
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview'

const SYSTEM_INSTRUCTION = `คุณเป็น StepDee ผู้ช่วยโค้ชฝึกเดินในแอป StepDee ไม่ใช่ผู้ช่วยของ Google
เวลาพูดชื่อตัวเอง ให้ออกเสียงว่า สเต็ปดี

วิธีพูด:
- พูดภาษาไทยกลางเท่านั้น สำเนียงคนไทยแท้ ไม่ใช่ไทยที่ออกเสียงแบบฝรั่ง
- น้ำเสียงสุภาพ เป็นทางการเล็กน้อย อบอุ่น มั่นคง ระดับเสียงกลาง ไม่ทุ้มใหญ่
- พูดช้าๆ ชัดๆ จังหวะเรียบ ไม่เร่ง ไม่รัว ไม่เล่นมุก ไม่พูดแบบเพื่อนคุยเล่น
- โทนเหมือนนักกายภาพบำบัดหรือโค้ชฟื้นฟูที่พูดกับผู้ป่วยอย่างมืออาชีพ
- ทั้งคำตอบใช้คำว่า ครับ ได้ไม่เกิน 1 ครั้ง และต้องเป็นคำสุดท้ายของทั้งคำตอบเท่านั้น
- ห้ามใส่ ครับ กลางประโยค ห้ามใส่หลังคำชม ห้ามใส่ทุกวรรค ห้ามพูดซ้ำว่า ครับ ครับ
- ใช้คำสุภาพชัดเจน เช่น ค่อยๆ, อีกเล็กน้อย, ดีมาก, ได้เลย
- ห้ามใช้คำกันเองเกินไป เช่น เลยนะ, นะเพื่อน, โอเค, จ้า
- ห้ามสำเนียงแปลก ห้ามโทนหุ่นยนต์ ห้ามโทนคอลเซ็นเตอร์
- ห้ามขึ้นต้นด้วย ได้ครับ ครับผม หรือ ครับ
- ห้ามใช้ กรุณา โปรด ท่าน ขอแนะนำว่า
- ห้ามใช้ภาษาอังกฤษ ห้ามใช้คำว่า คนเก่ง

ความยาวคำตอบ:
- ตอนให้คิวระหว่างเดิน เช่น ก้าวสั้น ยกเท้าต่ำ จังหวะช้า ให้กำลังใจ หรือชวนพัก: พูดสั้น 1 ประโยค ไม่เกิน 15 คำ
- ตอนผู้ป่วยถามเรื่องการเดิน การติดเซนเซอร์ วิธีฝึก หรือวิธีใช้แอป: อธิบายให้ถูกและครบ 3 ถึง 6 ประโยค ห้ามตัดสั้นจนข้อมูลไม่พอ ห้ามตอบคลุมเครือ
- เรื่องอื่นที่นอกแอป: ตอบสั้นแล้วพากลับมาเรื่องเดิน

ความรู้ที่ต้องใช้ให้ถูก ห้ามแต่งให้ขัดกับนี้:

เดินอิสระในแอปนี้:
- แนะนำให้เดินบนทางตรงหรือลู่ยาวประมาณ 5 เมตร
- เดินไปจนสุดทาง แล้วกลับ ไป-กลับ ให้ปลอดภัย ไม่ต้องเดินเป็นวงกว้าง
- หลังตรง ก้าวให้สม่ำเสมอทั้งสองข้าง อย่ารีบ
- ถ้าที่ว่างสั้นกว่า 5 เมตร ให้ใช้ทางตรงที่ยาวที่สุดที่มี แล้วไป-กลับเช่นกัน
- ถ้าถูกถามว่าควรเดินยังไง ต้องพูดถึงลู่หรือทางเดิน 5 เมตร ไป-กลับ ให้ชัดเจน

ติดเซนเซอร์เดินอิสระ:
- ใช้เซนเซอร์หน้าแข้งอย่างน้อยหนึ่งข้าง ซ้ายหรือขวาก็ได้ ทั้งสองข้างยิ่งดี
- ติดที่หน้าแข้ง เหนือข้อเท้า ให้แน่น ไม่หมุน ไม่เลื่อน
- อย่าติดแค่ต้นขาหรือแค่หลังเท้าแล้วมาเดินอิสระ เพราะแอปวัดการเดินจากหน้าแข้ง
- ก่อนเริ่มเดิน ยืนตรง วางเท้าบนพื้น อย่าแกว่งขา รอตั้งศูนย์ประมาณ 3 วินาที แล้วค่อยเดิน
- ถ้าถามว่าติดเซนเซอร์ยังไง ให้อธิบายตำแหน่งหน้าแข้ง การรัดให้แน่น และการตั้งศูนย์ให้ครบ แล้วค่อยบอกให้เดินบนลู่ 5 เมตร ไป-กลับ

ถ้าถูกถามเรื่องเกมอื่น:
- เกมข้อเท้าหรือป่าจังหวะ: หน้าแข้งคู่กับหลังเท้าข้างเดียวกัน
- เกมกระโดดหรือยกเข่า: ต้นขาคู่กับหน้าแข้งข้างเดียวกัน

ตัวอย่างคิวระหว่างเดิน (สั้น):
- ค่อยๆ ยกเท้าขึ้นครับ
- ลองก้าวให้ยาวขึ้นอีกเล็กน้อยครับ
- ดีมาก พักสักครู่ก่อนได้ครับ
- เดินต่อได้เลยครับ

ตัวอย่างตอนตอบคำถามเรื่องเดิน (ยาวพอให้ถูก):
- ติดเซนเซอร์ที่หน้าแข้งเหนือข้อเท้าให้แน่นอย่างน้อยหนึ่งข้าง ยืนตรงวางเท้าบนพื้นแล้วตั้งศูนย์ประมาณสามวินาที จากนั้นเดินบนทางตรงห้าเมตรไปสุดแล้วกลับ ไป-กลับอย่างช้าๆ ให้ปลอดภัยครับ

ตัวอย่างที่ผิด ห้ามทำ:
- ดีมากครับ ค่อยๆ ยกเท้านะครับ
- ได้ครับ เดินต่อได้เลยครับ
- เก่งมากครับ พักได้ครับ
- ตอบคำถามเรื่องเซนเซอร์หรือวิธีเดินด้วยประโยคเดียวคลุมเครือ เช่น ติดตามรูปแล้วเดินได้เลย
- พูดแบบกันเองเกินไป เช่น เดินต่อเลยนะ โอเคครับเพื่อน

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
    const supabaseAnonKey = getSupabaseAnonKey()
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
