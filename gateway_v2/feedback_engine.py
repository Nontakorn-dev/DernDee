"""
DernDee Feedback Engine v2.7 (PT Persona)
=========================================
Uses polite, encouraging language ("Therapist Persona")
combining internal & external cues for best results.
"""

import time
import random

class FeedbackEngine:
    def __init__(self):
        # ==== Thresholds (ค่าเกณฑ์ต่างๆ คงเดิม) ====
        self.thresholds = {
            "min_clearance_m": 0.02,
            "max_trunk_sway_deg": 20.0,
            "min_pitch_deg": 5.0,
            "max_yaw_rate_rps": 3.0,  # ~170 deg/s - increased to filter out normal tibial rotation
            "min_stride_m": 0.20,
            "min_symmetry_pct": 80.0,
            "min_push_off_mps": 0.8,
            "min_cadence_spm": 60.0,
        }
        
        # ==== Therapist Scripts (บทพูดนักกายภาพบำบัด) ====
        # เน้นความสุภาพ ให้กำลังใจ และบอกวิธีแก้ไขที่ชัดเจน
        self.messages = {
            # 🚨 1. Safety (ความปลอดภัย)
            "clearance": {
                # PT: มักบอกให้ "ยกเข่า" เพื่อแก้ปัญหาเท้าลาก
                "voice": "ระวังสะดุดครับ... ลองยกเข่าให้สูงขึ้นอีกนิดนะครับ", 
                "display": "⚠️ ยกเข่าสูงขึ้นอีกนิดครับ"
            },
            "trunk_sway": {
                # PT: เน้นการจัดท่าทาง (Posture)
                "voice": "ตัวเอียงแล้วครับ... พยายามยืดตัวให้ตรงไว้นะครับ",
                "display": "⚠️ ยืดตัวตรงไว้นะครับ"
            },
            "heel_strike": {
                # PT: เน้นการลงน้ำหนักที่ถูกต้อง
                "voice": "ปลายเท้าตกครับ... ลองกระดกปลายเท้า แล้วลงด้วยส้นนะครับ",
                "display": "⚠️ กระดกปลายเท้า ลงด้วยส้น"
            },
            
            # 🛠️ 2. Foundation (จัดท่าทาง)
            "circumduction": {
                # PT: แก้การเดินปัด/เดินวาดขา
                "voice": "อย่าเหวี่ยงขานะครับ... พยายามดึงเข่ามาข้างหน้าตรงๆ ครับ",
                "display": "🦵 ดึงเข่ามาข้างหน้าตรงๆ"
            },
            "short_step": {
                # PT: กระตุ้นให้ก้าวยาวขึ้น
                "voice": "ก้าวสั้นไปนิดครับ... ลองก้าวขาให้ยาวขึ้นอีกหน่อยครับ",
                "display": "📏 ก้าวขายาวขึ้นครับ"
            },
            "asymmetry": {
                # PT: เน้นความสมดุล
                "voice": "ลงน้ำหนักไม่เท่ากันครับ... พยายามเดินซ้ายขวาให้จังหวะเสมอกันนะครับ",
                "display": "⚖️ เดินให้จังหวะสม่ำเสมอ"
            },
            
            # 🚀 3. Performance (ประสิทธิภาพ)
            "push_off": {
                # PT: กระตุ้นแรงส่ง
                "voice": "ไม่มีแรงส่งครับ... ลองใช้ปลายเท้าถีบพื้นส่งตัวหน่อยครับ",
                "display": "🚀 ใช้ปลายเท้าถีบส่ง"
            },
            "cadence": {
                # PT: กระตุ้นความกระฉับกระเฉง
                "voice": "เดินช้าไปนิดครับ... ลองเร่งจังหวะให้กระฉับกระเฉงขึ้นครับ",
                "display": "⚡ เร่งจังหวะหน่อยครับ"
            },
            
            # ✅ Positive (คำชมจากหมอ)
            "excellent": [
                {"voice": "ดีมากครับ! ท่าเดินสวยแล้ว รักษาระดับไว้นะครับ", "display": "✨ ดีมากครับ! ท่าสวยแล้ว"},
                {"voice": "เยี่ยมเลยครับ! ลงน้ำหนักได้ดีมากครับ", "display": "👍 เยี่ยมเลยครับ!"},
                {"voice": "เก่งมากครับ! เดินได้คล่องขึ้นเยอะเลยครับ", "display": "💪 เก่งมากครับ!"},
            ]
        }
        
        # ==== System Config (คงเดิม) ====
        self.last_feedback_type = None
        self.repeat_counter = 0
        self.max_repeat_before_silence = 3
        self.last_feedback_time = 0
        self.cooldown_sec = 4.0
        self.consecutive_good_steps = 0
        self.praise_interval = 8 

    def analyze_step(self, gait_results, side="L", trunk_angle=None):
        """Analyze step and generate feedback with PT persona."""
        if not gait_results:
            return None

        # Check cooldown
        time_since_last = time.time() - self.last_feedback_time
        can_speak = time_since_last >= self.cooldown_sec

        # Extract Metrics
        clearance = gait_results.get("clearance_m", 0.0)
        stride = gait_results.get("stride_length_m", 0.0)
        pitch = gait_results.get("touchdown_pitch_deg", 0.0)
        yaw_rate = gait_results.get("max_yaw_rate_rps", 0.0) 
        push_off = gait_results.get("push_off_velocity_mps", gait_results.get("push_off_power", 0.0))
        
        feedback = None
        
        # --- Logic การตัดสินใจ (Priority) ---
        
        # 1. Safety First
        if clearance > 0 and clearance < self.thresholds["min_clearance_m"]:
            feedback = self._create_feedback("clearance", "DANGER", {"val": f"{clearance*100:.1f}cm"})
        
        elif trunk_angle is not None and abs(trunk_angle) > self.thresholds["max_trunk_sway_deg"]:
            feedback = self._create_feedback("trunk_sway", "DANGER", {"val": f"{abs(trunk_angle):.1f}°"})
            
        elif abs(pitch) < self.thresholds["min_pitch_deg"]:
            feedback = self._create_feedback("heel_strike", "DANGER", {"val": f"{pitch:.1f}°"})
        
        # 2. Foundation
        elif yaw_rate > self.thresholds["max_yaw_rate_rps"]:
            feedback = self._create_feedback("circumduction", "WARNING", {"val": f"{yaw_rate:.2f}r/s"})
            
        elif stride > 0 and stride < self.thresholds["min_stride_m"]:
            feedback = self._create_feedback("short_step", "WARNING", {"val": f"{stride*100:.1f}cm"})
            
        # 3. Performance
        elif push_off > 0 and push_off < self.thresholds["min_push_off_mps"]:
            feedback = self._create_feedback("push_off", "INFO", {"val": f"{push_off:.2f}m/s"})
            
        # 4. Praise
        else:
            self.consecutive_good_steps += 1
            if self.consecutive_good_steps >= self.praise_interval:
                praise = random.choice(self.messages["excellent"])
                feedback = {
                    "text": praise["display"],
                    "voice_text": praise["voice"],
                    "severity": "SUCCESS",
                    "type": "praise",
                    "should_speak": can_speak,
                    "metrics": {}
                }
                self.consecutive_good_steps = 0
        
        # Reset good counter if bad step
        if feedback and feedback.get("severity") in ["DANGER", "WARNING"]:
            self.consecutive_good_steps = 0
            
        # Anti-Spam & Cooldown Management
        if feedback:
            fb_type = feedback.get("type")
            if fb_type == self.last_feedback_type:
                self.repeat_counter += 1
                if self.repeat_counter >= self.max_repeat_before_silence:
                    feedback["should_speak"] = False
            else:
                self.last_feedback_type = fb_type
                self.repeat_counter = 0
                
            if feedback.get("should_speak"):
                self.last_feedback_time = time.time()

        return feedback

    def _create_feedback(self, msg_type, severity, metrics):
        msg = self.messages.get(msg_type, {})
        return {
            "text": msg.get("display", ""),
            "voice_text": msg.get("voice", ""),
            "severity": severity,
            "type": msg_type,
            "should_speak": True,
            "metrics": metrics
        }

    def reset(self):
        self.last_feedback_type = None
        self.repeat_counter = 0
        self.last_feedback_time = 0
        self.consecutive_good_steps = 0
