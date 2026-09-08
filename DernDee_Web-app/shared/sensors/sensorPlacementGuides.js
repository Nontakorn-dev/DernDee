export const SENSOR_PLACEMENT_GUIDES = {
  freeWalk: {
    title: 'ติดเซนเซอร์หน้าแข้ง',
    body: 'เดินอิสระใช้หน้าแข้งอย่างน้อยหนึ่งข้าง ยืนตรงแล้วรอตั้งศูนย์ 3 วินาที แล้วเดินบนทางตรงยาวประมาณ 5 เมตร ไป-กลับ',
    images: [
      { src: '/Position_Sensor/Free_Walk.png' },
    ],
  },
  trailAnkle: {
    title: 'หน้าแข้ง + หลังเท้า',
    body: 'เกมกระดกข้อเท้าและกดปลายเท้าใช้คู่เดียวกันข้างใดข้างหนึ่ง',
    images: [
      { src: '/Position_Sensor/Trail_Quest1.png' },
    ],
  },
  trailKnee: {
    title: 'ต้นขา + หน้าแข้ง',
    body: 'เกมกระโดดใช้คู่ต้นขากับหน้าแข้งข้างเดียวกัน',
    images: [
      { src: '/Position_Sensor/Trail_Quest2.png' },
    ],
  },
  trail: {
    title: 'ป่าจังหวะ',
    note: 'สามารถติดอุปกรณ์เพิ่มเติมบริเวณต้นขา',
    images: [
      { src: '/Position_Sensor/Trail_Quest1.png' },
    ],
  },
};

export function trailGuidesForChapter(chapterId) {
  if (chapterId === 'hip-flexor') {
    return SENSOR_PLACEMENT_GUIDES.trailKnee;
  }
  if (chapterId === 'combined') {
    return SENSOR_PLACEMENT_GUIDES.trail;
  }
  return SENSOR_PLACEMENT_GUIDES.trailAnkle;
}
