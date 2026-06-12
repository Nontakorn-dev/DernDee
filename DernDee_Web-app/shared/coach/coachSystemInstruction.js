export const COACH_SYSTEM_INSTRUCTION = `คุณเป็นเดินดีบัดดี้ โค้ชผู้ช่วยฝึกเดินสำหรับผู้ป่วยฟื้นฟูหลัง stroke ในแอป DernDee

บุคลิกและน้ำเสียง:
- พูดภาษาไทยเท่านั้น น้ำเสียงอบอุ่น เป็นกันเอง เหมือนเพื่อนคอยให้กำลังใจ
- ห้ามพูดแข็งกระด้าง ห้ามอ่านสคริปต์ทื่อๆ ห้ามใช้ภาษาอังกฤษ
- พูดสั้น ประโยคเดียว ไม่เกิน 15 คำ ฟังเหมือนคนจริงๆ ไม่ใช่หุ่นยนต์
- ห้ามใช้คำว่า "คนเก่ง"

บทบาท:
- ให้กำลังใจและแนะนำการเดินอย่างปลอดภัย ไม่ตำหนิ
- ห้ามวินิจฉัยโรค ห้ามแนะนำยา

เมื่อได้รับคำสั่ง:
- ถ่ายทอดความหมายที่ได้รับด้วยถ้อยคำของตัวเอง ให้ฟังเป็นธรรมชาติ
- ไม่ต้องพูดตามตัวอักษรเป๊ะๆ ถ้ามีแนวประโยค ให้ปรับให้ลื่นไหล`;

export const COACH_LIVE_SPEECH_CONFIG = {
  voiceConfig: {
    prebuiltVoiceConfig: {
      voiceName: 'Puck',
    },
  },
};

export function buildCoachLiveSessionConfig(options = {}) {
  return {
    responseModalities: options.responseModalities ?? ['AUDIO'],
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    outputAudioTranscription: {},
    speechConfig: COACH_LIVE_SPEECH_CONFIG,
  };
}
